import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventService } from './events/event-service.js';
import { PostgresEventStore } from './events/postgres-event-store.js';
import {
  createIdentityBoundary,
  type IdentityBoundary,
} from './identity/index.js';
import { attachLive } from './live.js';
import { eventRoutes } from './routes/events.js';
import { healthRoutes } from './routes/health.js';
import { scryfallRoutes } from './routes/scryfall.js';
import type { ScryfallClient } from './scryfall/scryfall-client.js';

export type BuildAppOptions = {
  identity?: IdentityBoundary;
  events?: EventService;
  scryfall?: ScryfallClient;
  logger?: boolean;
  serveWeb?: boolean;
  webRoot?: string;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const identity = options.identity ?? createIdentityBoundary();
  const isDev = process.env.NODE_ENV !== 'production';
  const events =
    options.events ??
    new EventService(new PostgresEventStore(), identity, { isDev });

  const app = Fastify({
    logger: options.logger ?? true,
    // The browser always calls /api/* in development and production. Vite
    // removes that prefix locally; production runs as one Fastify service, so
    // do the equivalent before Fastify routes the request.
    rewriteUrl: (request) => {
      const url = request.url ?? '/';
      return url.startsWith('/api/') ? url.slice(4) : url;
    },
  });

  app.decorate('identity', identity);
  app.decorate('events', events);
  app.decorate('live', attachLive(app));

  await app.register(healthRoutes);
  await app.register(eventRoutes);
  await app.register(scryfallRoutes, { client: options.scryfall });

  const serveWeb = options.serveWeb ?? process.env.NODE_ENV === 'production';
  if (serveWeb) {
    const sourceDirectory = dirname(fileURLToPath(import.meta.url));
    const webRoot =
      options.webRoot ?? resolve(sourceDirectory, '../../web/dist');
    await app.register(fastifyStatic, {
      root: webRoot,
      prefix: '/',
      wildcard: false,
    });
    app.setNotFoundHandler((request, reply) => {
      const acceptsHtml = request.headers.accept?.includes('text/html') ?? false;
      if (request.method === 'GET' && acceptsHtml) {
        return reply.sendFile('index.html');
      }
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Route not found.' },
      });
    });
  }

  return app;
}
