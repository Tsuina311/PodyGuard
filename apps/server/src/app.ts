import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DisplayService } from './display/display-service.js';
import type { DisplayStore } from './display/display-store.js';
import { MemoryDisplayStore } from './display/memory-display-store.js';
import { PostgresDisplayStore } from './display/postgres-display-store.js';
import { EventService } from './events/event-service.js';
import { PostgresEventStore } from './events/postgres-event-store.js';
import { githubFeedbackTransportFromEnvironment } from './feedback/github-transport.js';
import { FeedbackService } from './feedback/service.js';
import type { FeedbackTransport } from './feedback/types.js';
import {
  createIdentityBoundary,
  type IdentityBoundary,
} from './identity/index.js';
import { attachLive } from './live.js';
import { displayRoutes } from './routes/displays.js';
import { eventRoutes } from './routes/events.js';
import { feedbackRoutes } from './routes/feedback.js';
import { healthRoutes } from './routes/health.js';
import { scryfallRoutes } from './routes/scryfall.js';
import type { ScryfallClient } from './scryfall/scryfall-client.js';

export type BuildAppOptions = {
  identity?: IdentityBoundary;
  events?: EventService;
  displays?: DisplayService;
  displayStore?: DisplayStore;
  feedbackTransport?: FeedbackTransport | null;
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
  const displayStore =
    options.displayStore ??
    (options.events ? new MemoryDisplayStore() : new PostgresDisplayStore());
  const displays =
    options.displays ??
    new DisplayService(
      displayStore,
      events,
      process.env.PARTICIPANT_SESSION_SECRET?.trim() || 'dev-display-secret',
    );
  const feedbackTransport =
    options.feedbackTransport === undefined
      ? githubFeedbackTransportFromEnvironment()
      : options.feedbackTransport;

  const app = Fastify({
    logger: options.logger ?? true,
    // Render terminates HTTPS one hop in front of Fastify. Trust only that
    // nearest proxy so request.ip remains useful for route rate limiting.
    trustProxy:
      process.env.NODE_ENV === 'production'
        ? (_address: string, hop: number) => hop === 0
        : false,
    // The browser always calls /api/* from the Vite proxy, the Render-hosted
    // copy, and the GitHub Pages site. Vite strips the prefix locally;
    // production Fastify does the same before routing.
    rewriteUrl: (request) => {
      const url = request.url ?? '/';
      return url.startsWith('/api/') ? url.slice(4) : url;
    },
  });

  app.decorate('identity', identity);
  app.decorate('events', events);
  app.decorate('displays', displays);
  app.decorate('live', attachLive(app));

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  await app.register(rateLimit, { global: false });

  await app.register(healthRoutes);
  await app.register(eventRoutes);
  await app.register(displayRoutes);
  await app.register(feedbackRoutes, {
    service: new FeedbackService(feedbackTransport),
  });
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
