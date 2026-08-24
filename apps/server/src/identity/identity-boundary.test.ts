import { ActorKind, OrganiserRole, SubscriptionTier } from '@podyguard/shared';
import { describe, expect, it } from 'vitest';
import { EventManagementForbiddenError } from '../authorization/index.js';
import { createIdentityBoundary } from './create-identity-boundary.js';
import { HostAuthDeferredError, InvalidParticipantSessionError } from './errors.js';
import {
  bindingFromNeonAuthAccount,
  toHostIdentity,
} from './neon-auth-adapter.js';

const host = { kind: ActorKind.Host, accountId: 'acc-1' } as const;

describe('identity boundary', () => {
  it('defers Neon Auth for organisers until host accounts exist', async () => {
    const { hostAuth } = createIdentityBoundary({
      participantSessionSecret: 'test-secret',
    });

    await expect(
      hostAuth.authenticateHost({ accessToken: 'neon-session' }),
    ).rejects.toMatchObject({
      name: 'HostAuthDeferredError',
      code: 'HOST_AUTH_DEFERRED',
    });
    await expect(
      hostAuth.authenticateHost({ accessToken: 'neon-session' }),
    ).rejects.toBeInstanceOf(HostAuthDeferredError);
  });

  it('issues event-scoped guest tokens without Neon Auth', () => {
    const { participantSessions } = createIdentityBoundary({
      participantSessionSecret: 'test-secret',
    });

    const session = participantSessions.issue({
      eventId: 'evt-1',
      participantId: 'p-1',
    });

    expect(session.kind).toBe(ActorKind.Participant);
    expect(session.eventId).toBe('evt-1');
    expect(session.participantId).toBe('p-1');
    expect(session.token.startsWith('ps1.')).toBe(true);

    const verified = participantSessions.verify(session.token);
    expect(verified).toEqual({
      kind: ActorKind.Participant,
      eventId: 'evt-1',
      participantId: 'p-1',
    });
  });

  it('rejects tampered guest session tokens', () => {
    const { participantSessions } = createIdentityBoundary({
      participantSessionSecret: 'test-secret',
    });
    const { token } = participantSessions.issue({
      eventId: 'evt-1',
      participantId: 'p-1',
    });

    expect(() => participantSessions.verify(`${token}x`)).toThrow(
      InvalidParticipantSessionError,
    );
  });

  it('does not treat a Neon Auth subject as our organiser account id', () => {
    const binding = bindingFromNeonAuthAccount(
      { neonUserId: 'neon-user-xyz', email: 'host@example.com' },
      'acc-ours',
    );

    expect(binding.provider).toBe('neon-auth');
    expect(binding.providerSubject).toBe('neon-user-xyz');
    expect(toHostIdentity(binding)).toEqual({
      kind: ActorKind.Host,
      accountId: 'acc-ours',
    });
  });

  it('keeps authorization and entitlements off the auth provider', async () => {
    const { authorization } = createIdentityBoundary({
      participantSessionSecret: 'test-secret',
    });

    await expect(authorization.getOrganiserRole(host, 'evt-1')).resolves.toBeNull();
    await expect(authorization.assertCanManageEvent(host, 'evt-1')).rejects.toBeInstanceOf(
      EventManagementForbiddenError,
    );

    const entitlements = await authorization.resolveEntitlements(host);
    expect(entitlements.subscriptionTier).toBe(SubscriptionTier.Free);
    expect(entitlements.participantCapacity).toBeNull();
    expect(entitlements.premiumGameModes).toEqual([]);
    expect(entitlements.challengePackIds).toEqual([]);
    expect(OrganiserRole.Owner).toBe('owner');
  });
});
