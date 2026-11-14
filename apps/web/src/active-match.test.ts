import { afterEach, expect, it } from 'vitest';
import {
  activeMatchDetails,
  activeMatchPath,
  cancelLocalMatch,
  forgetActiveMatch,
  rememberActiveMatch,
} from './active-match';
import { readStored, removeStored, writeStored } from './device-storage';
const key = 'podyguard.tracker.sandbox.duel.classic.2.0';
afterEach(() => {
  forgetActiveMatch();
  removeStored(key);
});
it('cancels only the saved local game and discards its progress', () => {
  writeStored(key, 'saved progress');
  writeStored('podyguard-theme', 'dark');
  rememberActiveMatch('/match', {
    format: 'Duel',
    players: ['Ada', 'Bea'],
    storageKey: key,
  });
  expect(activeMatchDetails()?.players).toEqual(['Ada', 'Bea']);
  expect(cancelLocalMatch()).toBe(true);
  expect(readStored(key)).toBeNull();
  expect(activeMatchPath()).toBeNull();
  expect(activeMatchDetails()).toBeNull();
  expect(readStored('podyguard-theme')).toBe('dark');
});
it('never cancels an event game or clears another active match', () => {
  rememberActiveMatch('/match', { format: 'Duel', players: [] });
  rememberActiveMatch('/e/AB23CD');
  expect(activeMatchDetails()).toBeNull();
  forgetActiveMatch('/match');
  expect(cancelLocalMatch()).toBe(false);
  expect(activeMatchPath()).toBe('/e/AB23CD');
});
it('ignores malformed or mismatched saved details', () => {
  rememberActiveMatch('/match');
  writeStored('podyguard.active-match.details', '{');
  expect(activeMatchDetails()).toBeNull();
  writeStored(
    'podyguard.active-match.details',
    JSON.stringify({ path: '/e/other', format: 'Duel', players: [] }),
  );
  expect(activeMatchDetails()).toBeNull();
});
