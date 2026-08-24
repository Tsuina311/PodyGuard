import type { FastifyInstance } from 'fastify';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { normalizeJoinCode, type EventSnapshot } from '@podyguard/shared';

export type EventLive = {
  publish(joinCode: string): Promise<void>;
};

function roomName(joinCode: string): string {
  return `event:${normalizeJoinCode(joinCode)}`;
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
