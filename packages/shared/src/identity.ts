/**
 * Application identity types.
 *
 * Persistent organisers (hosts) and casual event participants are different
 * actors. Participants never use Neon Auth. Host Neon Auth subjects are mapped
 * to HostIdentity at an adapter boundary — domain code uses these types only.
 */

export const ActorKind = {
  Host: 'host',
  Participant: 'participant',
} as const;

export type ActorKind = (typeof ActorKind)[keyof typeof ActorKind];

/**
 * Persistent organiser account. `accountId` is ours, not a Neon Auth SDK id.
 */
export type HostIdentity = {
  kind: typeof ActorKind.Host;
  accountId: string;
};

/**
 * Event-scoped guest. Issued after QR join + display name, not a login.
 */
export type ParticipantIdentity = {
  kind: typeof ActorKind.Participant;
  eventId: string;
  participantId: string;
};

export type Actor = HostIdentity | ParticipantIdentity;

export function isHostIdentity(actor: Actor): actor is HostIdentity {
  return actor.kind === ActorKind.Host;
}

export function isParticipantIdentity(
  actor: Actor,
): actor is ParticipantIdentity {
  return actor.kind === ActorKind.Participant;
}
