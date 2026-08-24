import { BackendAuthorizationService } from '../authorization/authorization-service.js';
import type { AuthorizationService } from '../authorization/authorization-service.js';
import type { AuthProvider } from './auth-provider.js';
import { DeferredHostAuthProvider } from './deferred-host-auth-provider.js';
import {
  HmacHostEventSessionService,
  type HostEventSessionService,
} from './host-event-session-service.js';
import {
  HmacParticipantSessionService,
  type ParticipantSessionService,
} from './participant-session-service.js';

export type IdentityBoundary = {
  hostAuth: AuthProvider;
  participantSessions: ParticipantSessionService;
  hostEventSessions: HostEventSessionService;
  authorization: AuthorizationService;
};

export type IdentityBoundaryOptions = {
  participantSessionSecret?: string;
};

/**
 * Composition root. Host auth stays deferred until Neon Auth organiser
 * accounts exist. Participants always use guest sessions.
 */
export function createIdentityBoundary(
  options: IdentityBoundaryOptions = {},
): IdentityBoundary {
  return {
    hostAuth: new DeferredHostAuthProvider(),
    participantSessions: new HmacParticipantSessionService(
      options.participantSessionSecret ?? process.env.PARTICIPANT_SESSION_SECRET,
    ),
    hostEventSessions: new HmacHostEventSessionService(
      options.participantSessionSecret ?? process.env.PARTICIPANT_SESSION_SECRET,
    ),
    authorization: new BackendAuthorizationService(),
  };
}
