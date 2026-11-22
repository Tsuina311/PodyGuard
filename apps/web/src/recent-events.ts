import { readStored, writeStored } from './device-storage';
export type RecentEvent = { path: string; name: string; seenAt: number };
const KEY = 'podyguard.recent-events';
const REMOVED_KEY = 'podyguard.recent-events.removed';
const valid = (path: unknown): path is string =>
  typeof path === 'string' &&
  /^\/(?:host|e)\/[A-Za-z0-9-]+$|^\/nights\/[a-f0-9-]+$/i.test(path);
function removedPaths(): string[] {
  try {
    const parsed: unknown = JSON.parse(readStored(REMOVED_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(valid) : [];
  } catch {
    return [];
  }
}

export function removeRecentEvent(path: string): void {
  if (!valid(path)) return;
  writeStored(REMOVED_KEY, JSON.stringify([...new Set([...removedPaths(), path])]));
}

export function recentEvents(): RecentEvent[] {
  let rows: RecentEvent[] = [];
  try {
    const parsed: unknown = JSON.parse(readStored(KEY) ?? '[]');
    if (Array.isArray(parsed))
      rows = parsed.filter(
        (r): r is RecentEvent =>
          r &&
          valid(r.path) &&
          typeof r.name === 'string' &&
          Number.isFinite(r.seenAt),
      );
  } catch {
    /* unavailable or malformed storage */
  }
  // Recover sessions saved by older releases; credentials stay in their own keys.
  try {
    for (const key of Object.keys(localStorage)) {
      const m = /^podyguard\.(host|player)\.([A-Za-z0-9-]+)$/.exec(key);
      if (!m) continue;
      const path = `/${m[1] === 'host' ? 'host' : 'e'}/${m[2]}`;
      if (!rows.some((r) => r.path === path))
        rows.push({ path, name: m[2]!, seenAt: 0 });
    }
  } catch {
    /* private browsing */
  }
  // A removed shortcut can still have a saved host credential or player seat.
  const removed = new Set(removedPaths());
  return rows
    .filter((row) => !removed.has(row.path))
    .sort((a, b) => b.seenAt - a.seenAt)
    .slice(0, 20);
}
export function rememberRecentEvent(path: string, name: string) {
  if (!valid(path)) return;
  writeStored(
    KEY,
    JSON.stringify(
      [
        { path, name, seenAt: Date.now() },
        ...recentEvents().filter((row) => row.path !== path),
      ].slice(0, 20),
    ),
  );
  const removed = removedPaths();
  if (removed.includes(path)) {
    writeStored(REMOVED_KEY, JSON.stringify(removed.filter((entry) => entry !== path)));
  }
}
