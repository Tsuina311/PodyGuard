/**
 * Commercial and organisational permissions resolved by the backend.
 * Authentication (who the actor is) is not sufficient to grant these.
 */

export const OrganiserRole = {
  Owner: 'owner',
  CoOrganiser: 'co-organiser',
  Staff: 'staff',
} as const;

export type OrganiserRole =
  (typeof OrganiserRole)[keyof typeof OrganiserRole];

export const SubscriptionTier = {
  Free: 'free',
  Paid: 'paid',
} as const;

export type SubscriptionTier =
  (typeof SubscriptionTier)[keyof typeof SubscriptionTier];

export type CommercialEntitlements = {
  subscriptionTier: SubscriptionTier;
  /** Null means capacity is not commercially gated yet. */
  participantCapacity: number | null;
  premiumGameModes: readonly string[];
  challengePackIds: readonly string[];
};

export const ungatedEntitlements: CommercialEntitlements = {
  subscriptionTier: SubscriptionTier.Free,
  participantCapacity: null,
  premiumGameModes: [],
  challengePackIds: [],
};
