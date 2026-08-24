import Fastify from 'fastify';
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
};

export async function buildApp(options: BuildAppOptions = {}) {
  const identity = options.identity ?? createIdentityBoundary();
  const isDev = process.env.NODE_ENV !== 'production';
  const events =
    options.events ??
    new EventService(new PostgresEventStore(), identity, { isDev });

  const app = Fastify({
    logger: options.logger ?? true,
  });

  app.decorate('identity', identity);
  app.decorate('events', events);
  app.decorate('live', attachLive(app));

  await app.register(healthRoutes);
  await app.register(eventRoutes);
  await app.register(scryfallRoutes, { client: options.scryfall });

  return app;
}
