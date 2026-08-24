import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { ScryfallClient } from './scryfall-client.js';

function jsonResponse(
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function commander(overrides: Record<string, unknown> = {}) {
  return {
    id: 'card-1',
    oracle_id: 'oracle-1',
    name: 'Tymna the Weaver',
    color_identity: ['W', 'B'],
    keywords: ['Lifelink', 'Partner'],
    type_line: 'Legendary Creature — Human Cleric',
    oracle_text: 'Lifelink\nAt the beginning of your postcombat main phase...',
    image_uris: {
      normal: 'https://cards.example/normal.jpg',
      art_crop: 'https://cards.example/art.jpg',
    },
    ...overrides,
  };
}

describe('ScryfallClient commander search', () => {
  it('restricts searches to legal commanders, normalizes results, and caches them', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ data: [commander()], has_more: false }),
    );
    const client = new ScryfallClient({
      fetch: fetchMock,
      sleep: async () => undefined,
    });

    const first = await client.searchCommanders('tymna');
    const second = await client.searchCommanders('tymna');

    expect(first).toEqual([
      {
        cardId: 'card-1',
        oracleId: 'oracle-1',
        name: 'Tymna the Weaver',
        typeLine: 'Legendary Creature — Human Cleric',
        oracleText:
          'Lifelink\nAt the beginning of your postcombat main phase...',
        artCropUri: 'https://cards.example/art.jpg',
        keywords: ['Lifelink', 'Partner'],
      },
    ]);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledOnce();

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/cards/search');
    expect(url.searchParams.get('q')).toBe(
      'tymna is:commander legal:commander',
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        Accept: 'application/json',
        'User-Agent': expect.stringContaining('PodyGuard'),
      },
    });
  });

  it.each([
    ['Partner', 'Legendary Creature — Human', 'keyword:partner'],
    [
      'Partner with Haldan, Avid Arcanist',
      'Legendary Creature — Human',
      '!"Haldan, Avid Arcanist"',
    ],
    ['Friends forever', 'Legendary Creature — Human', 'o:"Friends forever"'],
    [
      'Choose a Background',
      'Legendary Creature — Human',
      't:background',
    ],
    [
      '',
      'Legendary Enchantment — Background',
      'o:"Choose a Background"',
    ],
    [
      "Doctor's companion",
      'Legendary Creature — Human',
      't:doctor',
    ],
    [
      '',
      'Legendary Creature — Time Lord Doctor',
      'o:"Doctor\'s companion"',
    ],
  ])(
    'adds the pairing constraint for %s / %s',
    async (oracleText, typeLine, expectedConstraint) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          jsonResponse(commander({ oracle_text: oracleText, type_line: typeLine })),
        )
        .mockResolvedValueOnce(jsonResponse({ data: [], has_more: false }));
      const client = new ScryfallClient({
        fetch: fetchMock,
        sleep: async () => undefined,
      });

      await client.searchCommanders('', 'selected-card');

      const searchUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
      expect(searchUrl.searchParams.get('q')).toContain(expectedConstraint);
      expect(searchUrl.searchParams.get('q')).toContain(
        'is:commander legal:commander',
      );
    },
  );

  it('finds a named partner from the other direction', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          commander({
            name: 'Haldan, Avid Arcanist',
            oracle_text: 'Other rules text',
          }),
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [], has_more: false }));
    const client = new ScryfallClient({
      fetch: fetchMock,
      sleep: async () => undefined,
    });

    await client.searchCommanders('', 'haldan-id');

    const searchUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(searchUrl.searchParams.get('q')).toContain(
      'o:"Partner with Haldan, Avid Arcanist"',
    );
  });

  it('serializes concurrent outbound requests at least 500ms apart', async () => {
    let now = 0;
    const calledAt: number[] = [];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      calledAt.push(now);
      return jsonResponse({ data: [], has_more: false });
    });
    const client = new ScryfallClient({
      fetch: fetchMock,
      now: () => now,
      sleep: async (milliseconds) => {
        now += milliseconds;
      },
    });

    await Promise.all([
      client.searchCommanders('one'),
      client.searchCommanders('two'),
      client.searchCommanders('three'),
    ]);

    expect(calledAt).toEqual([0, 500, 1_000]);
  });
});

describe('ScryfallClient artwork variants', () => {
  it('uses an exact name and returns unique parent and matching-face artwork', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(commander({ name: 'Esika, God of the Tree' })))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            commander({
              id: 'print-1',
              name: 'Esika, God of the Tree // The Prismatic Bridge',
              image_uris: { art_crop: 'https://cards.example/esika-a.jpg' },
            }),
            commander({
              id: 'print-duplicate',
              image_uris: { art_crop: 'https://cards.example/esika-a.jpg' },
            }),
            commander({
              id: 'print-2',
              image_uris: undefined,
              card_faces: [
                {
                  name: 'Esika, God of the Tree',
                  image_uris: {
                    art_crop: 'https://cards.example/esika-b.jpg',
                  },
                },
                {
                  name: 'The Prismatic Bridge',
                  image_uris: {
                    art_crop: 'https://cards.example/bridge.jpg',
                  },
                },
              ],
            }),
          ],
          has_more: false,
        }),
      );
    const client = new ScryfallClient({
      fetch: fetchMock,
      sleep: async () => undefined,
    });

    const artwork = await client.artworkVariants({
      name: 'Esika, God of the Tree',
    });

    expect(artwork).toEqual([
      {
        cardId: 'print-1',
        artCropUri: 'https://cards.example/esika-a.jpg',
      },
      {
        cardId: 'print-2',
        artCropUri: 'https://cards.example/esika-b.jpg',
      },
    ]);
    const namedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(namedUrl.pathname).toBe('/cards/named');
    expect(namedUrl.searchParams.get('exact')).toBe('Esika, God of the Tree');
    const printsUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(printsUrl.searchParams.get('q')).toBe('oracleid:oracle-1');
    expect(printsUrl.searchParams.get('unique')).toBe('prints');
  });
});

describe('Scryfall routes', () => {
  it('maps upstream rate limits and preserves Retry-After', async () => {
    const client = new ScryfallClient({
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({}, 429, { 'Retry-After': '3' })),
      sleep: async () => undefined,
    });
    const app = await buildApp({ logger: false, scryfall: client });

    const response = await app.inject({
      method: 'GET',
      url: '/scryfall/commanders?q=atraxa',
    });

    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBe('3');
    expect(response.json()).toEqual({
      error: {
        code: 'SCRYFALL_RATE_LIMITED',
        message: 'Scryfall is busy. Please try again shortly.',
      },
    });
    await app.close();
  });

  it('maps network failures to a useful gateway response', async () => {
    const client = new ScryfallClient({
      fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
      sleep: async () => undefined,
    });
    const app = await buildApp({ logger: false, scryfall: client });

    const response = await app.inject({
      method: 'GET',
      url: '/scryfall/artwork?oracleId=oracle-1',
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: {
        code: 'SCRYFALL_UNAVAILABLE',
        message: 'Scryfall could not be reached. Please try again.',
      },
    });
    await app.close();
  });
});
