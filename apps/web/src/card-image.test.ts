import { describe, expect, it } from 'vitest';
import { cardImageSrc } from './card-image';

describe('cardImageSrc', () => {
  it('loads Scryfall art through the API the installed app already uses', () => {
    const art =
      'https://cards.scryfall.io/art_crop/front/e/7/e7e778ce-3f1e-4626-8f55-bba03970d91a.jpg';
    expect(cardImageSrc(art, '')).toBe(
      `/api/scryfall/image?src=${encodeURIComponent(art)}`,
    );
    expect(cardImageSrc(art, 'https://podyguard.onrender.com')).toBe(
      `https://podyguard.onrender.com/api/scryfall/image?src=${encodeURIComponent(art)}`,
    );
    expect(
      cardImageSrc(
        'https://api.scryfall.com/cards/dsc/364?format=image&version=small',
        '',
      ),
    ).toContain('/api/scryfall/image?src=');
  });

  it('leaves local and non-Scryfall art on their own address', () => {
    expect(cardImageSrc('/dungeons/tomb.jpg', '')).toBe('/dungeons/tomb.jpg');
    expect(cardImageSrc('https://example.com/card.jpg', '')).toBe(
      'https://example.com/card.jpg',
    );
    expect(cardImageSrc('', '')).toBe('');
  });
});
