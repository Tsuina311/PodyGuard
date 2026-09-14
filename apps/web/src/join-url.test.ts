import { isJoinCodeFormat, normalizeJoinCode } from '@podyguard/shared';
import { describe, expect, it } from 'vitest';
import {
  isUnsafePlayerOrigin,
  joinCodeFromQueryString,
  joinCodeFromScan,
  playPayloadFromQueryString,
  playerDirectPlayUrl,
  playerJoinUrl,
  resolvePlayerLinkParts,
  shareableOrigin,
  stripJoinQueryFromLocation,
  stripPlayQueryFromLocation,
} from './join-url';

describe('joinCodeFromScan', () => {
  it('accepts a bare join code', () => {
    expect(joinCodeFromScan('ab23cd')).toBe('AB23CD');
  });

  it('pulls the code from a query join URL', () => {
    expect(
      joinCodeFromScan('https://tsuina311.github.io/PodyGuard/?join=AB23CD'),
    ).toBe('AB23CD');
  });

  it('pulls the code from a legacy hash join URL', () => {
    expect(
      joinCodeFromScan('https://tsuina311.github.io/PodyGuard/#/e/AB23CD'),
    ).toBe('AB23CD');
  });

  it('pulls the code from a hash-only route', () => {
    expect(joinCodeFromScan('#/e/XY9Z2K')).toBe('XY9Z2K');
  });

  it('rejects noise that is not a join code', () => {
    expect(joinCodeFromScan('https://example.com')).toBeNull();
    expect(joinCodeFromScan('ABC')).toBeNull();
  });
});

describe('joinCodeFromQueryString', () => {
  it('reads ?join=', () => {
    expect(joinCodeFromQueryString('?join=ab23cd')).toBe('AB23CD');
  });

  it('rejects invalid join values', () => {
    expect(joinCodeFromQueryString('?join=NO')).toBeNull();
    expect(joinCodeFromQueryString('')).toBeNull();
    expect(joinCodeFromQueryString('?other=AB23CD')).toBeNull();
  });

  it('normalizes case', () => {
    expect(isJoinCodeFormat(normalizeJoinCode('ab23cd'))).toBe(true);
    expect(joinCodeFromQueryString('join=ab23cd')).toBe('AB23CD');
  });
});

describe('playerJoinUrl', () => {
  it('builds a query-string join link', () => {
    expect(playerJoinUrl('http://localhost:5173', '/', 'ab23cd')).toBe(
      'http://localhost:5173/?join=AB23CD',
    );
  });

  it('keeps a GitHub Pages project path before the query', () => {
    expect(
      playerJoinUrl('https://tsuina311.github.io', '/PodyGuard/', 'ab23cd'),
    ).toBe('https://tsuina311.github.io/PodyGuard/?join=AB23CD');
  });
});

describe('playerDirectPlayUrl', () => {
  it('builds a query-string play link', () => {
    expect(playerDirectPlayUrl('http://localhost:5173', '/', 'abc')).toBe(
      'http://localhost:5173/?play=abc',
    );
  });

  it('keeps a GitHub Pages project path before the query', () => {
    expect(
      playerDirectPlayUrl(
        'https://tsuina311.github.io',
        '/PodyGuard/',
        'token',
      ),
    ).toBe('https://tsuina311.github.io/PodyGuard/?play=token');
  });
});

describe('playPayloadFromQueryString', () => {
  it('reads ?play=', () => {
    expect(playPayloadFromQueryString('?play=abc123')).toBe('abc123');
  });

  it('returns null when play is absent', () => {
    expect(playPayloadFromQueryString('?join=AB23CD')).toBeNull();
    expect(playPayloadFromQueryString('')).toBeNull();
  });
});

