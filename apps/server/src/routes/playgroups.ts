import type { FastifyPluginAsync } from 'fastify';
import {
  parseGameMode,
  parseRulesFormat,
  type CommanderSelection,
  type GameResultType,
} from '@podyguard/shared';
import { InvalidEventInputError } from '../events/validation.js';
import { sendEventError } from './events.js';

function bearerToken(header: string | undefined): string {
  if (!header?.startsWith('Bearer ')) {
    return '';
  }
  return header.slice('Bearer '.length).trim();
}

export const playgroupRoutes: FastifyPluginAsync = async (app) => {
  app.post('/auth/email/start', async (request, reply) => {
    const body = (request.body ?? {}) as {
      email?: unknown;
      displayName?: unknown;
    };
    try {
      const result = await app.events.startEmailAuth({
        email: typeof body.email === 'string' ? body.email : '',
        displayName:
          typeof body.displayName === 'string' ? body.displayName : undefined,
      });
      return reply.code(200).send(result);
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post('/auth/email/verify', async (request, reply) => {
    const body = (request.body ?? {}) as {
      email?: unknown;
      code?: unknown;
      displayName?: unknown;
    };
    try {
      const result = await app.events.verifyEmailAuth({
        email: typeof body.email === 'string' ? body.email : '',
        code: typeof body.code === 'string' ? body.code : '',
        displayName:
          typeof body.displayName === 'string' ? body.displayName : undefined,
      });
      return reply.code(200).send(result);
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post('/auth/neon', async (request, reply) => {
    const body = (request.body ?? {}) as {
      neonUserId?: unknown;
      email?: unknown;
      displayName?: unknown;
    };
    try {
      const result = await app.events.loginWithNeonAuth({
        neonUserId: typeof body.neonUserId === 'string' ? body.neonUserId : '',
        email: typeof body.email === 'string' ? body.email : null,
        displayName:
          typeof body.displayName === 'string' ? body.displayName : undefined,
      });
      return reply.code(200).send(result);
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.get('/account/me', async (request, reply) => {
    try {
      return await app.events.getMyAccount(
        bearerToken(request.headers.authorization),
      );
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.patch('/account/me', async (request, reply) => {
    const body = (request.body ?? {}) as { displayName?: unknown };
    try {
      return await app.events.updateMyAccount(
        bearerToken(request.headers.authorization),
        {
          displayName:
            typeof body.displayName === 'string' ? body.displayName : '',
        },
      );
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.delete('/account/me', async (request, reply) => {
    try {
      await app.events.deleteMyAccount(
        bearerToken(request.headers.authorization),
      );
      return { ok: true };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post('/account/claim-guest', async (request, reply) => {
    const body = (request.body ?? {}) as { guestProfileId?: unknown };
    try {
      return await app.events.linkGuestToAccount(
        bearerToken(request.headers.authorization),
        typeof body.guestProfileId === 'string' ? body.guestProfileId : '',
      );
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.get('/playgroups', async (request, reply) => {
    try {
      const playgroups = await app.events.listMyPlaygroups(
        bearerToken(request.headers.authorization),
      );
      return { playgroups };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post('/playgroups', async (request, reply) => {
    const body = (request.body ?? {}) as {
      name?: unknown;
      guestIdentityVerification?: unknown;
    };
    try {
      const playgroup = await app.events.createPlaygroup(
        bearerToken(request.headers.authorization),
        {
          name: typeof body.name === 'string' ? body.name : '',
          guestIdentityVerification:
            body.guestIdentityVerification === 'HOST_CONFIRM'
              ? 'HOST_CONFIRM'
              : 'NONE',
        },
      );
      return reply.code(201).send({ playgroup });
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.get('/playgroups/:playgroupId', async (request, reply) => {
    const { playgroupId } = request.params as { playgroupId: string };
    try {
      const overview = await app.events.getPlaygroupOverview(
        bearerToken(request.headers.authorization),
        playgroupId,
      );
      return { overview };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.patch('/playgroups/:playgroupId', async (request, reply) => {
    const { playgroupId } = request.params as { playgroupId: string };
    const body = (request.body ?? {}) as {
      name?: unknown;
      guestIdentityVerification?: unknown;
    };
    try {
      const playgroup = await app.events.updatePlaygroup(
        bearerToken(request.headers.authorization),
        playgroupId,
        {
          name: typeof body.name === 'string' ? body.name : undefined,
          guestIdentityVerification:
            body.guestIdentityVerification === 'HOST_CONFIRM'
              ? 'HOST_CONFIRM'
              : body.guestIdentityVerification === 'NONE'
                ? 'NONE'
                : undefined,
        },
      );
      return { playgroup };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.delete('/playgroups/:playgroupId', async (request, reply) => {
    const { playgroupId } = request.params as { playgroupId: string };
    try {
      await app.events.deletePlaygroup(
        bearerToken(request.headers.authorization),
        playgroupId,
      );
      return { ok: true };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post('/playgroups/:playgroupId/guests', async (request, reply) => {
    const { playgroupId } = request.params as { playgroupId: string };
    const body = (request.body ?? {}) as {
      displayName?: unknown;
      allowDuplicate?: unknown;
    };
    try {
      const guest = await app.events.createGuestProfile(
        bearerToken(request.headers.authorization),
        playgroupId,
        {
          displayName:
            typeof body.displayName === 'string' ? body.displayName : '',
          allowDuplicate: body.allowDuplicate === true,
        },
      );
      return reply.code(201).send({ guest });
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.patch(
    '/playgroups/:playgroupId/guests/:guestId',
    async (request, reply) => {
      const { playgroupId, guestId } = request.params as {
        playgroupId: string;
        guestId: string;
      };
      const body = (request.body ?? {}) as {
        displayName?: unknown;
        archived?: unknown;
      };
      try {
        const guest = await app.events.updateGuestProfile(
          bearerToken(request.headers.authorization),
          playgroupId,
          guestId,
          {
            displayName:
              typeof body.displayName === 'string'
                ? body.displayName
                : undefined,
            archived:
              typeof body.archived === 'boolean' ? body.archived : undefined,
          },
        );
        return { guest };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.delete(
    '/playgroups/:playgroupId/guests/:guestId',
    async (request, reply) => {
      const { playgroupId, guestId } = request.params as {
        playgroupId: string;
        guestId: string;
      };
      try {
        await app.events.deleteGuestProfile(
          bearerToken(request.headers.authorization),
          playgroupId,
          guestId,
        );
        return { ok: true };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.post(
    '/playgroups/:playgroupId/guests/:guestId/merge',
    async (request, reply) => {
      const { playgroupId, guestId } = request.params as {
        playgroupId: string;
        guestId: string;
      };
      const body = (request.body ?? {}) as { targetGuestId?: unknown };
      try {
        const guest = await app.events.mergeGuestProfiles(
          bearerToken(request.headers.authorization),
          playgroupId,
          guestId,
          typeof body.targetGuestId === 'string' ? body.targetGuestId : '',
        );
        return { guest };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.post(
    '/playgroups/:playgroupId/guests/:guestId/decks',
    async (request, reply) => {
      const { playgroupId, guestId } = request.params as {
        playgroupId: string;
        guestId: string;
      };
      const body = (request.body ?? {}) as Record<string, unknown>;
      try {
        const deck = await app.events.createSavedDeckProfile(
          bearerToken(request.headers.authorization),
          playgroupId,
          guestId,
          parseSavedDeckPayload(body),
        );
        return reply.code(201).send({ deck });
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.patch(
    '/playgroups/:playgroupId/guests/:guestId/decks/:deckId',
    async (request, reply) => {
      const { playgroupId, guestId, deckId } = request.params as {
        playgroupId: string;
        guestId: string;
        deckId: string;
      };
      const body = (request.body ?? {}) as Record<string, unknown>;
      try {
        const deck = await app.events.updateSavedDeckProfile(
          bearerToken(request.headers.authorization),
          playgroupId,
          guestId,
          deckId,
          {
            ...parseSavedDeckPayload(body),
            archived:
              typeof body.archived === 'boolean' ? body.archived : undefined,
          },
        );
        return { deck };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.delete(
    '/playgroups/:playgroupId/guests/:guestId/decks/:deckId',
    async (request, reply) => {
      const { playgroupId, guestId, deckId } = request.params as {
        playgroupId: string;
        guestId: string;
        deckId: string;
      };
      try {
        await app.events.deleteSavedDeckProfile(
          bearerToken(request.headers.authorization),
          playgroupId,
          guestId,
          deckId,
        );
        return { ok: true };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.post('/playgroups/:playgroupId/games', async (request, reply) => {
    const { playgroupId } = request.params as { playgroupId: string };
    const body = (request.body ?? {}) as {
      clientGameId?: unknown;
      gameMode?: unknown;
      rulesFormat?: unknown;
      poolId?: unknown;
      durationSeconds?: unknown;
      startedAt?: unknown;
      endedAt?: unknown;
      seats?: unknown;
    };
    try {
      if (!Array.isArray(body.seats)) {
        throw new InvalidEventInputError('seats must be a list.');
      }
      const gameRecord = await app.events.recordLocalPlaygroupGame(
        bearerToken(request.headers.authorization),
        playgroupId,
        {
          clientGameId:
            typeof body.clientGameId === 'string' ? body.clientGameId : '',
          gameMode: parseGameMode(body.gameMode),
          rulesFormat: parseRulesFormat(body.rulesFormat),
          poolId: typeof body.poolId === 'string' ? body.poolId : undefined,
          durationSeconds:
            typeof body.durationSeconds === 'number'
              ? body.durationSeconds
              : undefined,
          startedAt:
            typeof body.startedAt === 'string' ? body.startedAt : undefined,
          endedAt: typeof body.endedAt === 'string' ? body.endedAt : undefined,
          seats: body.seats.map((raw) => {
            if (!raw || typeof raw !== 'object') {
              throw new InvalidEventInputError('Invalid seat entry.');
            }
            const seat = raw as Record<string, unknown>;
            const resultType =
              seat.resultType === 'WIN' ||
              seat.resultType === 'LOSS' ||
              seat.resultType === 'DRAW' ||
              seat.resultType === 'COMPLETED_NO_WINNER' ||
              seat.resultType === 'BYE'
                ? (seat.resultType as GameResultType)
                : undefined;
            return {
              guestProfileId:
                typeof seat.guestProfileId === 'string'
                  ? seat.guestProfileId
                  : undefined,
              userAccountId:
                typeof seat.userAccountId === 'string'
                  ? seat.userAccountId
                  : undefined,
              displayName:
                typeof seat.displayName === 'string' ? seat.displayName : '',
              savedDeckProfileId:
                typeof seat.savedDeckProfileId === 'string'
                  ? seat.savedDeckProfileId
                  : undefined,
              deckName:
                typeof seat.deckName === 'string' ? seat.deckName : undefined,
              commanderName:
                typeof seat.commanderName === 'string'
                  ? seat.commanderName
                  : undefined,
              commanderScryfallId:
                typeof seat.commanderScryfallId === 'string'
                  ? seat.commanderScryfallId
                  : undefined,
              bracket:
                typeof seat.bracket === 'number' ? seat.bracket : undefined,
              resultType,
              placement:
                typeof seat.placement === 'number' ? seat.placement : undefined,
              teamId: typeof seat.teamId === 'string' ? seat.teamId : undefined,
            };
          }),
        },
      );
      return reply.code(201).send({ gameRecord });
    } catch (error) {
      return sendEventError(reply, error);
    }
  });
};

function parseSavedDeckPayload(body: Record<string, unknown>): {
  format?: string;
  deckName?: string;
  commanderName?: string;
  commanderScryfallId?: string;
  commanders?: CommanderSelection[];
  bracket?: number;
  poolId?: string;
  preferred?: boolean;
} {
  return {
    format: typeof body.format === 'string' ? body.format : undefined,
    deckName: typeof body.deckName === 'string' ? body.deckName : undefined,
    commanderName:
      typeof body.commanderName === 'string' ? body.commanderName : undefined,
    commanderScryfallId:
      typeof body.commanderScryfallId === 'string'
        ? body.commanderScryfallId
        : undefined,
    commanders: Array.isArray(body.commanders)
      ? body.commanders.map((c) => {
          if (!c || typeof c !== 'object') {
            throw new InvalidEventInputError('Invalid commander.');
          }
          const row = c as Record<string, unknown>;
          return {
            oracleId: typeof row.oracleId === 'string' ? row.oracleId : '',
            cardId: typeof row.cardId === 'string' ? row.cardId : '',
            name: typeof row.name === 'string' ? row.name : '',
            artCropUri:
              typeof row.artCropUri === 'string' ? row.artCropUri : '',
            typeLine: typeof row.typeLine === 'string' ? row.typeLine : '',
            oracleText:
              typeof row.oracleText === 'string' ? row.oracleText : '',
            keywords: Array.isArray(row.keywords)
              ? row.keywords.filter((k): k is string => typeof k === 'string')
              : [],
          };
        })
      : undefined,
    bracket: typeof body.bracket === 'number' ? body.bracket : undefined,
    poolId: typeof body.poolId === 'string' ? body.poolId : undefined,
    preferred: typeof body.preferred === 'boolean' ? body.preferred : undefined,
  };
}
