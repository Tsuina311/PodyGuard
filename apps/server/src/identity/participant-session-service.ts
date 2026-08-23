import { createHmac, timingSafeEqual } from 'node:crypto';
import { ActorKind, type ParticipantIdentity } from '@poderate/shared';
import {
  InvalidParticipantSessionError,
  ParticipantSessionSecretMissingError,
} from './errors.js';

export type GuestJoinSessionInput = {
  eventId: string;
  participantId: string;
};

export type ParticipantSession = ParticipantIdentity & {
  token: string;
};

/**
 * Event-scoped guest sessions: QR → display name → this token.
 * Not Neon Auth. Token is bound to one event + one participant.
 */
export interface ParticipantSessionService {
  issue(input: GuestJoinSessionInput): ParticipantSession;
  verify(token: string): ParticipantIdentity;
}

type TokenPayload = {
  v: 1;
  eventId: string;
  participantId: string;
};

export class HmacParticipantSessionService implements ParticipantSessionService {
  constructor(private readonly secret: string | undefined) {}

  issue(input: GuestJoinSessionInput): ParticipantSession {
    const payload: TokenPayload = {
      v: 1,
      eventId: input.eventId,
      participantId: input.participantId,
    };
    const token = this.sign(payload);
    return {
      kind: ActorKind.Participant,
      eventId: input.eventId,
      participantId: input.participantId,
      token,
    };
  }

  verify(token: string): ParticipantIdentity {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'ps1') {
      throw new InvalidParticipantSessionError();
    }

    const body = parts[1] ?? '';
    const signature = parts[2] ?? '';
    const expected = this.hmac(body);

    if (!safeEqualB64(signature, expected)) {
      throw new InvalidParticipantSessionError();
    }

    let payload: TokenPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    } catch {
      throw new InvalidParticipantSessionError();
    }

    if (
      payload.v !== 1 ||
      typeof payload.eventId !== 'string' ||
      typeof payload.participantId !== 'string' ||
      payload.eventId.length === 0 ||
      payload.participantId.length === 0
    ) {
      throw new InvalidParticipantSessionError();
    }

    return {
      kind: ActorKind.Participant,
      eventId: payload.eventId,
      participantId: payload.participantId,
    };
  }

  private sign(payload: TokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `ps1.${body}.${this.hmac(body)}`;
  }

  private hmac(body: string): string {
    const secret = this.requireSecret();
    return createHmac('sha256', secret).update(body).digest('base64url');
  }

  private requireSecret(): string {
    const secret = this.secret?.trim();
    if (!secret) {
      throw new ParticipantSessionSecretMissingError();
    }
    return secret;
  }
}

function safeEqualB64(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}
