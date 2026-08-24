import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import {
  ScryfallClient,
  ScryfallNetworkError,
  ScryfallNotFoundError,
  ScryfallRateLimitError,
} from '../scryfall/scryfall-client.js';

type ScryfallRoutesOptions = {
  client?: ScryfallClient;
};

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

  app.get('/scryfall/commanders', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const search = stringQuery(query.q) ?? stringQuery(query.query) ?? '';
    const pairedWith =
      stringQuery(query.pairedWith) ??
      stringQuery(query.pairWith) ??
      stringQuery(query.partnerId) ??
      stringQuery(query.selectedId);

    try {
      const cards = await client.searchCommanders(search, pairedWith);
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
