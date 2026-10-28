import { createHmac, timingSafeEqual } from 'node:crypto';
import { ActorKind, type HostIdentity } from '@podyguard/shared';
import {
  InvalidAccountSessionError,
  ParticipantSessionSecretMissingError,
} from './errors.js';

export type AccountSession = {
  accountId: string;
  token: string;
};

export interface AccountSessionService {
  issue(accountId: string): AccountSession;
  verify(token: string): HostIdentity;
}

type TokenPayload = {
  v: 1;
  accountId: string;
};

/**
 * Persistent user account session (`as1.<payload>.<hmac>`).
 * Strictly separated from event participant tokens (`ps1.`) and event host tokens (`hs1.`).
 */
export class HmacAccountSessionService implements AccountSessionService {
  constructor(private readonly secret: string | undefined) {}

  issue(accountId: string): AccountSession {
    const payload: TokenPayload = { v: 1, accountId };
    return { accountId, token: this.sign(payload) };
  }

  verify(token: string): HostIdentity {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'as1') {
      throw new InvalidAccountSessionError();
    }

    const body = parts[1] ?? '';
    const signature = parts[2] ?? '';
    if (!safeEqualB64(signature, this.hmac(body))) {
      throw new InvalidAccountSessionError();
    }

    let payload: TokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(body, 'base64url').toString('utf8'),
      ) as TokenPayload;
    } catch {
      throw new InvalidAccountSessionError();
    }

    if (
      payload.v !== 1 ||
      typeof payload.accountId !== 'string' ||
      payload.accountId.length === 0
    ) {
      throw new InvalidAccountSessionError();
    }

    return {
      kind: ActorKind.Host,
      accountId: payload.accountId,
    };
  }

  private sign(payload: TokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload), 'utf8').toString(
      'base64url',
    );
    return `as1.${body}.${this.hmac(body)}`;
  }

  private hmac(body: string): string {
    const secret = this.secret?.trim();
    if (!secret) {
      throw new ParticipantSessionSecretMissingError();
    }
    return createHmac('sha256', secret)
      .update(`account-session:${body}`)
      .digest('base64url');
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
