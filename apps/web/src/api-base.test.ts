import { describe, expect, it } from 'vitest';
import { apiRoot, resolveApiUrl } from './api-base';

describe('apiRoot', () => {
  it('treats a missing base as same-origin', () => {
    expect(apiRoot('')).toBe('');
    expect(apiRoot('  ')).toBe('');
  });

  it('strips a trailing slash from a remote API', () => {
    expect(apiRoot('https://podyguard.onrender.com/')).toBe(
      'https://podyguard.onrender.com',
    );
  });
});

describe('resolveApiUrl', () => {
  it('keeps the Vite proxy prefix on the same origin', () => {
    expect(resolveApiUrl('/events', '')).toBe('/api/events');
    expect(resolveApiUrl('/health', '')).toBe('/api/health');
  });

  it('points at Render when the always-on site is elsewhere', () => {
    expect(resolveApiUrl('/events', 'https://podyguard.onrender.com')).toBe(
      'https://podyguard.onrender.com/api/events',
    );
  });
});
