import { describe, expect, it } from 'vitest';
import { clearPending, enqueuePending, listPending } from './offline-queue';

describe('offline pending queue', () => {
  it('stores result and challenge ops until they are flushed', () => {
    const joinCode = 'TESTQ1';
    clearPending(joinCode);
    enqueuePending(joinCode, {
      type: 'result',
      winnerParticipantId: 'p1',
      durationSeconds: 12,
    });
    enqueuePending(joinCode, {
      type: 'challenge',
      challengeId: 'centurion',
      targetParticipantId: 'p1',
      source: 'automatic',
    });
    expect(listPending(joinCode)).toHaveLength(2);
    clearPending(joinCode);
    expect(listPending(joinCode)).toHaveLength(0);
  });
});

import { vi, afterEach } from 'vitest';
import { ApiError } from './api';
import { flushPending } from './offline-queue';
import { writeStored } from './device-storage';
const result = (id: string) => ({
  type: 'result' as const,
  winnerParticipantId: id,
  durationSeconds: 12,
});
afterEach(() => {
  clearPending('REPLAY');
  clearPending('OTHER');
});
it('acknowledges each successful operation in order', async () => {
  enqueuePending('REPLAY', result('a'));
  enqueuePending('REPLAY', result('b'));
  const send = vi.fn(async () => {});
  await flushPending('REPLAY', send);
  expect(send.mock.calls).toHaveLength(2);
  expect(listPending('REPLAY')).toEqual([]);
});
it.each([
  new ApiError(0, 'OFFLINE', 'offline'),
  new ApiError(503, 'BUSY', 'busy'),
  new ApiError(401, 'AUTH', 'expired'),
])(
  'retains the failed operation and all dependent operations (%s)',
  async (error) => {
    for (const id of ['a', 'b', 'c']) enqueuePending('REPLAY', result(id));
    const send = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(error);
    await flushPending('REPLAY', send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(listPending('REPLAY')).toEqual([result('b'), result('c')]);
    await flushPending('REPLAY', async () => {});
    expect(listPending('REPLAY')).toEqual([]);
  },
);
it('shares overlapping flushes and preserves operations enqueued in flight', async () => {
  enqueuePending('REPLAY', result('a'));
  let release!: () => void;
  const send = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const first = flushPending('REPLAY', send);
  const second = flushPending('REPLAY', send);
  expect(first).toBe(second);
  await Promise.resolve();
  enqueuePending('REPLAY', result('b'));
  release();
  await first;
  expect(send).toHaveBeenCalledTimes(1);
  expect(listPending('REPLAY')).toEqual([result('b')]);
});
it('keeps separate event queues isolated', async () => {
  enqueuePending('REPLAY', result('a'));
  enqueuePending('OTHER', result('b'));
  await flushPending('REPLAY', async () => {});
  expect(listPending('OTHER')).toEqual([result('b')]);
});
it('does not delete a replacement queue after explicit clearing', async () => {
  enqueuePending('REPLAY', result('a'));
  await flushPending('REPLAY', async () => {
    clearPending('REPLAY');
    enqueuePending('REPLAY', result('b'));
  });
  expect(listPending('REPLAY')).toEqual([result('b')]);
});
it('tolerates malformed stored data', async () => {
  writeStored('podyguard.pending.REPLAY', '{');
  const send = vi.fn();
  await flushPending('REPLAY', send);
  expect(send).not.toHaveBeenCalled();
});
