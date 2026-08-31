import {
  limitedTimerRemainingSeconds,
  type EventSnapshot,
  type LimitedMatch,
  type LimitedMode,
  type PublicLimitedSession,
  type PublicParticipant,
} from '@podyguard/shared';

export const LIMITED_MODE_LABELS: Record<LimitedMode, string> = {
  BOOSTER_DRAFT: 'Booster Draft',
  PICK_TWO_DRAFT: 'Pick-Two Draft',
  SEALED: 'Sealed',
};

export function activeLimitedSession(
  snapshot: EventSnapshot | null,
  participantId: string | undefined,
): PublicLimitedSession | undefined {
  if (!participantId) return undefined;
  const sessions = snapshot?.limitedSessions ?? [];
  const includesParticipant = (session: PublicLimitedSession) =>
    session.participants.some(
      (participant) =>
        participant.participantId === participantId &&
        participant.status !== 'DROPPED',
    );
  return (
    sessions.find(
      (session) =>
        !['COMPLETED', 'CANCELLED'].includes(session.status) &&
        includesParticipant(session),
    ) ??
    [...sessions]
      .reverse()
      .find(
        (session) =>
          session.status === 'COMPLETED' && includesParticipant(session),
      )
  );
}

export function currentLimitedMatch(
  session: PublicLimitedSession | undefined,
  participantId: string | undefined,
): LimitedMatch | undefined {
  if (!session || !participantId) return undefined;
  return session.rounds
    .find((round) => round.number === session.currentRound)
    ?.matches.find(
      (match) =>
        match.playerAId === participantId ||
        match.playerBId === participantId,
    );
}

export function participantName(
  session: PublicLimitedSession,
  participantId: string | undefined,
): string {
  if (!participantId) return 'Bye';
  return (
    session.participants.find(
      (participant) => participant.participantId === participantId,
    )?.displayName ?? 'Unknown player'
  );
}

export function queuedParticipants(
  snapshot: Pick<EventSnapshot, 'participants'> | null,
  mode: LimitedMode,
): PublicParticipant[] {
  return (snapshot?.participants ?? []).filter(
    (participant) => participant.limitedQueueMode === mode,
  );
}

export function formatLimitedTimer(
  timer: PublicLimitedSession['timer'],
  now: string,
): string {
  if (!timer) return '--:--';
  const seconds = limitedTimerRemainingSeconds(timer, now);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function scoreForOutcome(
  outcome: Exclude<LimitedMatch['outcome'], 'BYE' | undefined>,
  bestOf: 1 | 3 | 5,
): { playerAGameWins: number; playerBGameWins: number } {
  const wins = bestOf === 1 ? 1 : 2;
  if (outcome === 'PLAYER_A_WIN') {
    return { playerAGameWins: wins, playerBGameWins: 0 };
  }
  if (outcome === 'PLAYER_B_WIN') {
    return { playerAGameWins: 0, playerBGameWins: wins };
  }
  return { playerAGameWins: 0, playerBGameWins: 0 };
}
