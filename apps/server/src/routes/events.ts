import type { FastifyPluginAsync } from 'fastify';
import {
  normalizeJoinCode,
  parseGameMode,
  parseRulesFormat,
  isLimitedMode,
  defaultLimitedEventModeConfig,
  type CommanderSelection,
  type LimitedEventModeConfig,
  type LimitedMatchOutcome,
  type LimitedSessionStatus,
  type LimitedTimerPhase,
} from '@podyguard/shared';
import {
  EventNotFoundError,
  EventNotJoinableError,
  InvalidHostPinError,
  InvalidParticipantTransitionError,
  ParticipantNotFoundError,
  TableNotFoundError,
  DevToolsDisabledError,
  LimitedPersistenceConflictError,
  PodNotFoundError,
} from '../events/event-store.js';
import { LimitedSessionNotFoundError } from '../events/event-service.js';
import { InvalidEventInputError } from '../events/validation.js';
import {
  InvalidHostEventSessionError,
  InvalidParticipantSessionError,
  ParticipantSessionSecretMissingError,
} from '../identity/index.js';

type ErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

function errorBody(code: string, message: string): ErrorBody {
  return { error: { code, message } };
}

function bearerToken(header: string | undefined): string {
  if (!header?.startsWith('Bearer ')) {
    return '';
  }
  return header.slice('Bearer '.length).trim();
}

