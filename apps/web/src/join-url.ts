const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function playerJoinUrl(
  origin: string,
  pathname: string,
  joinCode: string,
): string {
  const path = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return `${origin}${path}#/e/${joinCode.toUpperCase()}`;
}

export function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith('.local');
}

/**
 * A phone scanning a localhost QR would call itself, so swap in the dev
 * machine's LAN address while keeping the port the browser is already using.
 */
export function shareableOrigin(
  location: { protocol: string; hostname: string; port: string; origin: string },
  lanHost: string,
): string {
  if (!lanHost || !isLocalHostname(location.hostname)) {
    return location.origin;
  }
  const port = location.port ? `:${location.port}` : '';
  return `${location.protocol}//${lanHost}${port}`;
}

export function lanHostFromBuild(): string {
  return typeof __LAN_HOST__ === 'undefined' ? '' : __LAN_HOST__;
}
