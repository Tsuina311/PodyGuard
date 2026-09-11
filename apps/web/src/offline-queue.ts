import { ApiError } from './api';
import { readStored, removeStored, writeStored } from './device-storage';

export type PendingOp =
  | {
      type: 'result';
      winnerParticipantId: string;
      durationSeconds: number;
    }
  | {
      type: 'challenge';
      challengeId: string;
      targetParticipantId: string;
      source: 'automatic' | 'confirmation' | 'manual';
      confirmed?: boolean;
    }
  | {
      type: 'tracker-choice';
      trackerUsed: boolean;
    }
  | {
      type: 'pod-rating';
      rating: 1 | 2 | 3 | 4;
    };

function key(joinCode: string): string {
  return `podyguard.pending.${joinCode}`;
}

function read(joinCode: string): string | null {
  return readStored(key(joinCode));
}

function write(joinCode: string, value: string | null): void {
  const storeKey = key(joinCode);
  if (value === null) {
    removeStored(storeKey);
    return;
  }
  writeStored(storeKey, value);
}

export function listPending(joinCode: string): PendingOp[] {
  const raw = read(joinCode);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PendingOp[]) : [];
  } catch {
    return [];
  }
}

export function enqueuePending(joinCode: string, op: PendingOp): void {
  write(joinCode, JSON.stringify([...listPending(joinCode), op]));
}

export function clearPending(joinCode: string): void {
  write(joinCode, null);
}

export function isOfflineError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 0;
}

export async function flushPending(
  joinCode: string,
  send: (op: PendingOp) => Promise<void>,
): Promise<void> {
  const queue = listPending(joinCode);
  if (queue.length === 0) {
    return;
  }
  const remaining: PendingOp[] = [];
  for (const op of queue) {
    try {
      await send(op);
    } catch (error) {
      remaining.push(op);
      if (isOfflineError(error)) {
        remaining.push(...queue.slice(queue.indexOf(op) + 1));
        break;
      }
    }
  }
  if (remaining.length === 0) {
    clearPending(joinCode);
  } else {
    write(joinCode, JSON.stringify(remaining));
  }
}
