import { describe, expect, it } from 'vitest';
import { ActorKind, isHostIdentity, isParticipantIdentity } from './identity';
import { SubscriptionTier, ungatedEntitlements } from './entitlements';

describe('identity', () => {
  it('distinguishes persistent hosts from event guests', () => {
    const host = { kind: ActorKind.Host, accountId: 'acc-1' } as const;
    const participant = {
      kind: ActorKind.Participant,
      eventId: 'evt-1',
      participantId: 'p-1',
    } as const;

    expect(isHostIdentity(host)).toBe(true);
    expect(isParticipantIdentity(host)).toBe(false);
    expect(isParticipantIdentity(participant)).toBe(true);
    expect(isHostIdentity(participant)).toBe(false);
  });
});

describe('entitlements', () => {
  it('starts commercially ungated until billing exists', () => {
    expect(ungatedEntitlements.subscriptionTier).toBe(SubscriptionTier.Free);
    expect(ungatedEntitlements.participantCapacity).toBeNull();
    expect(ungatedEntitlements.challengePackIds).toEqual([]);
  });
});
