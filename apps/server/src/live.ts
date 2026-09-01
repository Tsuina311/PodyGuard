import type { FastifyInstance } from 'fastify';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import {
  normalizeJoinCode,
  type EventSnapshot,
  type PublicDisplayEventState,
} from '@podyguard/shared';

export type EventLive = {
  publish(joinCode: string): Promise<void>;
};

function roomName(joinCode: string): string {
  return `event:${normalizeJoinCode(joinCode)}`;
}

function displayRoomName(sessionId: string): string {
  return `display:${sessionId}`;
}

export function attachLive(app: FastifyInstance): EventLive {
  let io: Server | undefined;

  const live: EventLive = {
    async publish(joinCode: string) {
      if (!io) {
        return;
      }
      const code = normalizeJoinCode(joinCode);
      const snapshot = await app.events.getSnapshot(code);
      io.to(roomName(code)).emit('snapshot', snapshot satisfies EventSnapshot);

      try {
        const projections =
          await app.displays.listActiveProjectionsForJoinCode(code);
        for (const row of projections) {
          io.to(displayRoomName(row.sessionId)).emit(
            'display-snapshot',
            row.state satisfies PublicDisplayEventState,
          );
        }
      } catch {
        /* Display projection must never block host/player live updates. */
      }
    },
  };

  app.addHook('onListen', () => {
    io = new Server(app.server as HttpServer, {
      cors: { origin: true },
    });
    io.on('connection', (socket) => {
      socket.on('watch', async (joinCode: unknown) => {
        if (typeof joinCode !== 'string' || joinCode.trim() === '') {
          return;
        }
        const code = normalizeJoinCode(joinCode);
        socket.join(roomName(code));
        try {
          const snapshot = await app.events.getSnapshot(code);
          socket.emit('snapshot', snapshot);
        } catch {
          socket.emit('event-missing');
        }
      });

      socket.on('watch-display', async (token: unknown) => {
        if (typeof token !== 'string' || token.trim() === '') {
          socket.emit('display-unauthorized');
          return;
        }
        try {
          const session = await app.displays.requireActiveSession(token);
          socket.join(displayRoomName(session.id));
          const state = await app.displays.getStateForToken(token);
          socket.emit('display-snapshot', state);
        } catch {
          socket.emit('display-unauthorized');
        }
      });
    });
  });

  app.addHook('onClose', async () => {
    const server = io;
    if (!server) {
      return;
    }
    await new Promise<void>((resolve) => {
      void server.close(() => resolve());
    });
    io = undefined;
  });

  return live;
}
