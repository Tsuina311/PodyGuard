export class HostAuthDeferredError extends Error {
  readonly code = 'HOST_AUTH_DEFERRED';

  constructor() {
    super(
      'Persistent organiser accounts are not enabled yet. Neon Auth will authenticate hosts when host accounts are introduced. Event participants must use event-scoped guest sessions, not Neon Auth.',
    );
    this.name = 'HostAuthDeferredError';
  }
}

export class ParticipantSessionSecretMissingError extends Error {
  readonly code = 'PARTICIPANT_SESSION_SECRET_MISSING';

  constructor() {
    super(
      'PARTICIPANT_SESSION_SECRET is not set. Guest session tokens cannot be issued or verified.',
    );
    this.name = 'ParticipantSessionSecretMissingError';
  }
}

export class InvalidParticipantSessionError extends Error {
  readonly code = 'INVALID_PARTICIPANT_SESSION';

  constructor() {
    super('Participant session token is invalid.');
    this.name = 'InvalidParticipantSessionError';
  }
}

export class InvalidHostEventSessionError extends Error {
  readonly code = 'INVALID_HOST_EVENT_SESSION';

  constructor() {
    super('Host event session token is invalid.');
    this.name = 'InvalidHostEventSessionError';
  }
}
