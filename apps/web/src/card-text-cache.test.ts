/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchCardText } from './api';
import { CARD_TEXT_CACHE_KEY, lookupCardText, verifyCardTextCache } from './card-text-cache';
import { readStored, removeStored, writeStored } from './device-storage';

vi.mock('./api', () => ({ searchCardText: vi.fn() }));
const card = { oracleId: 'bolt', name: 'Lightning Bolt', faces: [{ name: 'Lightning Bolt', typeLine: 'Instant',
  manaCost: '{R}', oracleText: 'Lightning Bolt deals 3 damage to any target.', power: '', toughness: '', loyalty: '', defense: '' }] };
beforeEach(() => { removeStored(CARD_TEXT_CACHE_KEY); vi.resetAllMocks(); });

describe('card text storage', () => {
  it('validates the startup cache, drops invalid/expired records, and removes extra card and face fields', () => {
    const now = Date.now();
    writeStored(CARD_TEXT_CACHE_KEY, JSON.stringify([
      { query: 'Foudre', savedAt: now, cards: [{ ...card, image_uris: { normal: 'big-image' }, faces: [{ ...card.faces[0], image: 'huge', prices: {} }] }], images: ['unneeded'] },
      { query: 'expired', savedAt: now - 86_400_000, cards: [card] },
      { query: 'bad', savedAt: now, cards: [{ ...card, faces: [{}] }] },
      { query: 'future', savedAt: now + 1, cards: [card] },
    ]));
    expect(verifyCardTextCache(now)).toEqual([{ query: 'foudre', savedAt: now, cards: [card] }]);
    expect(readStored(CARD_TEXT_CACHE_KEY)).not.toMatch(/image|prices|expired|future/);
  });

  it('recovers from corrupt JSON and stores only text, reused after a reload while offline', async () => {
    writeStored(CARD_TEXT_CACHE_KEY, '{bad');
    expect(verifyCardTextCache()).toEqual([]);
    vi.mocked(searchCardText).mockResolvedValue({ cards: [{ ...card, image_uris: {} } as typeof card] });
    expect(await lookupCardText('Foudre')).toEqual([card]);
    vi.mocked(searchCardText).mockRejectedValue(new Error('offline'));
    verifyCardTextCache();
    expect(await lookupCardText('  FOUDRE ')).toEqual([card]);
    expect(searchCardText).toHaveBeenCalledTimes(1);
    expect(readStored(CARD_TEXT_CACHE_KEY)).not.toContain('image');
  });

  it('bounds stored searches and does not cache misses or failures', async () => {
    const now = Date.now();
    writeStored(CARD_TEXT_CACHE_KEY, JSON.stringify(Array.from({ length: 45 }, (_, i) => ({ query: `name-${i}`, savedAt: now, cards: [card] }))));
    expect(verifyCardTextCache()).toHaveLength(40);
    vi.mocked(searchCardText).mockResolvedValue({ cards: [] });
    expect(await lookupCardText('absent')).toEqual([]);
    expect(verifyCardTextCache()).toHaveLength(40);
    vi.mocked(searchCardText).mockRejectedValue(new Error('offline'));
    await expect(lookupCardText('absent')).rejects.toThrow('offline');
    expect(verifyCardTextCache()).toHaveLength(40);
  });
});
