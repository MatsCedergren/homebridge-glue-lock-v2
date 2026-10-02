import { describe, expect, it } from 'vitest';
import {
  LockCurrentState, LockTargetState, currentStateFromEvent, targetStateFromCurrent, isBatteryLow,
  normalizeLowBatteryThreshold, normalizePollInterval, pollDelayMs, isReachable, MAX_POLL_BACKOFF_MS,
} from '../src/lockState';
import { EventType, LockConnecitionStatus } from '../src/api';

describe('currentStateFromEvent', () => {
  it.each<[EventType, number]>([
    ['pressAndGo', LockCurrentState.SECURED],
    ['localLock', LockCurrentState.SECURED],
    ['manualLock', LockCurrentState.SECURED],
    ['remoteLock', LockCurrentState.SECURED],
    ['localUnlock', LockCurrentState.UNSECURED],
    ['manualUnlock', LockCurrentState.UNSECURED],
    ['remoteUnlock', LockCurrentState.UNSECURED],
    ['unknown', LockCurrentState.UNKNOWN],
  ])('maps %s to %i', (eventType, expected) => {
    expect(currentStateFromEvent(eventType)).toBe(expected);
  });

  it('gives UNKNOWN when there is no event', () => {
    expect(currentStateFromEvent(undefined)).toBe(LockCurrentState.UNKNOWN);
  });

  it('gives UNKNOWN for an event type that the API adds later', () => {
    expect(currentStateFromEvent('somethingNew' as EventType)).toBe(LockCurrentState.UNKNOWN);
  });
});

describe('targetStateFromCurrent', () => {
  it('follows a known current state', () => {
    expect(targetStateFromCurrent(LockCurrentState.SECURED, LockTargetState.UNSECURED)).toBe(LockTargetState.SECURED);
    expect(targetStateFromCurrent(LockCurrentState.UNSECURED, LockTargetState.SECURED)).toBe(LockTargetState.UNSECURED);
  });

  it('keeps the previous target when the current state is unknown or jammed', () => {
    expect(targetStateFromCurrent(LockCurrentState.UNKNOWN, LockTargetState.SECURED)).toBe(LockTargetState.SECURED);
    expect(targetStateFromCurrent(LockCurrentState.JAMMED, LockTargetState.UNSECURED)).toBe(LockTargetState.UNSECURED);
  });
});

describe('battery', () => {
  it('is low below the threshold only', () => {
    expect(isBatteryLow(19, 20)).toBe(true);
    expect(isBatteryLow(20, 20)).toBe(false);
    expect(isBatteryLow(100, 20)).toBe(false);
    expect(isBatteryLow(0, 1)).toBe(true);
  });

  it('uses 20 % as default threshold and rejects invalid values', () => {
    expect(normalizeLowBatteryThreshold(undefined)).toBe(20);
    expect(normalizeLowBatteryThreshold('abc')).toBe(20);
    expect(normalizeLowBatteryThreshold(0)).toBe(20);
    expect(normalizeLowBatteryThreshold(101)).toBe(20);
    expect(normalizeLowBatteryThreshold(35)).toBe(35);
    expect(normalizeLowBatteryThreshold('10')).toBe(10);
  });
});

describe('poll interval', () => {
  it('uses 30 s as default and 15 s as minimum', () => {
    expect(normalizePollInterval(undefined)).toBe(30);
    expect(normalizePollInterval('x')).toBe(30);
    expect(normalizePollInterval(5)).toBe(15);
    expect(normalizePollInterval(15)).toBe(15);
    expect(normalizePollInterval(60)).toBe(60);
  });

  it('doubles the delay after each failure, up to 5 minutes', () => {
    expect(pollDelayMs(30000, 0)).toBe(30000);
    expect(pollDelayMs(30000, 1)).toBe(60000);
    expect(pollDelayMs(30000, 2)).toBe(120000);
    expect(pollDelayMs(30000, 3)).toBe(240000);
    expect(pollDelayMs(30000, 4)).toBe(MAX_POLL_BACKOFF_MS);
    expect(pollDelayMs(30000, 50)).toBe(MAX_POLL_BACKOFF_MS);
  });

  it('never gives a delay shorter than the base interval', () => {
    expect(pollDelayMs(10 * 60 * 1000, 3)).toBe(10 * 60 * 1000);
  });
});

describe('isReachable', () => {
  it('treats connected and busy as reachable', () => {
    expect(isReachable(LockConnecitionStatus.Connected)).toBe(true);
    expect(isReachable(LockConnecitionStatus.Busy)).toBe(true);
  });

  it('treats offline and disconnected as not reachable', () => {
    expect(isReachable(LockConnecitionStatus.Offline)).toBe(false);
    expect(isReachable(LockConnecitionStatus.Disconnected)).toBe(false);
  });
});
