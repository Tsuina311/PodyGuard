import type { FastifyPluginAsync } from 'fastify';
import {
  DisplayNotFoundError,
  DisplayPairingExpiredError,
  DisplayPairingInvalidError,
  DisplayPairingRateLimitedError,
  DisplayUnauthorizedError,
  InvalidDisplayAnnouncementError,
} from '../display/display-service.js';
import {
  InvalidHostPinError,
  EventNotFoundError,
} from '../events/event-store.js';
import { InvalidHostEventSessionError } from '../identity/index.js';

function bearerToken(header: string | undefined): string {
  if (!header?.startsWith('Bearer ')) {
    return '';
  }
  return header.slice('Bearer '.length).trim();
}

function sendDisplayError(
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  error: unknown,
) {
  if (
    error instanceof DisplayPairingInvalidError ||
    error instanceof DisplayPairingExpiredError ||
    error instanceof DisplayNotFoundError ||
    error instanceof EventNotFoundError
  ) {
    return reply.code(404).send({
      error: { code: error.code, message: error.message },
    });
  }
  if (
    error instanceof DisplayUnauthorizedError ||
    error instanceof InvalidHostPinError ||
    error instanceof InvalidHostEventSessionError
  ) {
    return reply.code(401).send({
      error: {
        code: 'code' in error ? error.code : 'UNAUTHORIZED',
        message: error.message,
      },
    });
  }
  if (error instanceof DisplayPairingRateLimitedError) {
    return reply.code(429).send({
      error: { code: error.code, message: error.message },
    });
  }
  if (error instanceof InvalidDisplayAnnouncementError) {
    return reply.code(400).send({
      error: { code: error.code, message: error.message },
    });
  }
  throw error;
}

export const displayRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/displays/pair',
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '15 minutes',
        },
      },
    },
    async (_request, reply) => {
      try {
        const pairing = await app.displays.beginPairing();
        return reply.code(201).send(pairing);
      } catch (error) {
        return sendDisplayError(reply, error);
      }
    },
  );

  app.get('/displays/pair/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    try {
      return await app.displays.pollPairing(sessionId);
    } catch (error) {
      return sendDisplayError(reply, error);
    }
  });

  app.post('/displays/pair/:sessionId/claim', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    try {
      const claimed = await app.displays.claimToken(sessionId);
      return claimed;
    } catch (error) {
      return sendDisplayError(reply, error);
    }
  });

  app.get('/displays/state', async (request, reply) => {
    try {
      const state = await app.displays.getStateForToken(
        bearerToken(request.headers.authorization),
      );
      return { state };
    } catch (error) {
      return sendDisplayError(reply, error);
    }
  });

  app.post(
    '/events/:joinCode/displays/approve',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      const { joinCode } = request.params as { joinCode: string };
      const body = (request.body ?? {}) as {
        pairingCode?: string;
        label?: string;
        mode?: string;
        showPlayerNames?: boolean;
      };
      try {
        const display = await app.displays.approvePairing(
          joinCode,
          bearerToken(request.headers.authorization),
          {
            pairingCode: body.pairingCode ?? '',
            ...(body.label !== undefined ? { label: body.label } : {}),
            ...(body.mode !== undefined
              ? { mode: body.mode as 'FLOOR' | 'QUEUES' | 'LIMITED' | 'AUTO' }
              : {}),
            ...(body.showPlayerNames !== undefined
              ? { showPlayerNames: body.showPlayerNames }
              : {}),
          },
        );
        await app.live.publish(joinCode);
        return { display };
      } catch (error) {
        return sendDisplayError(reply, error);
      }
    },
  );

  app.get('/events/:joinCode/displays', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    try {
      const displays = await app.displays.listDisplays(
        joinCode,
        bearerToken(request.headers.authorization),
      );
      return { displays };
    } catch (error) {
      return sendDisplayError(reply, error);
    }
  });

  app.patch(
    '/events/:joinCode/displays/:displayId',
    async (request, reply) => {
      const { joinCode, displayId } = request.params as {
        joinCode: string;
        displayId: string;
      };
      const body = (request.body ?? {}) as {
        label?: string;
        mode?: string;
        showPlayerNames?: boolean;
        showQueues?: boolean;
        showTimers?: boolean;
      };
      try {
        const display = await app.displays.updateDisplay(
          joinCode,
          bearerToken(request.headers.authorization),
          displayId,
          {
            ...(body.label !== undefined ? { label: body.label } : {}),
            ...(body.mode !== undefined
              ? { mode: body.mode as 'FLOOR' | 'QUEUES' | 'LIMITED' | 'AUTO' }
              : {}),
            ...(body.showPlayerNames !== undefined
              ? { showPlayerNames: body.showPlayerNames }
              : {}),
            ...(body.showQueues !== undefined
              ? { showQueues: body.showQueues }
              : {}),
            ...(body.showTimers !== undefined
              ? { showTimers: body.showTimers }
              : {}),
          },
        );
        await app.live.publish(joinCode);
        return { display };
      } catch (error) {
        return sendDisplayError(reply, error);
      }
    },
  );

  app.post(
    '/events/:joinCode/displays/:displayId/revoke',
    async (request, reply) => {
      const { joinCode, displayId } = request.params as {
        joinCode: string;
        displayId: string;
      };
      try {
        const display = await app.displays.revokeDisplay(
          joinCode,
          bearerToken(request.headers.authorization),
          displayId,
        );
        await app.live.publish(joinCode);
        return { display };
      } catch (error) {
        return sendDisplayError(reply, error);
      }
    },
  );

  app.post('/events/:joinCode/announcements', async (request, reply) => {
    const { joinCode } = request.params as { joinCode: string };
    const body = (request.body ?? {}) as {
      message?: string;
      durationSeconds?: number;
    };
    try {
      const announcement = await app.displays.createAnnouncement(
        joinCode,
        bearerToken(request.headers.authorization),
        {
          message: body.message ?? '',
          ...(body.durationSeconds !== undefined
            ? { durationSeconds: body.durationSeconds }
            : {}),
        },
      );
      await app.live.publish(joinCode);
      return { announcement };
    } catch (error) {
      return sendDisplayError(reply, error);
    }
  });

  app.post(
    '/events/:joinCode/announcements/:announcementId/cancel',
    async (request, reply) => {
      const { joinCode, announcementId } = request.params as {
        joinCode: string;
        announcementId: string;
      };
      try {
        await app.displays.cancelAnnouncement(
          joinCode,
          bearerToken(request.headers.authorization),
          announcementId,
        );
        await app.live.publish(joinCode);
        return { ok: true };
      } catch (error) {
        return sendDisplayError(reply, error);
      }
    },
  );
};
