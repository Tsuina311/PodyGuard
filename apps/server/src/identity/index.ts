export type { AuthProvider, HostAuthCredentials } from './auth-provider.js';
export { DeferredHostAuthProvider } from './deferred-host-auth-provider.js';
export {
  HostAuthDeferredError,
  InvalidHostEventSessionError,
  InvalidParticipantSessionError,
  ParticipantSessionSecretMissingError,
} from './errors.js';
export { createIdentityBoundary } from './create-identity-boundary.js';
export type {
  IdentityBoundary,
  IdentityBoundaryOptions,
} from './create-identity-boundary.js';
export {
  bindingFromNeonAuthAccount,
  toHostIdentity,
} from './neon-auth-adapter.js';
export type {
  HostAccountBinding,
  NeonAuthAccountDto,
} from './neon-auth-adapter.js';
export { HmacParticipantSessionService } from './participant-session-service.js';
export type {
  GuestJoinSessionInput,
  ParticipantSession,
  ParticipantSessionService,
} from './participant-session-service.js';
export { HmacHostEventSessionService } from './host-event-session-service.js';
export type {
  HostEventSession,
  HostEventSessionService,
} from './host-event-session-service.js';
