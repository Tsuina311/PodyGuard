/** @vitest-environment jsdom */
import { afterEach, expect, it } from 'vitest';
import { recentEvents, rememberRecentEvent } from './recent-events';
import { removeStored, writeStored } from './device-storage';
afterEach(() => {
  localStorage.clear();
  removeStored('podyguard.recent-events');
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
