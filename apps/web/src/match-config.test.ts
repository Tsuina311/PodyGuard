import { beforeEach, describe, expect, it } from 'vitest';
import {
  defaultMatchConfig,
  loadMatchConfig,
  saveMatchConfig,
  seatColor,
  seatCountForMode,
  seatCountsForMode,
  trackerStorageKey,
} from './match-config';

// The node test environment has no web storage, so stand one up by hand.
function installSessionStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
  });
}

describe('standalone match config', () => {
  beforeEach(() => {
    installSessionStorage();
  });

  it('offers the correct seat count for every standalone mode', () => {
    expect(seatCountsForMode('duel')).toEqual([2]);
    expect(seatCountsForMode('multiplayer')).toEqual([3, 4, 5, 6]);
    expect(seatCountsForMode('commander')).toEqual([3, 4, 5, 6]);
    expect(seatCountsForMode('duel-commander')).toEqual([2]);
    expect(seatCountsForMode('brawl')).toEqual([2]);
    expect(seatCountsForMode('treachery')).toEqual([4, 5, 6, 7, 8]);
    expect(seatCountsForMode('two-headed-giant')).toEqual([4]);
    expect(seatCountsForMode('archenemy-commander')).toEqual([4]);
    expect(seatCountsForMode('emperor')).toEqual([6]);
    expect(seatCountsForMode('star')).toEqual([5]);
    expect(seatCountsForMode('assassin')).toEqual([3, 4, 5, 6, 7, 8]);
    expect(seatCountForMode('archenemy-commander', 6)).toBe(4);
    expect(seatCountForMode('commander', 6)).toBe(6);
    expect(seatCountForMode('commander', 2)).toBe(3);
  });

  it('repairs a stored seat count that the game mode does not allow', () => {
    saveMatchConfig({
      ...defaultMatchConfig(),
      gameMode: 'commander',
      seatCount: 6,
    });
    expect(loadMatchConfig().seatCount).toBe(6);

    saveMatchConfig({
      ...loadMatchConfig(),
      gameMode: 'two-headed-giant',
    });
    expect(loadMatchConfig().seatCount).toBe(4);
  });

  it('falls back to Commander when the stored mode is unknown', () => {
    sessionStorage.setItem(
      'podyguard.match.config',
      JSON.stringify({ gameMode: 'pauper', seatCount: 5 }),
    );
    const config = loadMatchConfig();
    expect(config.gameMode).toBe('commander');
    expect(config.seatCount).toBe(5);
  });

  it('keeps snapshots of different modes apart', () => {
    const base = defaultMatchConfig();
    expect(trackerStorageKey(base)).not.toBe(
      trackerStorageKey({ ...base, gameMode: 'archenemy-commander' }),
    );
  });

  it('defaults seats to Player 1, Player 2, …', () => {
    expect(defaultMatchConfig().names.slice(0, 4)).toEqual([
      'Player 1',
      'Player 2',
      'Player 3',
      'Player 4',
    ]);
    expect(seatColor(0)).toBe('#ef4444');
    expect(seatColor(1)).toBe('#3b82f6');
  });
});