export const eventRoutes: FastifyPluginAsync = async (app) => {
  app.post('/events', async (request, reply) => {
    const body = (request.body ?? {}) as {
      name?: unknown;
      hostPin?: unknown;
      tableCount?: unknown;
      gameMode?: unknown;
      rulesFormat?: unknown;
      allowThreePods?: unknown;
      allowFivePods?: unknown;
      preferredPodSize?: unknown;
      lifetimeHours?: unknown;
      tournamentFormat?: unknown;
      tournamentOptions?: unknown;
      limitedModeConfigs?: unknown;
    };
    try {
      const result = await app.events.createEvent({
        name: typeof body.name === 'string' ? body.name : '',
        hostPin: typeof body.hostPin === 'string' ? body.hostPin : '',
        tableCount: parseTableCount(body.tableCount),
        gameMode: parseGameMode(body.gameMode),
        rulesFormat: parseRulesFormat(body.rulesFormat),
        allowThreePods: body.allowThreePods === undefined ? undefined : Boolean(body.allowThreePods),
        allowFivePods: body.allowFivePods === undefined ? undefined : Boolean(body.allowFivePods),
        preferredPodSize:
          typeof body.preferredPodSize === 'number' ? body.preferredPodSize : undefined,
        lifetimeHours:
          typeof body.lifetimeHours === 'number' ? body.lifetimeHours : undefined,
        tournamentFormat:
          body.tournamentFormat === 'single-elimination' ||
          body.tournamentFormat === 'swiss'
            ? body.tournamentFormat
            : undefined,
        tournamentOptions:
          body.tournamentOptions && typeof body.tournamentOptions === 'object'
            ? (body.tournamentOptions as {
                matchSize?: number;
                defaultBestOf?: 1 | 3 | 5;
                finalBestOf?: 1 | 3 | 5;
                swissRounds?: number;
              })
            : undefined,
        limitedModeConfigs: parseLimitedModeConfigs(body.limitedModeConfigs),
      });
      return reply.code(201).send(result);
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.get('/events/:joinCode', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    try {
      const event = await app.events.getEvent(normalizeJoinCode(joinCode));
      return event;
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.get('/events/:joinCode/participants', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    try {
      const participants = await app.events.listParticipants(
        normalizeJoinCode(joinCode),
      );
      return { participants };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post('/events/:joinCode/tournament/start', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    try {
      const event = await app.events.startTournament(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return { event };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post(
    '/events/:joinCode/tournament/matches/:matchId/result',
    async (request, reply) => {
      const { joinCode, matchId } = request.params as {
        joinCode: string;
        matchId: string;
      };
      const body = (request.body ?? {}) as {
        winnerParticipantId?: unknown;
      };
      try {
        const event = await app.events.reportTournamentResult(
          normalizeJoinCode(joinCode),
          bearerToken(request.headers.authorization),
          matchId,
          typeof body.winnerParticipantId === 'string'
            ? body.winnerParticipantId
            : '',
        );
        await app.live.publish(normalizeJoinCode(joinCode));
        return { event };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.post(
    '/events/:joinCode/tournament/matches/:matchId/best-of',
    async (request, reply) => {
      const { joinCode, matchId } = request.params as {
        joinCode: string;
        matchId: string;
      };
      const body = (request.body ?? {}) as { bestOf?: unknown };
      const bestOf = body.bestOf;
      if (bestOf !== 1 && bestOf !== 3 && bestOf !== 5) {
        return reply.code(400).send({ error: 'bestOf must be 1, 3, or 5.' });
      }
      try {
        const event = await app.events.setTournamentMatchBestOf(
          normalizeJoinCode(joinCode),
          bearerToken(request.headers.authorization),
          matchId,
          bestOf,
        );
        await app.live.publish(normalizeJoinCode(joinCode));
        return { event };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.post('/events/:joinCode/join', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    const body = (request.body ?? {}) as {
      displayName?: unknown;
      decks?: unknown;
    };
    try {
      const result = await app.events.joinEvent(
        normalizeJoinCode(joinCode),
        typeof body.displayName === 'string' ? body.displayName : '',
        parseDeckDrafts(body.decks),
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return reply.code(201).send(result);
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.get('/events/:joinCode/me', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    try {
      const result = await app.events.getMe(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
      );
      return result;
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.get('/events/:joinCode/me/treachery-role', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    try {
      const assignment = await app.events.getTreacheryRole(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
      );
      return { assignment };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post(
    '/events/:joinCode/me/treachery-identity/unveil',
    async (request, reply) => {
      const { joinCode } = request.params as { joinCode: string };
      try {
        const assignment = await app.events.unveilTreacheryIdentity(
          normalizeJoinCode(joinCode),
          bearerToken(request.headers.authorization),
        );
        await app.live.publish(normalizeJoinCode(joinCode));
        return { assignment };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.put('/events/:joinCode/decks', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    const body = (request.body ?? {}) as { decks?: unknown };
    try {
      const participant = await app.events.setDecks(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
        parseDeckDrafts(body.decks) ?? [],
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return { participant };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post('/events/:joinCode/ready', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    const body = (request.body ?? {}) as { ready?: unknown };
    try {
      const participant = await app.events.setReady(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
        body.ready === true,
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return { participant };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post('/events/:joinCode/pause', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    const body = (request.body ?? {}) as { paused?: unknown };
    try {
      const participant = await app.events.setPaused(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
        body.paused !== false,
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return { participant };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.put('/events/:joinCode/limited/queue', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    const body = (request.body ?? {}) as { mode?: unknown };
    try {
      if (!isLimitedMode(body.mode)) {
        throw new InvalidEventInputError('Choose a valid Limited mode.');
      }
      const snapshot = await app.events.joinLimitedQueue(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
        body.mode,
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return { snapshot };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.delete('/events/:joinCode/limited/queue', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    try {
      const snapshot = await app.events.leaveLimitedQueue(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return { snapshot };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post('/events/:joinCode/limited/sessions', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    const body = (request.body ?? {}) as {
      mode?: unknown;
      participantCount?: unknown;
      allowUndersizedLaunch?: unknown;
      label?: unknown;
      draftTableIds?: unknown;
    };
    try {
      if (!isLimitedMode(body.mode)) {
        throw new InvalidEventInputError('Choose a valid Limited mode.');
      }
      const session = await app.events.createLimitedSession(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
        {
          mode: body.mode,
          participantCount:
            typeof body.participantCount === 'number'
              ? body.participantCount
              : undefined,
          allowUndersizedLaunch: body.allowUndersizedLaunch === true,
          label: typeof body.label === 'string' ? body.label : undefined,
          draftTableIds: stringArray(body.draftTableIds, 'draftTableIds'),
        },
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return reply.code(201).send({ session });
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post(
    '/events/:joinCode/limited/sessions/:sessionId/launch',
    async (request, reply) => {
      const { joinCode, sessionId } = request.params as {
        joinCode: string;
        sessionId: string;
      };
      try {
        const session = await app.events.launchLimitedSession(
          normalizeJoinCode(joinCode),
          bearerToken(request.headers.authorization),
          sessionId,
        );
        await app.live.publish(normalizeJoinCode(joinCode));
        return { session };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.put(
    '/events/:joinCode/limited/sessions/:sessionId/roster',
    async (request, reply) => {
      const { joinCode, sessionId } = request.params as {
        joinCode: string;
        sessionId: string;
      };
      const body = (request.body ?? {}) as { participantIds?: unknown };
      try {
        const participantIds = stringArray(
          body.participantIds,
          'participantIds',
        );
        if (!participantIds) {
          throw new InvalidEventInputError(
            'participantIds must be a list of strings.',
          );
        }
        const session = await app.events.replaceLimitedSessionRoster(
          normalizeJoinCode(joinCode),
          bearerToken(request.headers.authorization),
          sessionId,
          participantIds,
        );
        await app.live.publish(normalizeJoinCode(joinCode));
        return { session };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.put(
    '/events/:joinCode/limited/sessions/:sessionId/tables',
    async (request, reply) => {
      const { joinCode, sessionId } = request.params as {
        joinCode: string;
        sessionId: string;
      };
      const body = (request.body ?? {}) as { tableIds?: unknown };
      try {
        const tableIds = stringArray(body.tableIds, 'tableIds');
        if (!tableIds) {
          throw new InvalidEventInputError(
            'tableIds must be a list of strings.',
          );
        }
        const session = await app.events.replaceLimitedDraftTables(
          normalizeJoinCode(joinCode),
          bearerToken(request.headers.authorization),
          sessionId,
          tableIds,
        );
        await app.live.publish(normalizeJoinCode(joinCode));
        return { session };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.post(
    '/events/:joinCode/limited/sessions/:sessionId/phase',
    async (request, reply) => {
      const { joinCode, sessionId } = request.params as {
        joinCode: string;
        sessionId: string;
      };
      const body = (request.body ?? {}) as {
        status?: unknown;
        durationSeconds?: unknown;
      };
      try {
        const status = parseLimitedSessionStatus(body.status);
        const session = await app.events.advanceLimitedSession(
          normalizeJoinCode(joinCode),
          bearerToken(request.headers.authorization),
          sessionId,
          status,
          typeof body.durationSeconds === 'number'
            ? body.durationSeconds
            : undefined,
        );
        await app.live.publish(normalizeJoinCode(joinCode));
        return { session };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.post(
    '/events/:joinCode/limited/sessions/:sessionId/timer',
    async (request, reply) => {
      const { joinCode, sessionId } = request.params as {
        joinCode: string;
        sessionId: string;
      };
      const body = (request.body ?? {}) as {
        action?: unknown;
        durationSeconds?: unknown;
        seconds?: unknown;
        phase?: unknown;
      };
      try {
        const action =
          body.action === 'START' ||
          body.action === 'PAUSE' ||
          body.action === 'RESUME' ||
          body.action === 'ADD'
            ? body.action
            : undefined;
        if (!action) {
          throw new InvalidEventInputError('Choose a Limited timer action.');
        }
        const session = await app.events.updateLimitedTimer(
          normalizeJoinCode(joinCode),
          bearerToken(request.headers.authorization),
          sessionId,
          action,
          {
            durationSeconds:
              typeof body.durationSeconds === 'number'
                ? body.durationSeconds
                : undefined,
            seconds: typeof body.seconds === 'number' ? body.seconds : undefined,
            phase: parseLimitedTimerPhase(body.phase),
          },
        );
        await app.live.publish(normalizeJoinCode(joinCode));
        return { session };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.post(
    '/events/:joinCode/limited/sessions/:sessionId/rounds',
    async (request, reply) => {
      const { joinCode, sessionId } = request.params as {
        joinCode: string;
        sessionId: string;
      };
      try {
        const session = await app.events.startLimitedRound(
          normalizeJoinCode(joinCode),
          bearerToken(request.headers.authorization),
          sessionId,
        );
        await app.live.publish(normalizeJoinCode(joinCode));
        return reply.code(201).send({ session });
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.post(
    '/events/:joinCode/limited/sessions/:sessionId/matches/:matchId/result',
    async (request, reply) => {
      const { joinCode, sessionId, matchId } = request.params as {
        joinCode: string;
        sessionId: string;
        matchId: string;
      };
      try {
        const session = await app.events.reportLimitedResult(
          normalizeJoinCode(joinCode),
          bearerToken(request.headers.authorization),
          sessionId,
          matchId,
          parseLimitedResult(request.body),
        );
        await app.live.publish(normalizeJoinCode(joinCode));
        return { session };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.post(
    '/events/:joinCode/limited/sessions/:sessionId/matches/:matchId/correct',
    async (request, reply) => {
      const { joinCode, sessionId, matchId } = request.params as {
        joinCode: string;
        sessionId: string;
        matchId: string;
      };
      const body = (request.body ?? {}) as { correctionReason?: unknown };
      try {
        const session = await app.events.correctLimitedResult(
          normalizeJoinCode(joinCode),
          bearerToken(request.headers.authorization),
          sessionId,
          matchId,
          {
            ...parseLimitedResult(body),
            correctionReason:
              typeof body.correctionReason === 'string'
                ? body.correctionReason
                : '',
          },
        );
        await app.live.publish(normalizeJoinCode(joinCode));
        return { session };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.post(
    '/events/:joinCode/limited/sessions/:sessionId/drop',
    async (request, reply) => {
      const { joinCode, sessionId } = request.params as {
        joinCode: string;
        sessionId: string;
      };
      try {
        const session = await app.events.dropLimitedPlayer(
          normalizeJoinCode(joinCode),
          bearerToken(request.headers.authorization),
          sessionId,
        );
        await app.live.publish(normalizeJoinCode(joinCode));
        return { session };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.post(
    '/events/:joinCode/limited/sessions/:sessionId/participants/:participantId/drop',
    async (request, reply) => {
      const { joinCode, sessionId, participantId } = request.params as {
        joinCode: string;
        sessionId: string;
        participantId: string;
      };
      try {
        const session = await app.events.dropLimitedPlayer(
          normalizeJoinCode(joinCode),
          bearerToken(request.headers.authorization),
          sessionId,
          participantId,
        );
        await app.live.publish(normalizeJoinCode(joinCode));
        return { session };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.post(
    '/events/:joinCode/limited/sessions/:sessionId/cancel',
    async (request, reply) => {
      const { joinCode, sessionId } = request.params as {
        joinCode: string;
        sessionId: string;
      };
      try {
        const session = await app.events.cancelLimitedSession(
          normalizeJoinCode(joinCode),
          bearerToken(request.headers.authorization),
          sessionId,
        );
        await app.live.publish(normalizeJoinCode(joinCode));
        return { session };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.post(
    '/events/:joinCode/limited/sessions/:sessionId/complete',
    async (request, reply) => {
      const { joinCode, sessionId } = request.params as {
        joinCode: string;
        sessionId: string;
      };
      try {
        const session = await app.events.completeLimitedSession(
          normalizeJoinCode(joinCode),
          bearerToken(request.headers.authorization),
          sessionId,
        );
        await app.live.publish(normalizeJoinCode(joinCode));
        return { session };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.post('/events/:joinCode/leave', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    try {
      const participant = await app.events.leaveEvent(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return { participant };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.delete(
    '/events/:joinCode/participants/:participantId',
    async (request, reply) => {
      const { joinCode, participantId } = request.params as {
        joinCode: string;
        participantId: string;
      };
      try {
        const participant = await app.events.removeParticipant(
          normalizeJoinCode(joinCode),
          bearerToken(request.headers.authorization),
          participantId,
        );
        await app.live.publish(normalizeJoinCode(joinCode));
        return { participant };
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.post('/events/:joinCode/tracker-choice', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    const body = (request.body ?? {}) as { trackerUsed?: unknown };
    try {
      const participant = await app.events.chooseTracker(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
        body.trackerUsed === true,
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return { participant };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post('/events/:joinCode/result', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    const body = (request.body ?? {}) as {
      winnerParticipantId?: unknown;
      durationSeconds?: unknown;
    };
    try {
      const participant = await app.events.reportGameResult(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
        {
          winnerParticipantId:
            typeof body.winnerParticipantId === 'string'
              ? body.winnerParticipantId
              : '',
          durationSeconds:
            typeof body.durationSeconds === 'number'
              ? body.durationSeconds
              : undefined,
        },
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return { participant };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post(
    '/events/:joinCode/challenges/:challengeId/complete',
    async (request, reply) => {
      const { joinCode, challengeId } = request.params as {
        joinCode: string;
        challengeId: string;
      };
      const body = (request.body ?? {}) as {
        targetParticipantId?: unknown;
        source?: unknown;
        confirmed?: unknown;
      };
      try {
        const source =
          body.source === 'automatic' ||
          body.source === 'confirmation' ||
          body.source === 'manual'
            ? body.source
            : 'manual';
        const result = await app.events.completeChallenge(
          normalizeJoinCode(joinCode),
          bearerToken(request.headers.authorization),
          {
            challengeId,
            targetParticipantId:
              typeof body.targetParticipantId === 'string'
                ? body.targetParticipantId
                : '',
            source,
            confirmed: body.confirmed === true,
          },
        );
        if (result.created) {
          await app.live.publish(normalizeJoinCode(joinCode));
        }
        return result;
      } catch (error) {
        return sendEventError(reply, error);
      }
    },
  );

  app.get('/events/:joinCode/tables', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    try {
      const tables = await app.events.listTables(normalizeJoinCode(joinCode));
      return { tables };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post('/events/:joinCode/tables', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    const body = (request.body ?? {}) as {
      count?: unknown;
      labels?: unknown;
    };
    try {
      const tables = await app.events.addTables(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
        {
          count: typeof body.count === 'number' ? body.count : undefined,
          labels: Array.isArray(body.labels)
            ? body.labels.filter((item): item is string => typeof item === 'string')
            : undefined,
        },
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return reply.code(201).send({ tables });
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.patch('/events/:joinCode/tables/:tableId', async (request, reply) => {
    const { joinCode, tableId } = request.params as {
      joinCode: string;
      tableId: string;
    };
    const body = (request.body ?? {}) as { status?: unknown };
    try {
      const status = body.status === 'disabled' ? 'disabled' : 'free';
      const table = await app.events.setTableStatus(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
        tableId,
        status,
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return { table };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post('/events/:joinCode/tables/:tableId/start', async (request, reply) => {
    const { joinCode, tableId } = request.params as {
      joinCode: string;
      tableId: string;
    };
    try {
      const table = await app.events.startTable(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
        tableId,
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return { table };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post('/events/:joinCode/tables/:tableId/finish', async (request, reply) => {
    const { joinCode, tableId } = request.params as {
      joinCode: string;
      tableId: string;
    };
    try {
      const table = await app.events.finishTable(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
        tableId,
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return { table };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post('/events/:joinCode/tables/:tableId/cancel', async (request, reply) => {
    const { joinCode, tableId } = request.params as {
      joinCode: string;
      tableId: string;
    };
    try {
      const table = await app.events.cancelTable(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
        tableId,
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return { table };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.patch('/events/:joinCode/settings', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    const body = (request.body ?? {}) as {
      allowThreePods?: unknown;
      allowFivePods?: unknown;
      preferredPodSize?: unknown;
      lifetimeHours?: unknown;
    };
    try {
      const event = await app.events.updateMatchSettings(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
        {
          allowThreePods:
            typeof body.allowThreePods === 'boolean' ? body.allowThreePods : undefined,
          allowFivePods:
            typeof body.allowFivePods === 'boolean' ? body.allowFivePods : undefined,
          preferredPodSize:
            typeof body.preferredPodSize === 'number' ? body.preferredPodSize : undefined,
          lifetimeHours:
            typeof body.lifetimeHours === 'number' ? body.lifetimeHours : undefined,
        },
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return { event };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post('/events/:joinCode/match', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    try {
      const result = await app.events.matchNow(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return result;
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post('/events/:joinCode/dev/fill-bots', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    try {
      const result = await app.events.fillTablesWithBots(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return result;
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post('/events/:joinCode/host', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    const body = (request.body ?? {}) as { hostPin?: unknown };
    try {
      const result = await app.events.unlockHost(
        normalizeJoinCode(joinCode),
        typeof body.hostPin === 'string' ? body.hostPin : '',
      );
      return result;
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post('/events/:joinCode/host/cancel', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    try {
      const event = await app.events.cancelEvent(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return { event };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.get('/events/:joinCode/host', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    try {
      const event = await app.events.verifyHostToken(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
      );
      return { event };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.put('/events/:joinCode/pack', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    const body = (request.body ?? {}) as { mode?: unknown; pack?: unknown };
    try {
      const mode =
        body.mode === 'copy-official' ||
        body.mode === 'from-scratch' ||
        body.mode === 'save'
          ? body.mode
          : undefined;
      if (!mode) {
        throw new InvalidEventInputError(
          'Choose copy-official, from-scratch, or save.',
        );
      }
      const event = await app.events.saveChallengePack(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
        { mode, pack: body.pack },
      );
      await app.live.publish(normalizeJoinCode(joinCode));
      return { event };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.get('/events/:joinCode/metrics', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    try {
      const metrics = await app.events.getMetrics(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
      );
      return { metrics };
    } catch (error) {
      return sendEventError(reply, error);
    }
  });

  app.post('/events/:joinCode/pod-rating', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    const body = (request.body ?? {}) as { rating?: unknown };
    try {
      const rating =
        body.rating === 1 ||
        body.rating === 2 ||
        body.rating === 3 ||
        body.rating === 4
          ? body.rating
          : undefined;
      if (!rating) {
        throw new InvalidEventInputError('Choose a pod rating from 1 to 4.');
      }
      return await app.events.rateLastPod(
        normalizeJoinCode(joinCode),
        bearerToken(request.headers.authorization),
        rating,
      );
    } catch (error) {
      return sendEventError(reply, error);
    }
  });
};

function parseTableCount(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value);
  }
  return Number.NaN;
}

function parseDeckDrafts(
  value: unknown,
): Array<{
  name?: string;
  poolId: string;
  preference?: 'preferred' | 'accepted';
  commanders?: CommanderSelection[];
}> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new InvalidEventInputError('Decks must be a list.');
  }
  return value.map((item) => {
    if (typeof item !== 'object' || item === null) {
      throw new InvalidEventInputError('Each deck is invalid.');
    }
    const row = item as {
      name?: unknown;
      poolId?: unknown;
      preference?: unknown;
      commanders?: unknown;
    };
    return {
      name: typeof row.name === 'string' ? row.name : undefined,
      poolId: typeof row.poolId === 'string' ? row.poolId : '',
      preference:
        row.preference === 'preferred' || row.preference === 'accepted'
          ? row.preference
          : undefined,
      commanders:
        row.commanders === undefined ? undefined : parseCommanders(row.commanders),
    };
  });
}

function parseLimitedModeConfigs(value: unknown): LimitedEventModeConfig[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new InvalidEventInputError('Limited mode configs must be a list.');
  }
  return value.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new InvalidEventInputError('Each Limited mode config is invalid.');
    }
    const row = item as Record<string, unknown>;
    if (!isLimitedMode(row.mode)) {
      throw new InvalidEventInputError('Choose a valid Limited mode.');
    }
    const defaults = defaultLimitedEventModeConfig(row.mode);
    return {
      ...defaults,
      enabled: row.enabled === undefined ? defaults.enabled : row.enabled === true,
      matchStructure:
        row.matchStructure === 'BO1' || row.matchStructure === 'BO3'
          ? row.matchStructure
          : defaults.matchStructure,
      preferredCohortSize:
        typeof row.preferredCohortSize === 'number'
          ? row.preferredCohortSize
          : defaults.preferredCohortSize,
      minCohortSize:
        typeof row.minCohortSize === 'number'
          ? row.minCohortSize
          : defaults.minCohortSize,
      maxCohortSize:
        typeof row.maxCohortSize === 'number'
          ? row.maxCohortSize
          : defaults.maxCohortSize,
      allowUndersizedLaunch:
        row.allowUndersizedLaunch === undefined
          ? defaults.allowUndersizedLaunch
          : row.allowUndersizedLaunch === true,
      totalRounds:
        row.totalRounds === 'AUTO' || typeof row.totalRounds === 'number'
          ? row.totalRounds
          : defaults.totalRounds,
      draftMinutes:
        typeof row.draftMinutes === 'number'
          ? row.draftMinutes
          : defaults.draftMinutes,
      deckbuildingMinutes:
        typeof row.deckbuildingMinutes === 'number'
          ? row.deckbuildingMinutes
          : defaults.deckbuildingMinutes,
      roundMinutes:
        typeof row.roundMinutes === 'number'
          ? row.roundMinutes
          : defaults.roundMinutes,
    };
  });
}

function stringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new InvalidEventInputError(`${field} must be a list of strings.`);
  }
  return value as string[];
}

function parseLimitedSessionStatus(value: unknown): LimitedSessionStatus {
  const allowed: LimitedSessionStatus[] = [
    'DRAFTING',
    'DECKBUILDING',
    'BETWEEN_ROUNDS',
  ];
  if (!allowed.includes(value as LimitedSessionStatus)) {
    throw new InvalidEventInputError('Choose a valid next Limited phase.');
  }
  return value as LimitedSessionStatus;
}

function parseLimitedTimerPhase(value: unknown): LimitedTimerPhase | undefined {
  return value === 'DRAFTING' || value === 'DECKBUILDING' || value === 'ROUND'
    ? value
    : undefined;
}

function parseLimitedResult(value: unknown): {
  outcome: LimitedMatchOutcome;
  playerAGameWins: number;
  playerBGameWins: number;
} {
  const body = (value ?? {}) as Record<string, unknown>;
  const outcomes: LimitedMatchOutcome[] = [
    'PLAYER_A_WIN',
    'PLAYER_B_WIN',
    'DRAW',
    'DOUBLE_LOSS',
  ];
  if (!outcomes.includes(body.outcome as LimitedMatchOutcome)) {
    throw new InvalidEventInputError('Choose a valid Limited result.');
  }
  return {
    outcome: body.outcome as LimitedMatchOutcome,
    playerAGameWins:
      typeof body.playerAGameWins === 'number'
        ? body.playerAGameWins
        : Number.NaN,
    playerBGameWins:
      typeof body.playerBGameWins === 'number'
        ? body.playerBGameWins
        : Number.NaN,
  };
}

function parseCommanders(value: unknown): CommanderSelection[] {
  if (!Array.isArray(value)) {
    throw new InvalidEventInputError('Commanders must be a list.');
  }
  return value.map((item) => {
    if (typeof item !== 'object' || item === null) {
      throw new InvalidEventInputError('Each commander is invalid.');
    }
    const row = item as Record<string, unknown>;
    return {
      oracleId: parseCommanderString(row.oracleId, 'oracle ID'),
      cardId: parseCommanderString(row.cardId, 'card ID'),
      name: parseCommanderString(row.name, 'name'),
      artCropUri: parseCommanderString(row.artCropUri, 'art URL'),
      typeLine: parseCommanderString(row.typeLine, 'type line'),
      oracleText: parseCommanderString(row.oracleText, 'oracle text'),
      keywords: parseCommanderKeywords(row.keywords),
    };
  });
}

function parseCommanderString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new InvalidEventInputError(`Commander ${field} must be a string.`);
  }
  return value;
}

function parseCommanderKeywords(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new InvalidEventInputError('Commander keywords must be a list of strings.');
  }
  return value;
}

function sendEventError(
  reply: { code: (status: number) => { send: (payload: ErrorBody) => unknown } },
  error: unknown,
) {
  if (error instanceof InvalidEventInputError) {
    return reply.code(400).send(errorBody(error.code, error.message));
  }
  if (
    error instanceof EventNotFoundError ||
    error instanceof TableNotFoundError ||
    error instanceof PodNotFoundError ||
    error instanceof ParticipantNotFoundError ||
    error instanceof LimitedSessionNotFoundError
  ) {
    return reply.code(404).send(errorBody(error.code, error.message));
  }
  if (
    error instanceof EventNotJoinableError ||
    error instanceof InvalidParticipantTransitionError ||
    error instanceof LimitedPersistenceConflictError
  ) {
    return reply.code(409).send(errorBody(error.code, error.message));
  }
  if (
    error instanceof InvalidHostPinError ||
    error instanceof InvalidHostEventSessionError ||
    error instanceof InvalidParticipantSessionError
  ) {
    return reply.code(401).send(errorBody(error.code, error.message));
  }
  if (error instanceof DevToolsDisabledError) {
    return reply.code(403).send(errorBody(error.code, error.message));
  }
  if (error instanceof ParticipantSessionSecretMissingError) {
    return reply.code(503).send(errorBody(error.code, error.message));
  }
  throw error;
}
