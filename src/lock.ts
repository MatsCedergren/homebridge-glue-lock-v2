// Modified by Mats Cedergren, 2026: Homebridge v2 fork (homebridge-glue-lock-v2).
// Uses onGet/onSet handlers, keeps target state separate from current state,
// maps connectionStatus to "Not responding" and polls with backoff.
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { GlueHomePlatformPlugin } from './platform';
import { GlueApi } from './api/client';
import {
  Lock, LockOperationType, LockOperation, LockConnecitionStatus, LockOperationStatus, waitForOperation,
} from './api';
import {
  LockTargetState, currentStateFromEvent, targetStateFromCurrent, isBatteryLow, isReachable,
  pollDelayMs, describeCurrentState,
} from './lockState';

export interface GlueLockOptions {
  pollIntervalSeconds: number;
  lowBatteryThreshold: number;
}

// Glue reports a final status for an operation after about 5-10 seconds.
const OPERATION_POLL_ATTEMPTS = 30;
const OPERATION_POLL_INTERVAL_MS = 1000;

// After this number of failed polls in a row, the lock is shown as "Not responding".
const MAX_POLL_FAILURES_BEFORE_UNREACHABLE = 3;

export class GlueLockAccessory {
  private lockMechanism: Service;
  private batteryService: Service;
  private operationInFlight = false;
  private targetState: number;
  private lastEventKey: string;
  private consecutivePollFailures = 0;
  private pollTimer?: NodeJS.Timeout;
  private stopped = false;

