import { describe, expect, it } from 'vitest';
import { joinCodeFromQueryString, playerJoinUrl } from './join-url';

/**
 * Entry-path contract for phone QR deep links. Keep HashRouter internally;
 * only the external encoded URL uses ?join=.
 */
describe('join entry paths', () => {
  it('accepts production Pages query links', () => {
    const url = playerJoinUrl(
      'https://tsuina311.github.io',
      '/PodyGuard/',
      'ab23cd',
    );
    expect(url).toBe('https://tsuina311.github.io/PodyGuard/?join=AB23CD');
    expect(joinCodeFromQueryString(new URL(url).search)).toBe('AB23CD');
  });

  it('ignores malformed join query values', () => {
    expect(joinCodeFromQueryString('?join=%%%')).toBeNull();
    expect(joinCodeFromQueryString('?join=TOO_LONG_CODE')).toBeNull();
  });

  it('treats a missing join query as absent', () => {
    expect(joinCodeFromQueryString('?')).toBeNull();
    expect(joinCodeFromQueryString('')).toBeNull();
  });
});
