import { describe, expect, it } from 'vitest';
import { joinLinkParts, playerJoinUrl, shareableOrigin } from './join-url';

describe('playerJoinUrl', () => {
  it('builds a hash-router join link', () => {
    expect(playerJoinUrl('http://localhost:5173', '/', 'ab23cd')).toBe(
      'http://localhost:5173/#/e/AB23CD',
    );
  });

  it('keeps a GitHub Pages project path in front of the hash', () => {
    expect(
      playerJoinUrl('https://tsuina311.github.io', '/PodyGuard/', 'ab23cd'),
    ).toBe('https://tsuina311.github.io/PodyGuard/#/e/AB23CD');
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

  it('keeps the current origin when it is already routable', () => {
    expect(
      shareableOrigin(
        {
          protocol: 'https:',
          hostname: 'podyguard.example',
          port: '',
          origin: 'https://podyguard.example',
        },
        '192.168.1.101',
      ),
    ).toBe('https://podyguard.example');
  });

  it('falls back to the current origin without a LAN address', () => {
    expect(shareableOrigin(local, '')).toBe('http://localhost:5173');
  });
});

describe('joinLinkParts', () => {
  it('ignores the public site while developing on localhost', () => {
    expect(
      joinLinkParts(
        {
          protocol: 'http:',
          hostname: 'localhost',
          port: '5173',
          origin: 'http://localhost:5173',
          pathname: '/',
        },
        '192.168.1.101',
        'https://tsuina311.github.io/PodyGuard',
      ),
    ).toEqual({
      origin: 'http://192.168.1.101:5173',
      pathname: '/',
    });
  });

  it('uses the always-on site when the host opened the API origin', () => {
    expect(
      joinLinkParts(
        {
          protocol: 'https:',
          hostname: 'podyguard.onrender.com',
          port: '',
          origin: 'https://podyguard.onrender.com',
          pathname: '/',
        },
        '',
        'https://tsuina311.github.io/PodyGuard/',
      ),
    ).toEqual({
      origin: 'https://tsuina311.github.io',
      pathname: '/PodyGuard/',
    });
  });
});
