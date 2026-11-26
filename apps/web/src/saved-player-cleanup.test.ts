/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getEvent } from './api';
import { pruneInactiveSavedPlayers } from './saved-player-cleanup';
import { listSavedPlayerEvents, loadPlayerSession, savePlayerSession } from './player-sessions';
import { removeStored, storedKeys } from './device-storage';

vi.mock('./api', () => ({
  getEvent: vi.fn(),
  ApiError: class extends Error { constructor(public status: number, public code: string, message: string) { super(message); } },
}));
afterEach(() => { for (const key of storedKeys()) removeStored(key); vi.mocked(getEvent).mockReset(); });

describe('saved player recovery cleanup', () => {
  it('removes every identity in a closed, expired or missing event and keeps waiting players in active events', async () => {
    const extra = '22222222-2222-4222-8222-222222222222';
    for (const code of ['CLOSED', 'EXPIRE', 'GONE12', 'ACTIVE']) {
      savePlayerSession(code, { token: 'private', displayName: 'Ada' });
      savePlayerSession(code, { token: 'private-b', displayName: 'Bea' }, extra);
    }
    vi.mocked(getEvent).mockImplementation(async code => {
      if (code === 'GONE12') throw new ApiError(404, 'EVENT_NOT_FOUND', 'Gone');
      return { status: code === 'CLOSED' ? 'closed' : 'open', expiresAt: new Date(Date.now() + (code === 'EXPIRE' ? -1000 : 86400000)).toISOString() } as Awaited<ReturnType<typeof getEvent>>;
    });
    await pruneInactiveSavedPlayers();
    expect(listSavedPlayerEvents().map(event => event.joinCode)).toEqual(['ACTIVE']);
    expect(loadPlayerSession('ACTIVE', extra)?.token).toBe('private-b');
    expect(loadPlayerSession('EXPIRE', extra)).toBeNull();
  });
  it('keeps identities through network, authorization and server errors; retries after the debounce period', async () => {
    for (const code of ['OFFLIN', 'DENIED', 'SERVER']) savePlayerSession(code, { token: code, displayName: code });
    vi.mocked(getEvent).mockImplementation(async code => {
      if (code === 'OFFLIN') throw new Error('offline');
      throw new ApiError(code === 'DENIED' ? 401 : 503, 'UNAVAILABLE', 'Unavailable');
    });
    const now = Date.now();
    await Promise.all([pruneInactiveSavedPlayers(now), pruneInactiveSavedPlayers(now)]);
    expect(getEvent).toHaveBeenCalledTimes(3);
    expect(listSavedPlayerEvents()).toHaveLength(3);
    vi.mocked(getEvent).mockRejectedValue(new ApiError(404, 'EVENT_NOT_FOUND', 'Gone'));
    await pruneInactiveSavedPlayers(now + 61_000);
    expect(listSavedPlayerEvents()).toHaveLength(0);
  });
});
