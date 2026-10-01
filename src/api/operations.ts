// Added by Mats Cedergren, 2026: polls a lock operation until Glue reports a final status.
import { LockOperation } from './lock';
import { sleep as defaultSleep } from '../utils';

export interface OperationPollOptions {
  attempts: number;
  intervalMs: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface OperationStatusSource {
  getLockOperation(lockId: string, operationId: string): Promise<LockOperation>;
}

/**
 * Polls the status of an operation. Only reads the status: it never creates a new operation.
 * Returns the last known operation. Its status is still 'pending' when the attempts run out.
 * A failed status request is skipped, and the next attempt continues.
 */
export async function waitForOperation(
  source: OperationStatusSource,
  lockId: string,
  created: LockOperation,
  options: OperationPollOptions,
): Promise<LockOperation> {
  const sleep = options.sleep ?? defaultSleep;
  let operation = created;

  for (let attempt = 0; attempt < options.attempts && !operation.isFinished(); attempt++) {
    await sleep(options.intervalMs);
    try {
      operation = await source.getLockOperation(lockId, created.id);
    } catch {
      // Keep the last known status and try again.
    }
  }

  return operation;
}
