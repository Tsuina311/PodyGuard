export const EventStatus = {
  Open: 'open',
  Locked: 'locked',
  Closed: 'closed',
} as const;

export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const ParticipantStatus = {
  Joined: 'joined',
  Ready: 'ready',
  Matched: 'matched',
  Playing: 'playing',
  Paused: 'paused',
  Left: 'left',
} as const;

export type ParticipantStatus =
  (typeof ParticipantStatus)[keyof typeof ParticipantStatus];

export const PhysicalTableStatus = {
  Free: 'free',
  Occupied: 'occupied',
  Disabled: 'disabled',
} as const;

export type PhysicalTableStatus =
  (typeof PhysicalTableStatus)[keyof typeof PhysicalTableStatus];

export const DeckPreference = {
  Preferred: 'preferred',
  Accepted: 'accepted',
} as const;

export type DeckPreference =
  (typeof DeckPreference)[keyof typeof DeckPreference];
