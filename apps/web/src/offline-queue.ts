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

const flushing = new Map<string, Promise<void>>();

export function flushPending(
  joinCode: string,
  send: (op: PendingOp) => Promise<void>,
): Promise<void> {
  // An online event and a React refresh can arrive together. Only one replay
  // may consume a queue in this tab. Persist each acknowledgement immediately.
  const active = flushing.get(joinCode);
  if (active) return active;
  const replay = async () => {
    const queue = listPending(joinCode);
    let removed = 0;
    for (let index = 0; index < queue.length; index += 1) {
      try {
        await send(queue[index]!);
      } catch {
        // Keep this operation and everything after it, preserving dependencies.
        return;
      }
      const current = listPending(joinCode);
      const position = index - removed;
      // Keep operations appended while the request was in flight. If the
      // queue was explicitly cleared/replaced, do not remove a different op.
      if (JSON.stringify(current[position]) !== JSON.stringify(queue[index]))
        return;
      current.splice(position, 1);
      removed += 1;
      write(joinCode, current.length ? JSON.stringify(current) : null);
    }
  };
  const task = Promise.resolve()
    .then(async () => {
      if (typeof navigator !== 'undefined' && navigator.locks)
        await navigator.locks.request(`podyguard.pending.${joinCode}`, replay);
      else await replay();
    })
    .finally(() => flushing.delete(joinCode));
  flushing.set(joinCode, task);
  return task;
}
