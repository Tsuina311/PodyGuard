import { describe, expect, it } from 'vitest';
import { assetUrl } from './asset-url';

describe('public asset urls', () => {
  it('keeps root-absolute art reachable under a sub-path deployment', () => {
    expect(assetUrl('/treachery-identities/058.jpg', '/PodyGuard/')).toBe(
      '/PodyGuard/treachery-identities/058.jpg',
    );
    expect(assetUrl('/dungeons/tomb.jpg', '/PodyGuard/')).toBe(
      '/PodyGuard/dungeons/tomb.jpg',
    );
  });

  it('leaves art unchanged when the app owns the root', () => {
    expect(assetUrl('/treachery-identities/058.jpg', '/')).toBe(
      '/treachery-identities/058.jpg',
    );
  });

  it('passes through absolute urls from other hosts', () => {
    const scryfall = 'https://api.scryfall.com/cards/dsc/1?format=image';
    expect(assetUrl(scryfall, '/PodyGuard/')).toBe(scryfall);
  });
});