  constructor(
    protected readonly platform: GlueHomePlatformPlugin,
    protected readonly accessory: PlatformAccessory,
    protected readonly glueClient: GlueApi,
    protected lock: Lock,
    protected readonly options: GlueLockOptions,
  ) {
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'GlueHome')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, lock.serialNumber)
      .setCharacteristic(this.platform.Characteristic.Name, lock.description)
      .setCharacteristic(this.platform.Characteristic.Model, lock.getLockModel())
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, lock.firmwareVersion);

    this.lockMechanism = this.accessory.getService(this.platform.Service.LockMechanism)
      || this.accessory.addService(this.platform.Service.LockMechanism);

    this.lockMechanism.getCharacteristic(this.platform.Characteristic.LockCurrentState)
      .onGet(this.getLockCurrentState.bind(this));

    this.lockMechanism.getCharacteristic(this.platform.Characteristic.LockTargetState)
      .onGet(this.getLockTargetState.bind(this))
      .onSet(this.setLockTargetState.bind(this));

    this.batteryService = this.accessory.getService(this.platform.Service.Battery)
      || this.accessory.addService(this.platform.Service.Battery);
    this.batteryService
      .getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .onGet(this.getBatteryLevel.bind(this));

    this.batteryService
      .getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .onGet(this.getBatteryStatus.bind(this));

    this.batteryService.getCharacteristic(this.platform.Characteristic.ChargingState)
      .onGet(this.getBatteryChargingState.bind(this));

    // The target state starts at the current state. It never starts as "unlocked" without a real unlock event.
    this.targetState = targetStateFromCurrent(this.computeLockCurrentState(), LockTargetState.SECURED);
    this.lastEventKey = this.eventKey(lock);

    this.platform.log.info(`${this.name}: ${describeCurrentState(this.computeLockCurrentState())}, `
      + `connection ${lock.connectionStatus}, battery ${lock.batteryStatus}%.`);
    this.pushState();
    this.schedulePoll(this.pollIntervalMs);
  }

  stop() {
    this.stopped = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
  }

  async getLockCurrentState(): Promise<CharacteristicValue> {
    this.assertReachable();
    return this.computeLockCurrentState();
  }

  async getLockTargetState(): Promise<CharacteristicValue> {
    this.assertReachable();
    return this.targetState;
  }

  /**
   * Called only by HomeKit. This is the only place that sends a lock or unlock operation to Glue.
   * An operation is never sent again automatically, also not after an error.
   */
  async setLockTargetState(value: CharacteristicValue): Promise<void> {
    const target = value === LockTargetState.SECURED ? LockTargetState.SECURED : LockTargetState.UNSECURED;
    const type = target === LockTargetState.SECURED ? LockOperationType.Lock : LockOperationType.Unlock;

    if (this.operationInFlight) {
      this.platform.log.warn(`${this.name}: ${type} ignored, another operation is in progress.`);
      throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.RESOURCE_BUSY);
    }

    if (!this.reachable) {
      this.platform.log.warn(`${this.name}: ${type} not sent, the lock is not reachable (${this.lock.connectionStatus}).`);
      throw this.communicationFailure();
    }

    if (this.lock.connectionStatus === LockConnecitionStatus.Busy) {
      this.platform.log.info(`${this.name}: the lock reports busy, sending ${type} anyway.`);
    }

    this.operationInFlight = true;
    let created: LockOperation;
    try {
      created = await this.glueClient.createLockOperation(this.lock.id, { type });
    } catch (err) {
      this.operationInFlight = false;
      this.platform.log.error(`${this.name}: ${type} request failed: ${errorMessage(err)}`);
      throw this.communicationFailure();
    }

    this.targetState = target;
    this.platform.log.info(`${this.name}: ${type} requested.`);

    // Return to HomeKit now. The result of the operation sets the current state later.
    void this.followOperation(type, created);
  }

  async getBatteryLevel(): Promise<CharacteristicValue> {
    this.assertReachable();
    return this.lock.batteryStatus;
  }

  async getBatteryStatus(): Promise<CharacteristicValue> {
    this.assertReachable();
    return this.computeLockBatteryStatus();
  }

  async getBatteryChargingState(): Promise<CharacteristicValue> {
    return this.platform.Characteristic.ChargingState.NOT_CHARGEABLE;
  }

  private get name() {
    return this.lock.description;
  }

  private get pollIntervalMs() {
    return this.options.pollIntervalSeconds * 1000;
  }

  private get reachable() {
    return isReachable(this.lock.connectionStatus)
      && this.consecutivePollFailures < MAX_POLL_FAILURES_BEFORE_UNREACHABLE;
  }

  private assertReachable() {
    if (!this.reachable) {
      throw this.communicationFailure();
    }
  }

  private communicationFailure() {
    return new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  private async followOperation(type: LockOperationType, created: LockOperation) {
    try {
      const operation = await waitForOperation(this.glueClient, this.lock.id, created, {
        attempts: OPERATION_POLL_ATTEMPTS,
        intervalMs: OPERATION_POLL_INTERVAL_MS,
      });

      if (operation.status === LockOperationStatus.Completed) {
        this.platform.log.info(`${this.name}: ${type} completed.`);
      } else if (operation.status === LockOperationStatus.Pending) {
        this.platform.log.warn(`${this.name}: ${type} is still pending. The next poll sets the lock state.`);
      } else {
        // The target state is kept, so a failed lock is never shown as locked.
        this.platform.log.warn(`${this.name}: ${type} ${operation.status}`
          + `${operation.reason ? ` (${operation.reason})` : ''}. The lock state comes from the lock, not from the request.`);
      }
    } finally {
      this.operationInFlight = false;
      await this.refreshLockData();
    }
  }

  private computeLockBatteryStatus() {
    return isBatteryLow(this.lock.batteryStatus, this.options.lowBatteryThreshold) ?
      this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW :
      this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
  }

  private computeLockCurrentState() {
    return currentStateFromEvent(this.lock.lastLockEvent?.eventType);
  }

  private eventKey(lock: Lock) {
    return `${lock.lastLockEvent?.eventType}@${lock.lastLockEvent?.eventTime}`;
  }

  private schedulePoll(delayMs: number) {
    if (this.stopped) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      const ok = await this.refreshLockData();
      this.schedulePoll(ok ? this.pollIntervalMs : pollDelayMs(this.pollIntervalMs, this.consecutivePollFailures));
    }, delayMs);
  }

  /** Reads the lock from Glue and pushes the values to HomeKit. Returns false if the request failed. */
  private async refreshLockData(): Promise<boolean> {
    if (this.operationInFlight) {
      return true;
    }

    try {
      const updatedLock = await this.glueClient.getLock(this.lock.id);
      if (this.consecutivePollFailures >= MAX_POLL_FAILURES_BEFORE_UNREACHABLE) {
        this.platform.log.info(`${this.name}: Glue API is reachable again.`);
      }
      this.consecutivePollFailures = 0;
      this.applyLock(updatedLock);
      return true;
    } catch (err) {
      this.consecutivePollFailures++;
      this.platform.log.warn(`${this.name}: could not refresh (${this.consecutivePollFailures} in a row): ${errorMessage(err)}`);
      if (this.consecutivePollFailures === MAX_POLL_FAILURES_BEFORE_UNREACHABLE) {
        this.platform.log.warn(`${this.name}: shown as not responding until the Glue API answers again.`);
        this.pushState();
      }
      return false;
    }
  }

  private applyLock(updatedLock: Lock) {
    const previous = this.lock;
    this.lock = updatedLock;

    if (previous.connectionStatus !== updatedLock.connectionStatus) {
      this.logConnectionChange(updatedLock.connectionStatus);
    }

    const eventKey = this.eventKey(updatedLock);
    if (eventKey !== this.lastEventKey) {
      // A new lock event: the lock, the app, a key or a HomeKit request changed the state. The target follows it.
      this.lastEventKey = eventKey;
      const currentState = this.computeLockCurrentState();
      this.targetState = targetStateFromCurrent(currentState, this.targetState);
      this.platform.log.info(`${this.name}: ${describeCurrentState(currentState)} (${updatedLock.lastLockEvent?.eventType}).`);
    }

    if (previous.batteryStatus !== updatedLock.batteryStatus) {
      this.platform.log.debug(`${this.name}: battery ${updatedLock.batteryStatus}%.`);
    }

    this.pushState();
  }

  private logConnectionChange(status: LockConnecitionStatus) {
    if (status === LockConnecitionStatus.Busy) {
      this.platform.log.info(`${this.name}: the lock is busy.`);
    } else if (isReachable(status)) {
      this.platform.log.info(`${this.name}: connected.`);
    } else {
      this.platform.log.warn(`${this.name}: ${status}. Shown as not responding.`);
    }
  }

  /** Pushes the known values to HomeKit. updateValue never calls onSet, so this never sends an operation. */
  private pushState() {
    const { Characteristic } = this.platform;

    if (!this.reachable) {
      this.lockMechanism.getCharacteristic(Characteristic.LockCurrentState).updateValue(this.communicationFailure());
      this.lockMechanism.getCharacteristic(Characteristic.LockTargetState).updateValue(this.communicationFailure());
      return;
    }

    this.lockMechanism.updateCharacteristic(Characteristic.Name, this.lock.description);
    this.lockMechanism.updateCharacteristic(Characteristic.LockTargetState, this.targetState);
    this.lockMechanism.updateCharacteristic(Characteristic.LockCurrentState, this.computeLockCurrentState());
    this.batteryService.updateCharacteristic(Characteristic.BatteryLevel, this.lock.batteryStatus);
    this.batteryService.updateCharacteristic(Characteristic.StatusLowBattery, this.computeLockBatteryStatus());
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
