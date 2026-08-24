import { describe, expect, it } from 'vitest';
import { playerJoinUrl, shareableOrigin } from './join-url';

describe('playerJoinUrl', () => {
  it('builds a hash-router join link', () => {
    expect(playerJoinUrl('http://localhost:5173', '/', 'ab23cd')).toBe(
      'http://localhost:5173#/e/AB23CD',
    );
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
