/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { clearPlayerSession, createPlayerScope, listPlayerSessions, loadPlayerSession, playerPath, playerScope, playerStorageCode, savePlayerSession } from './player-sessions';
import { readStored, removeStored, storedKeys } from './device-storage';
import { clearPending, enqueuePending, flushPending, listPending } from './offline-queue';

const bea = '22222222-2222-4222-8222-222222222222';
const cal = '33333333-3333-4333-8333-333333333333';
afterEach(() => { for (const key of storedKeys()) removeStored(key); });

describe('player seats on one device', () => {
  it('creates unique local selectors without requiring the HTTPS-only randomUUID API', () => {
    const first = createPlayerScope();
    expect(playerScope(first)).toBe(first);
    expect(createPlayerScope()).not.toBe(first);
  });
  it('keeps the legacy seat and independently saves, reopens and forgets additional seats', () => {
    sessionStorage.setItem('podyguard.player.ABC123', JSON.stringify({ token: 'old', displayName: 'Ada' }));
    expect(loadPlayerSession('abc-123')).toEqual({ token: 'old', displayName: 'Ada' });
    expect(localStorage.getItem('podyguard.player.ABC123')).toContain('old');
    savePlayerSession('ABC123', { token: 'bea', displayName: 'Bea' }, bea);
    savePlayerSession('ABC123', { token: 'cal', displayName: 'Cal' }, cal);
    expect(loadPlayerSession('abc123', bea)?.token).toBe('bea');
    expect(loadPlayerSession('abc123')?.token).toBe('old');
    expect(loadPlayerSession('OTHER', bea)).toBeNull();
    expect(listPlayerSessions('abc-123').map(p => p.displayName)).toEqual(['Ada', 'Bea', 'Cal']);
    expect(JSON.stringify(listPlayerSessions('ABC123'))).not.toContain('"token"');
    clearPlayerSession('ABC123', bea);
    expect(loadPlayerSession('ABC123', bea)).toBeNull();
    expect(loadPlayerSession('ABC123', cal)?.token).toBe('cal');
    expect(loadPlayerSession('ABC123')?.token).toBe('old');
  });

  it('treats a selector copied to a different device as a fresh seat, never the default identity', () => {
    savePlayerSession('ABC123', { token: 'private', displayName: 'Ada' });
    expect(loadPlayerSession('ABC123', bea)).toBeNull();
    expect(playerPath('abc-123', bea)).toBe(`/e/ABC123?seat=${bea}`);
    expect(playerScope(bea.toUpperCase())).toBe(bea);
    expect(playerScope('../../private')).toBe('');
    localStorage.setItem(`podyguard.player.ABC123.seat.${cal}`, '{"displayName":"broken"}');
    expect(listPlayerSessions('ABC123')).toEqual([{ scope: '', displayName: 'Ada' }]);
  });

  it('never replays another seat’s offline actions with the current player credentials', async () => {
    const first = playerStorageCode('ABC123', bea);
    const second = playerStorageCode('ABC123', cal);
    const op = { type: 'pod-rating' as const, rating: 4 as const };
    enqueuePending('ABC123', op);
    enqueuePending(first, op);
    enqueuePending(second, { ...op, rating: 2 });
    const sent: unknown[] = [];
    await flushPending(second, async value => { sent.push(value); });
    expect(sent).toEqual([{ ...op, rating: 2 }]);
    expect(listPending(first)).toEqual([op]);
    expect(listPending('ABC123')).toEqual([op]);
    expect(readStored(`podyguard.pending.${first}`)).toContain('pod-rating');
    clearPending(second);
  });
});
