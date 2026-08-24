import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  InvalidHostEventSessionError,
  ParticipantSessionSecretMissingError,
} from './errors.js';

export type HostEventSession = {
  eventId: string;
  token: string;
};

export interface HostEventSessionService {
  issue(eventId: string): HostEventSession;
  verify(token: string): { eventId: string };
}

type TokenPayload = {
  v: 1;
  eventId: string;
};

/**
 * Event-local host session after PIN check. Not Neon Auth.
 */
export class HmacHostEventSessionService implements HostEventSessionService {
  constructor(private readonly secret: string | undefined) {}

  issue(eventId: string): HostEventSession {
    const payload: TokenPayload = { v: 1, eventId };
    return { eventId, token: this.sign(payload) };
  }

  verify(token: string): { eventId: string } {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'hs1') {
      throw new InvalidHostEventSessionError();
    }

    const body = parts[1] ?? '';
    const signature = parts[2] ?? '';
    if (!safeEqualB64(signature, this.hmac(body))) {
      throw new InvalidHostEventSessionError();
    }

    let payload: TokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as TokenPayload;
    } catch {
      throw new InvalidHostEventSessionError();
    }

    if (
      payload.v !== 1 ||
      typeof payload.eventId !== 'string' ||
      payload.eventId.length === 0
    ) {
      throw new InvalidHostEventSessionError();
    }

    return { eventId: payload.eventId };
  }

  private sign(payload: TokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString(
      'base64url',
    );
    return `hs1.${body}.${this.hmac(body)}`;
  }

  private hmac(body: string): string {
    const secret = this.secret?.trim();
    if (!secret) {
      throw new ParticipantSessionSecretMissingError();
    }
    return createHmac('sha256', secret).update(body).digest('base64url');
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
