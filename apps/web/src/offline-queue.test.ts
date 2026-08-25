import { describe, expect, it } from 'vitest';
import {
  clearPending,
  enqueuePending,
  listPending,
} from './offline-queue';

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
