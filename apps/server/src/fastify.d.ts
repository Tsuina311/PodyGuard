import type { DisplayService } from './display/display-service.js';
import type { EventService } from './events/event-service.js';
import type { IdentityBoundary } from './identity/index.js';
import type { EventLive } from './live.js';

declare module 'fastify' {
  interface FastifyInstance {
    identity: IdentityBoundary;
    events: EventService;
    displays: DisplayService;
    live: EventLive;
  }
}

export {};
