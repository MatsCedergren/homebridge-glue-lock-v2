// Added by Mats Cedergren, 2026: pure state logic, kept free of Homebridge imports so it can be unit tested.
import { EventType, LockConnecitionStatus } from './api';

// Values match the HomeKit characteristics LockCurrentState and LockTargetState.
export const LockCurrentState = { UNSECURED: 0, SECURED: 1, JAMMED: 2, UNKNOWN: 3 } as const;
export const LockTargetState = { UNSECURED: 0, SECURED: 1 } as const;

export const DEFAULT_POLL_INTERVAL_SECONDS = 30;
export const MIN_POLL_INTERVAL_SECONDS = 15;
export const MAX_POLL_BACKOFF_MS = 5 * 60 * 1000;
export const DEFAULT_LOW_BATTERY_THRESHOLD = 20;

const CURRENT_STATE_BY_EVENT: Record<EventType, number> = {
  'unknown': LockCurrentState.UNKNOWN,
  'pressAndGo': LockCurrentState.SECURED,
  'localLock': LockCurrentState.SECURED,
  'manualLock': LockCurrentState.SECURED,
  'remoteLock': LockCurrentState.SECURED,
  'localUnlock': LockCurrentState.UNSECURED,
  'manualUnlock': LockCurrentState.UNSECURED,
  'remoteUnlock': LockCurrentState.UNSECURED,
};

export function currentStateFromEvent(eventType?: EventType): number {
  return (eventType && CURRENT_STATE_BY_EVENT[eventType]) ?? LockCurrentState.UNKNOWN;
}

/** Target state that matches a known current state. Keeps the previous target when the current state is not known. */
export function targetStateFromCurrent(currentState: number, previousTarget: number): number {
  switch (currentState) {
    case LockCurrentState.SECURED:
      return LockTargetState.SECURED;
    case LockCurrentState.UNSECURED:
      return LockTargetState.UNSECURED;
    default:
      return previousTarget;
  }
}

export function isBatteryLow(batteryLevel: number, threshold: number): boolean {
  return batteryLevel < threshold;
}

export function normalizeLowBatteryThreshold(value?: unknown): number {
  const threshold = Number(value);
  if (!Number.isFinite(threshold) || threshold < 1 || threshold > 100) {
    return DEFAULT_LOW_BATTERY_THRESHOLD;
  }
  return Math.round(threshold);
}

export function normalizePollInterval(value?: unknown): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return DEFAULT_POLL_INTERVAL_SECONDS;
  }
  return Math.max(MIN_POLL_INTERVAL_SECONDS, Math.round(seconds));
}

/** Poll delay after a number of consecutive failures: doubles each time, up to MAX_POLL_BACKOFF_MS. */
export function pollDelayMs(baseMs: number, consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) {
    return baseMs;
  }
  return Math.min(baseMs * 2 ** consecutiveFailures, Math.max(baseMs, MAX_POLL_BACKOFF_MS));
}

/** offline and disconnected mean that the Glue Hub cannot reach the lock. busy means that the lock is working. */
export function isReachable(status: LockConnecitionStatus): boolean {
  return status === LockConnecitionStatus.Connected || status === LockConnecitionStatus.Busy;
}

export function describeCurrentState(state: number): string {
  switch (state) {
    case LockCurrentState.SECURED:
      return 'locked';
    case LockCurrentState.UNSECURED:
      return 'unlocked';
    case LockCurrentState.JAMMED:
      return 'jammed';
    default:
      return 'unknown';
  }
}
