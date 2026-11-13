import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { ScryfallClient } from './scryfall-client.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const bolt = {
  id: 'bolt-fr', oracle_id: 'bolt', name: 'Lightning Bolt', printed_name: 'Foudre',
  oracle_text: 'Lightning Bolt deals 3 damage to any target.', printed_text: 'La Foudre inflige…',
  type_line: 'Instant', mana_cost: '{R}', image_uris: { normal: 'https://example.com/bolt.jpg' },
};

describe('text-only multilingual card lookup', () => {
  it.each(['Lightning Bolt', 'Foudre', 'Blitzschlag', 'Relámpago', 'Fulmine', 'Relâmpago',
    '稲妻', '번개', 'Молния', '闪电击', '閃電擊'])('accepts %s without a language or Commander restriction', async name => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({ data: [bolt, bolt] }));
    const client = new ScryfallClient({ fetch });
    const cards = await client.searchCardText(name);
    const url = new URL(String(fetch.mock.calls[0]![0]));
    expect(url.searchParams.get('q')).toBe(`!"${name}" lang:any`);
    expect(url.searchParams.get('include_multilingual')).toBe('true');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ name: 'Lightning Bolt', faces: [{ oracleText: bolt.oracle_text }] });
    expect(JSON.stringify(cards)).not.toMatch(/image|printed_|https:/);
    expect(await client.searchCardText(name)).toBe(cards);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to partial names, escapes operators, and preserves all English faces and stats', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json({}, 404))
      .mockResolvedValueOnce(json({ data: [{ id: 'dfc', oracle_id: 'dfc-oracle', name: 'Front // Back',
        card_faces: [{ name: 'Front', type_line: 'Creature', oracle_text: 'Flying', power: '2', toughness: '3' },
          { name: 'Back', type_line: 'Planeswalker', oracle_text: '+1: Draw a card.', loyalty: '4', image_uris: { normal: 'omit' } }],
      }] }));
    const client = new ScryfallClient({ fetch, sleep: async () => undefined });
    const cards = await client.searchCardText('x" or t:creature');
    expect(new URL(String(fetch.mock.calls[1]![0])).searchParams.get('q')).toBe('name:"x\\" or t:creature" lang:any');
    expect(cards[0]?.faces).toMatchObject([{ oracleText: 'Flying', power: '2', toughness: '3' }, { oracleText: '+1: Draw a card.', loyalty: '4' }]);
    expect(JSON.stringify(cards)).not.toContain('image');
  });

  it('returns no matches for unknown names and exposes a text-only route with input validation', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({ data: [bolt] }));
    const app = await buildApp({ logger: false, scryfall: new ScryfallClient({ fetch }) });
    try {
      const response = await app.inject('/scryfall/card-text?q=Foudre');
      expect(response.statusCode).toBe(200);
      expect(response.json().cards[0].faces[0].oracleText).toBe(bolt.oracle_text);
      expect(response.body).not.toContain('image');
      expect((await app.inject('/scryfall/card-text?q=')).statusCode).toBe(400);
      expect((await app.inject(`/scryfall/card-text?q=${'a'.repeat(201)}`)).statusCode).toBe(400);
      const missing = new ScryfallClient({ fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({}, 404)), sleep: async () => undefined });
      expect(await missing.searchCardText('unknown')).toEqual([]);
    } finally { await app.close(); }
  });
});
