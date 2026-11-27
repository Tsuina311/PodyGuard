import type { DisplayService } from './display/display-service.js';
import type { EventService } from './events/event-service.js';
import type { IdentityBoundary } from './identity/index.js';
import type { EventLive } from './live.js';
import type { LinkTransferService } from './link-transfer/service.js';

declare module 'fastify' {
  interface FastifyInstance {
    identity: IdentityBoundary;
    events: EventService;
    displays: DisplayService;
    live: EventLive;
    linkTransfers: LinkTransferService;
  }
}

export {};
