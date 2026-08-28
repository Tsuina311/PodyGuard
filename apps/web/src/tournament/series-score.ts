import type { TournamentMatch } from '@podyguard/shared';

/** Hyphenated series tally in seat order, e.g. `1-0` or `2-1`. */
export function seriesScoreLine(match: TournamentMatch): string {
  return match.participantIds
    .map((participantId) => match.seriesWins?.[participantId] ?? 0)
    .join('-');
}

export function seriesHasProgress(match: TournamentMatch): boolean {
  return Object.values(match.seriesWins ?? {}).some((wins) => wins > 0);
}
