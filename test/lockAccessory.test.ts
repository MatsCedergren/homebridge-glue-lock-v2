import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as hap from '@homebridge/hap-nodejs';
import { Characteristic, HAPStatus, HapStatusError, Service, WithUUID } from '@homebridge/hap-nodejs';
import { GlueLockAccessory } from '../src/lock';
import { Lock, LockOperation } from '../src/api';
import type { GlueApi } from '../src/api/client';
import type { GlueHomePlatformPlugin } from '../src/platform';
import type { PlatformAccessory } from 'homebridge';
import locks from './fixtures/locks.json';

const POLL_MS = 30_000;
const SECURED = Characteristic.LockCurrentState.SECURED;
const UNSECURED = Characteristic.LockCurrentState.UNSECURED;
const UNKNOWN = Characteristic.LockCurrentState.UNKNOWN;

type LockOverrides = {
  eventType?: string;
  eventTime?: string;
  connectionStatus?: string;
  batteryStatus?: number;
};

function makeLock(overrides: LockOverrides = {}) {
  const base = locks[0];
  return Lock.fromJson({
    ...base,
    batteryStatus: overrides.batteryStatus ?? base.batteryStatus,
    connectionStatus: overrides.connectionStatus ?? base.connectionStatus,
    lastLockEvent: {
      eventType: overrides.eventType ?? 'remoteLock',
      eventTime: overrides.eventTime ?? '2026-10-01T20:00:00Z',
    },
  });
}

function makeAccessory() {
  const services: Service[] = [new Service.AccessoryInformation()];
  return {
    services,
    getService: (type: { UUID: string }) => services.find(service => service.UUID === type.UUID),
    addService: (type: { UUID: string }) => {
      const service = new (type as unknown as new () => Service)();
      services.push(service);
      return service;
    },
  };
}

function makeClient() {
  return {
    getLock: vi.fn<GlueApi['getLock']>(),
    createLockOperation: vi.fn<GlueApi['createLockOperation']>(),
    getLockOperation: vi.fn<GlueApi['getLockOperation']>(),
  };
}

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const platform = {
  Service,
  Characteristic,
  log,
  api: { hap },
} as unknown as GlueHomePlatformPlugin;

