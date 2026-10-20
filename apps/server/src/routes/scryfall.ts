import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import {
  ScryfallClient,
  ScryfallNetworkError,
  ScryfallNotFoundError,
  ScryfallRateLimitError,
} from '../scryfall/scryfall-client.js';

type ScryfallRoutesOptions = {
  client?: ScryfallClient;
  fetchImage?: typeof fetch;
};

const IMAGE_HOSTS = new Set(['cards.scryfall.io', 'api.scryfall.com']);
const IMAGE_CACHE_LIMIT = 80;

const imageCache = new Map<string, { type: string; body: Buffer }>();

/** Only Scryfall's own image hosts. Anything else must not be fetched. */
export function scryfallImageUrl(value: unknown): URL | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_000) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !IMAGE_HOSTS.has(url.hostname)) {
    return null;
  }
  return url;
}

type ErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export const scryfallRoutes: FastifyPluginAsync<ScryfallRoutesOptions> = async (
  app,
  options,
) => {
  const client = options.client ?? new ScryfallClient();
  const fetchImage = options.fetchImage ?? fetch;

  app.get('/scryfall/image', async (request, reply) => {
    const src = scryfallImageUrl(
      (request.query as Record<string, unknown>).src,
    );
    if (!src) {
      return reply.code(400).send(
        errorBody(
          'INVALID_SCRYFALL_IMAGE',
          'Card images have to come from Scryfall.',
        ),
      );
    }

    const cached = imageCache.get(src.href);
    if (cached) {
      return reply
        .header('Cache-Control', 'public, max-age=86400')
        .type(cached.type)
        .send(cached.body);
    }

    let upstream: Response;
    try {
      upstream = await fetchImage(src, {
        redirect: 'follow',
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*',
          'User-Agent': 'PodyGuard/1.0',
        },
      });
    } catch {
      return reply.code(502).send(
        errorBody(
          'SCRYFALL_UNAVAILABLE',
          'Scryfall could not be reached. Please try again.',
        ),
      );
    }

    let finalHost = src.hostname;
    if (upstream.url) {
      try {
        finalHost = new URL(upstream.url).hostname;
      } catch {
        finalHost = '';
      }
    }
    const type = upstream.headers.get('content-type') ?? '';
    if (
      !upstream.ok ||
      !IMAGE_HOSTS.has(finalHost) ||
      !type.startsWith('image/')
    ) {
      return reply.code(502).send(
        errorBody(
          'SCRYFALL_UNAVAILABLE',
          'Scryfall could not be reached. Please try again.',
        ),
      );
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    if (imageCache.size >= IMAGE_CACHE_LIMIT) {
      const oldest = imageCache.keys().next().value;
      if (oldest) {
        imageCache.delete(oldest);
      }
    }
    imageCache.set(src.href, { type, body });
    return reply
      .header('Cache-Control', 'public, max-age=86400')
      .type(type)
      .send(body);
  });

  app.get('/scryfall/commanders', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const search = stringQuery(query.q) ?? stringQuery(query.query) ?? '';
    const pairedWith =
      stringQuery(query.pairedWith) ??
      stringQuery(query.pairWith) ??
      stringQuery(query.partnerId) ??
      stringQuery(query.selectedId);

    const profile = parseSearchProfile(query.profile);

    try {
      const cards = await client.searchCommanders(search, pairedWith, profile);
      return { cards };
    } catch (error) {
      return sendScryfallError(reply, error);
    }
  });

  app.get('/scryfall/artwork', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const oracleId = stringQuery(query.oracleId);
    const name = stringQuery(query.name);
    const cardId = stringQuery(query.cardId);
    if (!oracleId && !name && !cardId) {
      return reply.code(400).send(
        errorBody(
          'INVALID_SCRYFALL_QUERY',
          'Provide oracleId, an exact card name, or cardId.',
        ),
      );
    }

    try {
      const artwork = await client.artworkVariants({ oracleId, name, cardId });
      return { artwork };
    } catch (error) {
      return sendScryfallError(reply, error);
    }
  });

  app.get('/scryfall/cards/:cardId/artwork', async (request, reply) => {
    const { cardId } = request.params as { cardId: string };
    try {
      const artwork = await client.artworkVariants({ cardId });
      return { artwork };
    } catch (error) {
      return sendScryfallError(reply, error);
    }
  });
};

function stringQuery(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parseSearchProfile(
  value: unknown,
): 'commander' | 'duel-commander' | 'brawl' {
  if (
    value === 'commander' ||
    value === 'duel-commander' ||
    value === 'brawl'
  ) {
    return value;
  }
  return 'commander';
}

function sendScryfallError(reply: FastifyReply, error: unknown) {
  if (error instanceof ScryfallRateLimitError) {
    if (error.retryAfter) {
      reply.header('Retry-After', error.retryAfter);
    }
    return reply
      .code(503)
      .send(
        errorBody(
          'SCRYFALL_RATE_LIMITED',
          'Scryfall is busy. Please try again shortly.',
        ),
      );
  }
  if (error instanceof ScryfallNotFoundError) {
    return reply
      .code(404)
      .send(errorBody('SCRYFALL_CARD_NOT_FOUND', error.message));
  }
  if (error instanceof ScryfallNetworkError) {
    return reply
      .code(502)
      .send(
        errorBody(
          'SCRYFALL_UNAVAILABLE',
          'Scryfall could not be reached. Please try again.',
        ),
      );
  }

  reply.log.error({ err: error }, 'Unexpected Scryfall adapter error');
  return reply
    .code(502)
    .send(
      errorBody(
        'SCRYFALL_UNAVAILABLE',
        'Scryfall could not be reached. Please try again.',
      ),
    );
}

function errorBody(code: string, message: string): ErrorBody {
  return { error: { code, message } };
}