describe('resolvePlayerLinkParts', () => {
  const pages = 'https://tsuina311.github.io/PodyGuard/';

  it('uses the configured public origin in production even on Render', () => {
    expect(
      resolvePlayerLinkParts(
        {
          protocol: 'https:',
          hostname: 'podyguard.onrender.com',
          port: '',
          origin: 'https://podyguard.onrender.com',
          pathname: '/',
        },
        {
          lanHost: '',
          publicSiteUrl: pages,
          isProduction: true,
          forPhoneQr: true,
        },
      ),
    ).toEqual({
      status: 'ok',
      origin: 'https://tsuina311.github.io',
      pathname: '/PodyGuard/',
      source: 'public',
    });
  });

  it('refuses to fall back to the tab origin in production without config', () => {
    expect(
      resolvePlayerLinkParts(
        {
          protocol: 'https:',
          hostname: 'podyguard.onrender.com',
          port: '',
          origin: 'https://podyguard.onrender.com',
          pathname: '/',
        },
        { lanHost: '', isProduction: true, forPhoneQr: true },
      ),
    ).toEqual({ status: 'missing_public_origin' });
  });

  it('rejects an unsafe configured public origin in production', () => {
    expect(
      resolvePlayerLinkParts(
        {
          protocol: 'https:',
          hostname: 'podyguard.onrender.com',
          port: '',
          origin: 'https://podyguard.onrender.com',
          pathname: '/',
        },
        {
          lanHost: '',
          publicSiteUrl: 'https://podyguard.onrender.com',
          isProduction: true,
        },
      ),
    ).toEqual({ status: 'invalid_public_origin' });
  });

  it('keeps localhost for development copy/paste', () => {
    expect(
      resolvePlayerLinkParts(
        {
          protocol: 'http:',
          hostname: 'localhost',
          port: '5173',
          origin: 'http://localhost:5173',
          pathname: '/',
        },
        {
          lanHost: '192.168.1.101',
          publicSiteUrl: pages,
          isProduction: false,
          forPhoneQr: false,
        },
      ),
    ).toEqual({
      status: 'ok',
      origin: 'http://localhost:5173',
      pathname: '/',
      source: 'dev-tab',
    });
  });

  it('swaps localhost for the LAN address on phone QR in development', () => {
    expect(
      resolvePlayerLinkParts(
        {
          protocol: 'http:',
          hostname: 'localhost',
          port: '5173',
          origin: 'http://localhost:5173',
          pathname: '/',
        },
        {
          lanHost: '192.168.1.101',
          publicSiteUrl: pages,
          isProduction: false,
          forPhoneQr: true,
        },
      ),
    ).toEqual({
      status: 'ok',
      origin: 'http://192.168.1.101:5173',
      pathname: '/',
      source: 'dev-lan',
    });
  });

  it('never emits localhost/onrender in a production QR URL', () => {
    const resolved = resolvePlayerLinkParts(
      {
        protocol: 'https:',
        hostname: 'podyguard.onrender.com',
        port: '',
        origin: 'https://podyguard.onrender.com',
        pathname: '/',
      },
      {
        lanHost: '',
        publicSiteUrl: pages,
        isProduction: true,
        forPhoneQr: true,
      },
    );
    expect(resolved.status).toBe('ok');
    if (resolved.status !== 'ok') {
      return;
    }
    const url = playerJoinUrl(resolved.origin, resolved.pathname, 'AB23CD');
    expect(url).toBe('https://tsuina311.github.io/PodyGuard/?join=AB23CD');
    expect(url).not.toMatch(/localhost|127\.0\.0\.1|onrender\.com/i);
  });
});

describe('isUnsafePlayerOrigin', () => {
  it('flags local and Render hosts', () => {
    expect(isUnsafePlayerOrigin('localhost')).toBe(true);
    expect(isUnsafePlayerOrigin('127.0.0.1')).toBe(true);
    expect(isUnsafePlayerOrigin('podyguard.onrender.com')).toBe(true);
    expect(isUnsafePlayerOrigin('tsuina311.github.io')).toBe(false);
  });
});

describe('shareableOrigin', () => {
  const local = {
    protocol: 'http:',
    hostname: 'localhost',
    port: '5173',
    origin: 'http://localhost:5173',
  };

  it('swaps localhost for the LAN address so phones can reach it', () => {
    expect(shareableOrigin(local, '192.168.1.101')).toBe(
      'http://192.168.1.101:5173',
    );
  });
});

describe('stripJoinQueryFromLocation', () => {
  it('removes join while preserving other query params and the hash', () => {
    expect(
      stripJoinQueryFromLocation(
        'https://tsuina311.github.io/PodyGuard/?join=AB23CD&x=1#/e/AB23CD',
      ),
    ).toBe('/PodyGuard/?x=1#/e/AB23CD');
  });

  it('returns pathname without join', () => {
    expect(
      stripJoinQueryFromLocation(
        'https://tsuina311.github.io/PodyGuard/?join=AB23CD',
      ),
    ).toBe('/PodyGuard/');
  });

  it('returns null when join is absent', () => {
    expect(
      stripJoinQueryFromLocation('https://tsuina311.github.io/PodyGuard/'),
    ).toBeNull();
  });
});

describe('stripPlayQueryFromLocation', () => {
  it('returns pathname without play', () => {
    expect(
      stripPlayQueryFromLocation(
        'https://tsuina311.github.io/PodyGuard/?play=abc',
      ),
    ).toBe('/PodyGuard/');
  });

  it('returns null when play is absent', () => {
    expect(
      stripPlayQueryFromLocation('https://tsuina311.github.io/PodyGuard/'),
    ).toBeNull();
  });
});
