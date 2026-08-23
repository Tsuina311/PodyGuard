import type { IdentityBoundary } from './identity/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    identity: IdentityBoundary;
  }
}

export {};