describe('GlueLockAccessory', () => {
  let client: ReturnType<typeof makeClient>;
  let accessory: ReturnType<typeof makeAccessory>;
  let handler: GlueLockAccessory | undefined;

  function create(lock: Lock, lowBatteryThreshold = 20) {
    handler = new GlueLockAccessory(
      platform, accessory as unknown as PlatformAccessory, client as unknown as GlueApi, lock,
      { pollIntervalSeconds: POLL_MS / 1000, lowBatteryThreshold },
    );
    return handler;
  }

  function lockService() {
    return accessory.getService(Service.LockMechanism)!;
  }

  function value(service: Service, characteristic: WithUUID<new () => Characteristic>) {
    return service.getCharacteristic(characteristic).value;
  }

  async function expectCommunicationFailure(promise: Promise<unknown>) {
    const error = await promise.catch(e => e);
    expect(error).toBeInstanceOf(HapStatusError);
    expect((error as HapStatusError).hapStatus).toBe(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    client = makeClient();
    accessory = makeAccessory();
    Object.values(log).forEach(fn => fn.mockReset());
  });

  afterEach(() => {
    handler?.stop();
    handler = undefined;
    vi.useRealTimers();
  });

  describe('start', () => {
    it.each([
      ['remoteLock', SECURED, Characteristic.LockTargetState.SECURED],
      ['manualUnlock', UNSECURED, Characteristic.LockTargetState.UNSECURED],
      ['unknown', UNKNOWN, Characteristic.LockTargetState.SECURED],
    ])('after %s: current %i, target %i', async (eventType, current, target) => {
      const lockAccessory = create(makeLock({ eventType }));

      expect(await lockAccessory.getLockCurrentState()).toBe(current);
      expect(await lockAccessory.getLockTargetState()).toBe(target);
      expect(value(lockService(), Characteristic.LockTargetState)).toBe(target);
    });

    it('adds a Battery service and reports low battery below the threshold', async () => {
      const lockAccessory = create(makeLock({ batteryStatus: 15 }), 20);

      expect(accessory.getService(Service.Battery)).toBeDefined();
      expect(await lockAccessory.getBatteryLevel()).toBe(15);
      expect(await lockAccessory.getBatteryStatus()).toBe(Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
    });

    it('reports normal battery at the threshold', async () => {
      const lockAccessory = create(makeLock({ batteryStatus: 20 }), 20);

      expect(await lockAccessory.getBatteryStatus()).toBe(Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
    });
  });

  describe('connection status', () => {
    it.each(['offline', 'disconnected'])('%s gives "Not responding"', async connectionStatus => {
      const lockAccessory = create(makeLock({ connectionStatus }));

      await expectCommunicationFailure(lockAccessory.getLockCurrentState());
      await expectCommunicationFailure(lockAccessory.getLockTargetState());
      await expectCommunicationFailure(lockAccessory.getBatteryLevel());
    });

    it('busy is not an error', async () => {
      const lockAccessory = create(makeLock({ connectionStatus: 'busy' }));

      expect(await lockAccessory.getLockCurrentState()).toBe(SECURED);
    });

    it('a poll that reports offline gives "Not responding", and connected clears it', async () => {
      const lockAccessory = create(makeLock());
      client.getLock.mockResolvedValueOnce(makeLock({ connectionStatus: 'offline' }));

      await vi.advanceTimersByTimeAsync(POLL_MS);
      await expectCommunicationFailure(lockAccessory.getLockCurrentState());

      client.getLock.mockResolvedValueOnce(makeLock());
      await vi.advanceTimersByTimeAsync(POLL_MS);
      expect(await lockAccessory.getLockCurrentState()).toBe(SECURED);
    });
  });

  describe('lock and unlock', () => {
    it('sends one operation, returns before it is done, and then updates the current state', async () => {
      const lockAccessory = create(makeLock({ eventType: 'remoteUnlock' }));
      client.createLockOperation.mockResolvedValueOnce(LockOperation.fromJson({ id: 'op-1', status: 'pending' }));
      client.getLockOperation.mockResolvedValue(LockOperation.fromJson({ id: 'op-1', status: 'completed' }));
      client.getLock.mockResolvedValue(makeLock({ eventType: 'remoteLock', eventTime: '2026-10-01T21:00:00Z' }));

      await lockAccessory.setLockTargetState(Characteristic.LockTargetState.SECURED);

      expect(client.createLockOperation).toHaveBeenCalledExactlyOnceWith(locks[0].id, { type: 'lock' });
      expect(client.getLockOperation).not.toHaveBeenCalled();
      expect(await lockAccessory.getLockTargetState()).toBe(Characteristic.LockTargetState.SECURED);
      expect(await lockAccessory.getLockCurrentState()).toBe(UNSECURED);

      await vi.advanceTimersByTimeAsync(1000);

      expect(client.getLockOperation).toHaveBeenCalledOnce();
      expect(client.getLock).toHaveBeenCalledOnce();
      expect(await lockAccessory.getLockCurrentState()).toBe(SECURED);
      expect(value(lockService(), Characteristic.LockCurrentState)).toBe(SECURED);
      expect(client.createLockOperation).toHaveBeenCalledOnce();
    });

    it('sends unlock for target UNSECURED', async () => {
      const lockAccessory = create(makeLock());
      client.createLockOperation.mockResolvedValueOnce(LockOperation.fromJson({ id: 'op-1', status: 'completed' }));
      client.getLock.mockResolvedValue(makeLock({ eventType: 'remoteUnlock', eventTime: '2026-10-01T21:00:00Z' }));

      await lockAccessory.setLockTargetState(Characteristic.LockTargetState.UNSECURED);
      await vi.advanceTimersByTimeAsync(0);

      expect(client.createLockOperation).toHaveBeenCalledExactlyOnceWith(locks[0].id, { type: 'unlock' });
      expect(await lockAccessory.getLockCurrentState()).toBe(UNSECURED);
    });

    it('a failed lock is never shown as locked and is not sent again', async () => {
      const lockAccessory = create(makeLock({ eventType: 'remoteUnlock' }));
      client.createLockOperation.mockResolvedValueOnce(LockOperation.fromJson({ id: 'op-1', status: 'pending' }));
      client.getLockOperation
        .mockResolvedValueOnce(LockOperation.fromJson({ id: 'op-1', status: 'pending' }))
        .mockResolvedValueOnce(LockOperation.fromJson({ id: 'op-1', status: 'failed' }));
      client.getLock.mockResolvedValue(makeLock({ eventType: 'remoteUnlock' }));

      await lockAccessory.setLockTargetState(Characteristic.LockTargetState.SECURED);
      await vi.advanceTimersByTimeAsync(10 * POLL_MS);

      expect(await lockAccessory.getLockCurrentState()).toBe(UNSECURED);
      expect(value(lockService(), Characteristic.LockCurrentState)).toBe(UNSECURED);
      expect(await lockAccessory.getLockTargetState()).toBe(Characteristic.LockTargetState.SECURED);
      expect(client.createLockOperation).toHaveBeenCalledOnce();
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('lock failed'));
    });

    it('a timeout keeps the target and is not sent again', async () => {
      const lockAccessory = create(makeLock({ eventType: 'remoteUnlock' }));
      client.createLockOperation.mockResolvedValueOnce(LockOperation.fromJson({ id: 'op-1', status: 'pending' }));
      client.getLockOperation.mockResolvedValue(LockOperation.fromJson({ id: 'op-1', status: 'timeout' }));
      client.getLock.mockResolvedValue(makeLock({ eventType: 'remoteUnlock' }));

      await lockAccessory.setLockTargetState(Characteristic.LockTargetState.SECURED);
      await vi.advanceTimersByTimeAsync(10 * POLL_MS);

      expect(await lockAccessory.getLockCurrentState()).toBe(UNSECURED);
      expect(client.createLockOperation).toHaveBeenCalledOnce();
    });

    it('a new manual event after a failure moves the target to the real state', async () => {
      const lockAccessory = create(makeLock({ eventType: 'remoteUnlock' }));
      client.createLockOperation.mockResolvedValueOnce(LockOperation.fromJson({ id: 'op-1', status: 'failed' }));
      client.getLock.mockResolvedValueOnce(makeLock({ eventType: 'remoteUnlock' }));

      await lockAccessory.setLockTargetState(Characteristic.LockTargetState.SECURED);
      await vi.advanceTimersByTimeAsync(0);
      expect(await lockAccessory.getLockTargetState()).toBe(Characteristic.LockTargetState.SECURED);

      client.getLock.mockResolvedValue(makeLock({ eventType: 'manualUnlock', eventTime: '2026-10-01T22:00:00Z' }));
      await vi.advanceTimersByTimeAsync(POLL_MS);

      expect(await lockAccessory.getLockTargetState()).toBe(Characteristic.LockTargetState.UNSECURED);
    });

    it('rejects a second command during an operation with RESOURCE_BUSY', async () => {
      const lockAccessory = create(makeLock());
      client.createLockOperation.mockResolvedValueOnce(LockOperation.fromJson({ id: 'op-1', status: 'pending' }));
      client.getLockOperation.mockResolvedValue(LockOperation.fromJson({ id: 'op-1', status: 'pending' }));

      await lockAccessory.setLockTargetState(Characteristic.LockTargetState.UNSECURED);
      const error = await lockAccessory.setLockTargetState(Characteristic.LockTargetState.SECURED).catch(e => e);

      expect(error).toBeInstanceOf(HapStatusError);
      expect((error as HapStatusError).hapStatus).toBe(HAPStatus.RESOURCE_BUSY);
      expect(client.createLockOperation).toHaveBeenCalledOnce();
    });

    it('does not send an operation when the lock is offline', async () => {
      const lockAccessory = create(makeLock({ connectionStatus: 'offline' }));

      await expectCommunicationFailure(lockAccessory.setLockTargetState(Characteristic.LockTargetState.UNSECURED));
      expect(client.createLockOperation).not.toHaveBeenCalled();
    });

    it('a failed request is reported to HomeKit and is not sent again', async () => {
      const lockAccessory = create(makeLock());
      client.createLockOperation.mockRejectedValueOnce(new Error('fetch failed'));
      client.getLock.mockResolvedValue(makeLock());

      await expectCommunicationFailure(lockAccessory.setLockTargetState(Characteristic.LockTargetState.UNSECURED));
      await vi.advanceTimersByTimeAsync(10 * POLL_MS);

      expect(client.createLockOperation).toHaveBeenCalledOnce();
      expect(await lockAccessory.getLockTargetState()).toBe(Characteristic.LockTargetState.SECURED);
    });

    it('accepts a new command after a failed request', async () => {
      const lockAccessory = create(makeLock());
      client.createLockOperation
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockResolvedValueOnce(LockOperation.fromJson({ id: 'op-2', status: 'completed' }));
      client.getLock.mockResolvedValue(makeLock());

      await expectCommunicationFailure(lockAccessory.setLockTargetState(Characteristic.LockTargetState.SECURED));
      await lockAccessory.setLockTargetState(Characteristic.LockTargetState.SECURED);

      expect(client.createLockOperation).toHaveBeenCalledTimes(2);
    });
  });

  describe('polling', () => {
    it('polls at the interval, pushes values and never sends an operation', async () => {
      create(makeLock());
      client.getLock.mockResolvedValue(makeLock({ batteryStatus: 10 }));

      await vi.advanceTimersByTimeAsync(3 * POLL_MS);

      expect(client.getLock).toHaveBeenCalledTimes(3);
      const battery = accessory.getService(Service.Battery)!;
      expect(battery.getCharacteristic(Characteristic.BatteryLevel).value).toBe(10);
      expect(battery.getCharacteristic(Characteristic.StatusLowBattery).value)
        .toBe(Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
      expect(client.createLockOperation).not.toHaveBeenCalled();
    });

    it('never unlocks by itself, also when a poll reports an unlock', async () => {
      const lockAccessory = create(makeLock());
      client.getLock.mockResolvedValue(makeLock({ eventType: 'manualUnlock', eventTime: '2026-10-01T22:00:00Z' }));

      await vi.advanceTimersByTimeAsync(5 * POLL_MS);

      expect(await lockAccessory.getLockCurrentState()).toBe(UNSECURED);
      expect(client.createLockOperation).not.toHaveBeenCalled();
    });

    it('backs off after a failed poll and resets after a success', async () => {
      create(makeLock());
      client.getLock
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockResolvedValue(makeLock());

      await vi.advanceTimersByTimeAsync(POLL_MS);
      expect(client.getLock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(2 * POLL_MS - 1);
      expect(client.getLock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(client.getLock).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(4 * POLL_MS);
      expect(client.getLock).toHaveBeenCalledTimes(3);

      await vi.advanceTimersByTimeAsync(POLL_MS);
      expect(client.getLock).toHaveBeenCalledTimes(4);
    });

    it('shows "Not responding" after 3 failed polls and recovers', async () => {
      const lockAccessory = create(makeLock());
      client.getLock.mockRejectedValue(new Error('fetch failed'));

      await vi.advanceTimersByTimeAsync(POLL_MS);
      await vi.advanceTimersByTimeAsync(2 * POLL_MS);
      expect(await lockAccessory.getLockCurrentState()).toBe(SECURED);

      await vi.advanceTimersByTimeAsync(4 * POLL_MS);
      expect(client.getLock).toHaveBeenCalledTimes(3);
      await expectCommunicationFailure(lockAccessory.getLockCurrentState());

      client.getLock.mockResolvedValue(makeLock());
      await vi.advanceTimersByTimeAsync(8 * POLL_MS);
      expect(await lockAccessory.getLockCurrentState()).toBe(SECURED);
    });

    it('keeps polling when the API returns an empty lock', async () => {
      const lockAccessory = create(makeLock());
      client.getLock
        .mockResolvedValueOnce(undefined as unknown as Lock)
        .mockResolvedValue(makeLock());

      await vi.advanceTimersByTimeAsync(POLL_MS);
      expect(await lockAccessory.getLockCurrentState()).toBe(SECURED);

      await vi.advanceTimersByTimeAsync(2 * POLL_MS);
      expect(client.getLock).toHaveBeenCalledTimes(2);
      expect(await lockAccessory.getLockCurrentState()).toBe(SECURED);
    });

    it('stops polling after stop()', async () => {
      const lockAccessory = create(makeLock());
      client.getLock.mockResolvedValue(makeLock());

      lockAccessory.stop();
      await vi.advanceTimersByTimeAsync(5 * POLL_MS);

      expect(client.getLock).not.toHaveBeenCalled();
    });
  });

  describe('logging', () => {
    it('never logs the lock id or serial number', async () => {
      const lockAccessory = create(makeLock());
      client.createLockOperation.mockResolvedValueOnce(LockOperation.fromJson({ id: 'op-1', status: 'failed' }));
      client.getLock
        .mockResolvedValueOnce(makeLock({ connectionStatus: 'offline' }))
        .mockRejectedValue(new Error('fetch failed'));

      await lockAccessory.setLockTargetState(Characteristic.LockTargetState.UNSECURED);
      await vi.advanceTimersByTimeAsync(20 * POLL_MS);

      const output = JSON.stringify(Object.values(log).flatMap(fn => fn.mock.calls));
      expect(output.length).toBeGreaterThan(10);
      expect(output).not.toContain(locks[0].id);
      expect(output).not.toContain(locks[0].serialNumber);
    });
  });
});
