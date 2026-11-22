/** @vitest-environment jsdom */
import { afterEach, expect, it } from 'vitest';
import { recentEvents, rememberRecentEvent, removeRecentEvent } from './recent-events';
import { removeStored, writeStored } from './device-storage';
afterEach(() => {
  localStorage.clear();
  removeStored('podyguard.recent-events');
  removeStored('podyguard.recent-events.removed');
});
it('remembers invitations and host desks across reopening without copying credentials', () => {
  rememberRecentEvent('/nights/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'Friday');
  rememberRecentEvent('/host/AB23CD', 'Commander friends');
  rememberRecentEvent('/host/AB23CD', 'Renamed');
  expect(recentEvents().map((r) => r.path)).toEqual([
    '/host/AB23CD',
    '/nights/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  ]);
  expect(recentEvents()[0]?.name).toBe('Renamed');
  expect(JSON.stringify(recentEvents())).not.toContain('token');
});
it('recovers older device sessions and ignores malformed recent data', () => {
  localStorage.setItem('podyguard.host.AB23CD', 'host-secret');
  localStorage.setItem(
    'podyguard.player.XY23AB',
    JSON.stringify({ token: 'seat-secret' }),
  );
  writeStored('podyguard.recent-events', '{');
  expect(recentEvents().map((r) => r.path)).toEqual([
    '/host/AB23CD',
    '/e/XY23AB',
  ]);
  expect(JSON.stringify(recentEvents())).not.toContain('secret');
});
it('rejects unexpected navigation paths and limits the saved list', () => {
  rememberRecentEvent('//outside.example', 'Invalid');
  for (let n = 0; n < 25; n++) rememberRecentEvent(`/host/AB${n}`, 'Night');
  expect(recentEvents()).toHaveLength(20);
  expect(recentEvents().some((r) => r.name === 'Invalid')).toBe(false);
});


it('removes saved and recovered shortcuts without losing their sessions', () => {
  const hostKey = 'podyguard.host.AB23CD';
  const playerKey = 'podyguard.player.XY23AB';
  localStorage.setItem(hostKey, 'host-token');
  localStorage.setItem(playerKey, '{"token":"seat-token","displayName":"Ada"}');
  rememberRecentEvent('/e/XY23AB', 'XY23AB');
  rememberRecentEvent('/host/KEEP12', 'Keep this desk');

  removeRecentEvent('/host/AB23CD');
  removeRecentEvent('/e/XY23AB');
  expect(recentEvents().map((row) => row.path)).toEqual(['/host/KEEP12']);
  expect(localStorage.getItem(hostKey)).toBe('host-token');
  expect(localStorage.getItem(playerKey)).toContain('seat-token');

  rememberRecentEvent('/e/XY23AB', 'XY23AB');
  expect(recentEvents().map((row) => row.path)).toEqual(['/e/XY23AB', '/host/KEEP12']);
});
