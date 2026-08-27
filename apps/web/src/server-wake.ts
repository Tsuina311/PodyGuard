/** Render free sleeps after ~15 minutes idle; stay under that. */
export const KEEP_ALIVE_INTERVAL_MS = 10 * 60 * 1000;

/** Shared across tabs so a full table does not each ping the host. */
export const KEEP_ALIVE_STORAGE_KEY = 'podyguard-health-ping-at';

export function shouldShowWakeScreen(input: {
  isProd: boolean;
  healthOk: boolean | null;
  waitedMs: number;
}): boolean {
  if (!input.isProd) {
    return false;
  }
  if (input.healthOk === true) {
    return false;
  }
  if (input.healthOk === false) {
    return true;
  }
  return input.waitedMs >= 800;
}

/**
 * True when this tab should hit /health for keepalive.
 *
 * Tabs share a last-ping timestamp in localStorage so fifty open phones still
 * produce about one request per interval, not fifty.
 */
export function shouldSendKeepAlivePing(input: {
  now: number;
  lastPingAt: number | null;
  intervalMs?: number;
}): boolean {
  const interval = input.intervalMs ?? KEEP_ALIVE_INTERVAL_MS;
  if (input.lastPingAt == null) {
    return true;
  }
  return input.now - input.lastPingAt >= interval;
}

export function readLastKeepAlivePingAt(
  storage: Pick<Storage, 'getItem'> = localStorage,
): number | null {
  const raw = storage.getItem(KEEP_ALIVE_STORAGE_KEY);
  if (raw == null || raw === '') {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function writeLastKeepAlivePingAt(
  at: number,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  storage.setItem(KEEP_ALIVE_STORAGE_KEY, String(at));
}
