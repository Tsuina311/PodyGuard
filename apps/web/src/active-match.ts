const ACTIVE_MATCH_KEY = 'podyguard.active-match';

export function activeMatchPath(): string | null {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }
  const path = sessionStorage.getItem(ACTIVE_MATCH_KEY);
  return path === '/match' || path?.startsWith('/e/') ? path : null;
}

export function rememberActiveMatch(path: string): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(ACTIVE_MATCH_KEY, path);
  }
}

export function forgetActiveMatch(path?: string): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  if (!path || sessionStorage.getItem(ACTIVE_MATCH_KEY) === path) {
    sessionStorage.removeItem(ACTIVE_MATCH_KEY);
  }
}
