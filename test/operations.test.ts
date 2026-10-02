import { describe, expect, it, vi } from 'vitest';
import { LockOperation, LockOperationStatus, waitForOperation } from '../src/api';
import operations from './fixtures/operations.json';

type OperationJson = { id: string; status: string };

/** Returns the fixture responses in order: the first entry is the POST result, the rest are status polls. */
function sourceFor(sequence: OperationJson[]) {
  const polls = sequence.slice(1).map(json => LockOperation.fromJson(json));
  const getLockOperation = vi.fn(async () => {
    const next = polls.shift();
    if (!next) {
      throw new Error('no more fixture responses');
    }
    return next;
  });
  return { created: LockOperation.fromJson(sequence[0]), source: { getLockOperation } };
}

const noSleep = { attempts: 30, intervalMs: 1000, sleep: async () => undefined };

describe('waitForOperation', () => {
  it('follows pending to completed', async () => {
    const { created, source } = sourceFor(operations.unlockCompleted);

    const result = await waitForOperation(source, 'lock-1', created, noSleep);

    expect(result.status).toBe(LockOperationStatus.Completed);
    expect(source.getLockOperation).toHaveBeenCalledTimes(2);
    expect(source.getLockOperation).toHaveBeenCalledWith('lock-1', 'op-unlock-0001');
  });

  it('follows pending to failed (observed in Phase 0)', async () => {
    const { created, source } = sourceFor(operations.lockFailed);

    const result = await waitForOperation(source, 'lock-1', created, noSleep);

    expect(result.status).toBe(LockOperationStatus.Failed);
    expect(source.getLockOperation).toHaveBeenCalledTimes(3);
  });

  it('follows pending to timeout', async () => {
    const { created, source } = sourceFor(operations.lockTimeout);

    const result = await waitForOperation(source, 'lock-1', created, noSleep);

    expect(result.status).toBe(LockOperationStatus.Timeout);
  });

  it('does not poll when the created operation is already final', async () => {
    const getLockOperation = vi.fn();
    const created = LockOperation.fromJson(operations.createdCompleted);

    const result = await waitForOperation({ getLockOperation }, 'lock-1', created, noSleep);

    expect(result.status).toBe(LockOperationStatus.Completed);
    expect(getLockOperation).not.toHaveBeenCalled();
  });

  it('returns the pending operation when the attempts run out', async () => {
    const getLockOperation = vi.fn(async () => LockOperation.fromJson({ id: 'op-1', status: 'pending' }));
    const created = LockOperation.fromJson({ id: 'op-1', status: 'pending' });

    const result = await waitForOperation({ getLockOperation }, 'lock-1', created, { ...noSleep, attempts: 5 });

    expect(result.status).toBe(LockOperationStatus.Pending);
    expect(getLockOperation).toHaveBeenCalledTimes(5);
  });

  it('skips a failed status request and continues', async () => {
    const getLockOperation = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(LockOperation.fromJson({ id: 'op-1', status: 'completed' }));
    const created = LockOperation.fromJson({ id: 'op-1', status: 'pending' });

    const result = await waitForOperation({ getLockOperation }, 'lock-1', created, noSleep);

    expect(result.status).toBe(LockOperationStatus.Completed);
    expect(getLockOperation).toHaveBeenCalledTimes(2);
  });

  it('waits the interval before each status request', async () => {
    const sleep = vi.fn(async () => undefined);
    const { created, source } = sourceFor(operations.unlockCompleted);

    await waitForOperation(source, 'lock-1', created, { attempts: 30, intervalMs: 1000, sleep });

    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });
});
