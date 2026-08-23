import Fastify from 'fastify';
import {
  createIdentityBoundary,
  type IdentityBoundary,
} from './identity/index.js';
import { healthRoutes } from './routes/health.js';

export type BuildAppOptions = {
  identity?: IdentityBoundary;
};

export async function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: true,
  });

  app.decorate('identity', options.identity ?? createIdentityBoundary());

  await app.register(healthRoutes);

  return app;
}
