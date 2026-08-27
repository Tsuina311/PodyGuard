import { readStored, removeStored, writeStored } from './device-storage';

const ACTIVE_MATCH_KEY = 'podyguard.active-match';

export function activeMatchPath(): string | null {
  const path = readStored(ACTIVE_MATCH_KEY);
  return path === '/match' || path?.startsWith('/e/') ? path : null;
}

export function rememberActiveMatch(path: string): void {
  writeStored(ACTIVE_MATCH_KEY, path);
}

export function forgetActiveMatch(path?: string): void {
  if (!path || readStored(ACTIVE_MATCH_KEY) === path) {
    removeStored(ACTIVE_MATCH_KEY);
  }
}
