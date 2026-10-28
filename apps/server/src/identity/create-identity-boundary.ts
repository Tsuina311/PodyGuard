import { BackendAuthorizationService } from '../authorization/authorization-service.js';
import type { AuthorizationService } from '../authorization/authorization-service.js';
import {
  HmacAccountSessionService,
  type AccountSessionService,
} from './account-session-service.js';
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
  accountSessions: AccountSessionService;
  participantSessions: ParticipantSessionService;
  hostEventSessions: HostEventSessionService;
  authorization: AuthorizationService;
};

export type IdentityBoundaryOptions = {
  participantSessionSecret?: string;
  resolveEventOwnerUserId?: (eventId: string) => Promise<string | null>;
};

/**
 * Composition root.
 * Account sessions (`as1.`), event host sessions (`hs1.`), and participant sessions (`ps1.`)
 * remain cryptographically and domain-separated.
 */
export function createIdentityBoundary(
  options: IdentityBoundaryOptions = {},
): IdentityBoundary {
  const secret =
    options.participantSessionSecret ??
    process.env.PARTICIPANT_SESSION_SECRET ??
    (process.env.NODE_ENV !== 'production' ? 'dev-podyguard-session-secret' : undefined);
  return {
    hostAuth: new DeferredHostAuthProvider(),
    accountSessions: new HmacAccountSessionService(secret),
    participantSessions: new HmacParticipantSessionService(
      options.participantSessionSecret ?? process.env.PARTICIPANT_SESSION_SECRET,
    ),
    hostEventSessions: new HmacHostEventSessionService(
      options.participantSessionSecret ?? process.env.PARTICIPANT_SESSION_SECRET,
    ),
    authorization: new BackendAuthorizationService(
      options.resolveEventOwnerUserId,
    ),
  };
}

