import { isJoinCodeFormat, normalizeJoinCode } from '@podyguard/shared';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export type PlayerLinkParts =
  | {
      status: 'ok';
      origin: string;
      pathname: string;
      source: 'public' | 'dev-tab' | 'dev-lan';
    }
  | { status: 'missing_public_origin' }
  | { status: 'invalid_public_origin' };

/**
 * Pulls a join code out of whatever a QR (or a paste) handed us: a full join
 * URL (`?join=` or legacy `#/e/`), a bare hash route, or the six characters
 * themselves.
 */
export function joinCodeFromScan(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const fromQuery = joinCodeFromQueryString(extractSearch(trimmed));
  if (fromQuery) {
    return fromQuery;
  }
  const fromRoute = trimmed.match(/#?\/e\/([A-Za-z0-9]+)/i)?.[1];
  const candidate = normalizeJoinCode(fromRoute ?? trimmed);
  return isJoinCodeFormat(candidate) ? candidate : null;
}

/** Reads `?join=` from a query string (`?join=ABC` or bare `join=ABC`). */
export function joinCodeFromQueryString(search: string): string | null {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (!raw) {
    return null;
  }
  try {
    const params = new URLSearchParams(raw);
    const value = params.get('join');
    if (!value) {
      return null;
    }
    const candidate = normalizeJoinCode(value);
    return isJoinCodeFormat(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function extractSearch(raw: string): string {
  try {
    if (/^https?:\/\//i.test(raw)) {
      return new URL(raw).search;
    }
  } catch {
    // Fall through to manual parse.
  }
  const queryStart = raw.indexOf('?');
  if (queryStart < 0) {
    return '';
  }
  const hashStart = raw.indexOf('#', queryStart);
  return hashStart < 0
    ? raw.slice(queryStart)
    : raw.slice(queryStart, hashStart);
}

/**
 * Canonical player join link. The code lives in the query string so phone QR
 * scanners cannot drop it with the URL fragment.
 */
export function playerJoinUrl(
  origin: string,
  pathname: string,
  joinCode: string,
): string {
  const trimmed = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const code = normalizeJoinCode(joinCode);
  return `${origin}${trimmed}/?join=${code}`;
}

/**
 * Resolves the public site origin used for copy/QR links.
 *
 * Production never falls back to the host tab origin — a missing
 * `VITE_PUBLIC_ORIGIN` must fail loudly rather than emit a Render/localhost QR.
 * Development keeps the tab (and LAN for phones) so local play still works.
 */
export function resolvePlayerLinkParts(
  location: {
    protocol: string;
    hostname: string;
    port: string;
    origin: string;
    pathname: string;
  },
  options: {
    lanHost: string;
    publicSiteUrl?: string;
    isProduction: boolean;
    forPhoneQr?: boolean;
  },
): PlayerLinkParts {
  const configured = options.publicSiteUrl?.trim();

  if (options.isProduction) {
    if (!configured) {
      return { status: 'missing_public_origin' };
    }
    try {
      const url = new URL(configured);
      if (isUnsafePlayerOrigin(url.hostname)) {
        return { status: 'invalid_public_origin' };
      }
      return {
        status: 'ok',
        origin: url.origin,
        pathname: url.pathname || '/',
        source: 'public',
      };
    } catch {
      return { status: 'invalid_public_origin' };
    }
  }

  if (configured && !isLocalHostname(location.hostname)) {
    try {
      const url = new URL(configured);
      return {
        status: 'ok',
        origin: url.origin,
        pathname: url.pathname || '/',
        source: 'public',
      };
    } catch {
      // Fall through to the tab the host actually has open (dev only).
    }
  }

  if (options.forPhoneQr && isLocalHostname(location.hostname)) {
    return {
      status: 'ok',
      origin: shareableOrigin(location, options.lanHost),
      pathname: location.pathname,
      source: options.lanHost ? 'dev-lan' : 'dev-tab',
    };
  }

  return {
    status: 'ok',
    origin: location.origin,
    pathname: location.pathname,
    source: 'dev-tab',
  };
}

/** @deprecated Prefer resolvePlayerLinkParts — kept for narrow test helpers. */
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
  isProduction = false,
): { origin: string; pathname: string } {
  const resolved = resolvePlayerLinkParts(location, {
    lanHost,
    publicSiteUrl,
    isProduction,
    forPhoneQr: false,
  });
  if (resolved.status !== 'ok') {
    return { origin: location.origin, pathname: location.pathname };
  }
  return { origin: resolved.origin, pathname: resolved.pathname };
}

/** @deprecated Prefer resolvePlayerLinkParts — kept for narrow test helpers. */
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
  isProduction = false,
): { origin: string; pathname: string } {
  const resolved = resolvePlayerLinkParts(location, {
    lanHost,
    publicSiteUrl,
    isProduction,
    forPhoneQr: true,
  });
  if (resolved.status !== 'ok') {
    return { origin: location.origin, pathname: location.pathname };
  }
  return { origin: resolved.origin, pathname: resolved.pathname };
}

export function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith('.local');
}

export function isUnsafePlayerOrigin(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    isLocalHostname(host) ||
    host === 'onrender.com' ||
    host.endsWith('.onrender.com')
  );
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

/**
 * Strips `join` from the browser query string without touching the hash route.
 * Safe to call repeatedly.
 */
export function stripJoinQueryFromLocation(
  href: string = typeof window !== 'undefined' ? window.location.href : '',
): string | null {
  try {
    const url = new URL(href);
    if (!url.searchParams.has('join')) {
      return null;
    }
    url.searchParams.delete('join');
    const search = url.searchParams.toString();
    return `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
  } catch {
    return null;
  }
}
