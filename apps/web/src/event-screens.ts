import type {
  EventSnapshot,
  PublicEvent,
  PublicParticipant,
} from '@podyguard/shared';
import { eventHasLimitedQueues, eventPlaySurface } from './event-mode';

/**
 * Join / Host screen selection — same gates the live pages use.
 * Smoke tests lock these so constructed modes never open Limited Swiss UI.
 */

export function shouldShowLimitedPlayerPanel(
  event: Pick<PublicEvent, 'limitedModeConfigs'> | null | undefined,
  opts: {
    participant: PublicParticipant | null;
    token: string | null;
    snapshot: EventSnapshot | null;
  },
): boolean {
  return (
    eventHasLimitedQueues(event ?? {}) &&
    Boolean(opts.participant && opts.token && opts.snapshot)
  );
}

export function shouldShowLimitedHostPanel(
  event: Pick<PublicEvent, 'limitedModeConfigs'> | null | undefined,
  hostToken: string | null,
): boolean {
  return Boolean(hostToken) && eventHasLimitedQueues(event ?? {});
}

/** Constructed desk: pod-size / matching chrome (not Limited pairing). */
export function shouldShowConstructedHostMatching(
  event: Pick<PublicEvent, 'limitedModeConfigs'> | null | undefined,
): boolean {
  return eventPlaySurface(event ?? {}) === 'constructed';
}

/** Player joins with decks/commanders instead of Limited queue-only. */
export function shouldShowConstructedPlayerJoin(
  event: Pick<PublicEvent, 'limitedModeConfigs'> | null | undefined,
): boolean {
  return eventPlaySurface(event ?? {}) === 'constructed';
}
