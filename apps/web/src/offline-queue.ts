import { ApiError } from './api';

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

const fallback = new Map<string, string>();

function read(joinCode: string): string | null {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(key(joinCode));
  }
  return fallback.get(key(joinCode)) ?? null;
}

function write(joinCode: string, value: string | null): void {
  const storeKey = key(joinCode);
  if (typeof localStorage !== 'undefined') {
    if (value === null) {
      localStorage.removeItem(storeKey);
    } else {
      localStorage.setItem(storeKey, value);
    }
    return;
  }
  if (value === null) {
    fallback.delete(storeKey);
  } else {
    fallback.set(storeKey, value);
  }
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
