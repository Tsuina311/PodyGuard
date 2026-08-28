import { isJoinCodeFormat, normalizeJoinCode } from '@podyguard/shared';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Pulls a join code out of whatever a QR (or a paste) handed us: a full join
 * URL, a bare hash route, or the six characters themselves.
 */
export function joinCodeFromScan(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const fromRoute = trimmed.match(/#?\/e\/([A-Za-z0-9]+)/i)?.[1];
  const candidate = normalizeJoinCode(fromRoute ?? trimmed);
  return isJoinCodeFormat(candidate) ? candidate : null;
}

export function playerJoinUrl(
  origin: string,
  pathname: string,
  joinCode: string,
): string {
  const trimmed = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  // A project-pages path must keep the trailing slash before the hash, or
  // GitHub redirects `/PodyGuard` → `/PodyGuard/` and drops the join code.
  return `${origin}${trimmed}/#/e/${joinCode.toUpperCase()}`;
}

/**
 * Production join links should hit the always-on static site, even if the host
 * still has the Render URL open. Locally we ignore that and keep the tab origin
 * for copy/paste; phones get a separate LAN origin via shareableOrigin.
 */
export function joinLinkParts(
  location: {
    protocol: string;
    hostname: string;
    port: string;
    origin: string;
    pathname: string;
  },
  lanHost: string,
  publicSiteUrl?: string,
): { origin: string; pathname: string } {
  const configured = publicSiteUrl?.trim();
  if (configured && !isLocalHostname(location.hostname)) {
    try {
      const url = new URL(configured);
      return {
        origin: url.origin,
        pathname: url.pathname || '/',
      };
    } catch {
      // Fall through to the tab the host actually has open.
    }
  }
  return {
    origin: location.origin,
    pathname: location.pathname,
  };
}

/**
 * QR codes need an address phones can open. Same inputs as joinLinkParts, but
 * localhost is swapped for the machine's LAN IP when one is known.
 */
export function phoneJoinLinkParts(
  location: {
    protocol: string;
    hostname: string;
    port: string;
    origin: string;
    pathname: string;
  },
  lanHost: string,
  publicSiteUrl?: string,
): { origin: string; pathname: string } {
  const link = joinLinkParts(location, lanHost, publicSiteUrl);
  if (!isLocalHostname(location.hostname)) {
    return link;
  }
  return {
    origin: shareableOrigin(location, lanHost),
    pathname: link.pathname,
  };
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
