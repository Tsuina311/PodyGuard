import { normalizeJoinCode } from '@podyguard/shared';
import { readStored, removeStored, storedKeys, writeStored } from './device-storage';
import { rememberRecentEvent } from './recent-events';

export type PlayerSession = { token: string; displayName: string };

export function createPlayerScope(): string {
  // randomUUID requires HTTPS; getRandomValues also works on a phone testing
  // the local development server over HTTP. These IDs are not credentials.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// A device-local selector, never a credential. Only a locally saved token can
// reopen a seat. Keep the original key for existing players and host Play tabs.
export function playerScope(value: string | null): string {
  return value && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value) ? value.toLowerCase() : '';
}

export function playerPath(joinCode: string, scope = ''): string {
  return `/e/${normalizeJoinCode(joinCode)}${scope ? `?seat=${encodeURIComponent(scope)}` : ''}`;
}

export function playerStorageCode(joinCode: string, scope = ''): string {
  return `${normalizeJoinCode(joinCode)}${scope ? `.seat.${scope}` : ''}`;
}

function key(joinCode: string, scope = '') {
  return `podyguard.player.${playerStorageCode(joinCode, scope)}`;
}

function changed() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('podyguard:player-sessions'));
}

export function savePlayerSession(joinCode: string, session: PlayerSession, scope = '') {
  writeStored(key(joinCode, scope), JSON.stringify(session));
  rememberRecentEvent(playerPath(joinCode), normalizeJoinCode(joinCode));
  changed();
}

export function loadPlayerSession(joinCode: string, scope = ''): PlayerSession | null {
  try {
    const value = JSON.parse(readStored(key(joinCode, scope)) ?? 'null');
    return value && typeof value.token === 'string' && value.token &&
      typeof value.displayName === 'string' ? { token: value.token, displayName: value.displayName } : null;
  } catch { return null; }
}

export function clearPlayerSession(joinCode: string, scope = '') {
  removeStored(key(joinCode, scope));
  changed();
}

export function listPlayerSessions(joinCode: string): Array<{ scope: string; displayName: string }> {
  const prefix = `${key(joinCode)}.seat.`;
  const scopes = ['', ...storedKeys().filter(k => k.startsWith(prefix))
    .map(k => k.slice(prefix.length)).filter(s => playerScope(s))];
  return scopes.flatMap(scope => {
    const session = loadPlayerSession(joinCode, scope);
    return session ? [{ scope, displayName: session.displayName }] : [];
  });
}
