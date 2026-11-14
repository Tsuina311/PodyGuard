import { loadMatchConfig, trackerStorageKey } from './match-config';
import { readStored, removeStored, writeStored } from './device-storage';

export type ActiveMatchDetails = {
  path: string;
  format: string;
  players: string[];
  eventName?: string;
  tableLabel?: string;
  storageKey?: string;
};
const DETAILS_KEY = 'podyguard.active-match.details';

const ACTIVE_MATCH_KEY = 'podyguard.active-match';

export function activeMatchPath(): string | null {
  const path = readStored(ACTIVE_MATCH_KEY);
  return path === '/match' ||
    path?.startsWith('/e/') ||
    path?.startsWith('/host/')
    ? path
    : null;
}

export function rememberActiveMatch(
  path: string,
  details?: Omit<ActiveMatchDetails, 'path'>,
): void {
  if (details) writeStored(DETAILS_KEY, JSON.stringify({ ...details, path }));
  else if (activeMatchPath() !== path) removeStored(DETAILS_KEY);
  writeStored(ACTIVE_MATCH_KEY, path);
}

export function forgetActiveMatch(path?: string): void {
  if (!path || readStored(ACTIVE_MATCH_KEY) === path) {
    removeStored(ACTIVE_MATCH_KEY);
    removeStored(DETAILS_KEY);
  }
}

export function activeMatchDetails(): ActiveMatchDetails | null {
  try {
    const value = JSON.parse(readStored(DETAILS_KEY) ?? 'null');
    if (
      !value ||
      value.path !== activeMatchPath() ||
      typeof value.format !== 'string' ||
      !Array.isArray(value.players) ||
      !value.players.every((name: unknown) => typeof name === 'string')
    )
      return null;
    return {
      path: value.path,
      format: value.format,
      players: value.players,
      eventName:
        typeof value.eventName === 'string' ? value.eventName : undefined,
      tableLabel:
        typeof value.tableLabel === 'string' ? value.tableLabel : undefined,
      storageKey:
        typeof value.storageKey === 'string' &&
        value.storageKey.startsWith('podyguard.tracker.sandbox.')
          ? value.storageKey
          : undefined,
    };
  } catch {
    return null;
  }
}

/** Local cancellation discards progress without recording a game result. */
export function cancelLocalMatch(): boolean {
  if (activeMatchPath() !== '/match') return false;
  const details = activeMatchDetails();
  const key = details?.storageKey ?? trackerStorageKey(loadMatchConfig());
  removeStored(key);
  removeStored(`${key}:board-layout`);
  forgetActiveMatch('/match');
  return true;
}
