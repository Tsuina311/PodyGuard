import type { EventMetrics } from '@podyguard/shared';
import type { StoredCompletedGame, StoredParticipant, StoredTable } from './event-store.js';

export function computeEventMetrics(input: {
  participants: StoredParticipant[];
  tables: StoredTable[];
  games: StoredCompletedGame[];
  challengeCompletions: Array<{ points: number }>;
}): EventMetrics {
  const humans = input.participants.filter((row) => !row.isBot);
  const waits = input.games.flatMap((game) =>
    game.seats.map((seat) => seat.waitSeconds),
  );
  const rematchPairs = new Set<string>();
  const seenPairs = new Map<string, number>();
  for (const game of input.games) {
    const ids = [...game.memberIds].sort();
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const key = `${ids[i] ?? ''}:${ids[j] ?? ''}`;
        const count = (seenPairs.get(key) ?? 0) + 1;
        seenPairs.set(key, count);
        if (count > 1) {
          rematchPairs.add(key);
        }
      }
    }
  }
  const poolAssignments: Record<string, number> = {};
  const podSizes: Record<string, number> = {};
  const durations: number[] = [];
  const ratings: number[] = [];
  let trackerUsed = 0;
  let trackerSkipped = 0;
  let trackerUnknown = 0;
  for (const game of input.games) {
    poolAssignments[game.poolId] = (poolAssignments[game.poolId] ?? 0) + 1;
    const sizeKey = String(game.memberIds.length);
    podSizes[sizeKey] = (podSizes[sizeKey] ?? 0) + 1;
    if (game.durationSeconds !== null) {
      durations.push(game.durationSeconds);
    }
    if (game.rating !== null) {
      ratings.push(game.rating);
    }
    if (game.trackerUsed === true) {
      trackerUsed += 1;
    } else if (game.trackerUsed === false) {
      trackerSkipped += 1;
    } else {
      trackerUnknown += 1;
    }
  }
  const occupied = input.tables.filter((table) => table.status === 'occupied')
    .length;
  const flexCredits = humans.map((row) => row.flexCredits);
  return {
    participants: humans.length,
    games: input.games.length,
    waitSeconds: summarize(waits),
    rematches: rematchPairs.size,
    poolAssignments,
    flexEarned: flexCredits.reduce((sum, value) => sum + Math.max(0, value), 0),
    flexCompensation: humans.filter((row) => row.flexCredits > 0).length,
    podSizes,
    tableUtilisation: {
      occupied,
      total: input.tables.length,
      occupancyRate:
        input.tables.length === 0 ? 0 : occupied / input.tables.length,
    },
    gameDurationSeconds:
      durations.length === 0
        ? null
        : {
            average: average(durations),
            count: durations.length,
          },
    gamesPerPlayer:
      humans.length === 0 ? 0 : input.games.length / humans.length,
    trackerUsage: {
      used: trackerUsed,
      skipped: trackerSkipped,
      unknown: trackerUnknown,
    },
    challengeCompletions: input.challengeCompletions.length,
    challengePoints: input.challengeCompletions.reduce(
      (sum, row) => sum + row.points,
      0,
    ),
    podRating:
      ratings.length === 0
        ? null
        : { average: average(ratings), count: ratings.length },
  };
}

function summarize(
  values: number[],
): { average: number; p95: number; max: number } | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * 0.95) - 1,
  );
  return {
    average: average(sorted),
    p95: sorted[index] ?? sorted[sorted.length - 1] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
