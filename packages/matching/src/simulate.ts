import { createMatches } from './create-matches.js';
import { checkMatchInvariants } from './invariants.js';
import { mulberry32, pickInt, pickItem, type Rng } from './rng.js';
import type {
  AvailableTable,
  MatchHistory,
  MatchResult,
  ReadyParticipant,
} from './types.js';

const POOLS = ['b1', 'b2', 'b3', 'b4'] as const;

export type SnapshotMetrics = {
  seed: number;
  playerCount: number;
  tableCount: number;
  matched: number;
  unmatched: number;
  fours: number;
  threes: number;
  concessions: number;
  invariantFailures: number;
};

export type EventSimMetrics = SnapshotMetrics & {
  rounds: number;
  finishedPods: number;
  meanWaitTicks: number;
};

export function randomReadyField(
  rng: Rng,
  playerCount: number,
  tableCount: number,
): {
  participants: ReadyParticipant[];
  tables: AvailableTable[];
  history: MatchHistory;
} {
  const participants: ReadyParticipant[] = [];
  for (let index = 0; index < playerCount; index += 1) {
    const preferred = pickItem(rng, [...POOLS]);
    const decks: ReadyParticipant['decks'] = [
      {
        id: `p${String(index)}-${preferred}`,
        poolId: preferred,
        preference: 'preferred',
      },
    ];
    if (rng() < 0.25) {
      const extra = pickItem(
        rng,
        POOLS.filter((pool) => pool !== preferred),
      );
      decks.push({
        id: `p${String(index)}-${extra}`,
        poolId: extra,
        preference: 'accepted',
      });
    }
    participants.push({
      id: `p${String(index)}`,
      readyAt: pickInt(rng, 0, 400),
      flexCredits: rng() < 0.2 ? pickInt(rng, 1, 5) : 0,
      decks,
    });
  }
  const historyGroups: string[][] = [];
  if (playerCount >= 4 && rng() < 0.5) {
    historyGroups.push(
      participants.slice(0, 4).map((row) => row.id),
    );
  }
  return {
    participants,
    tables: Array.from({ length: tableCount }, (_, index) => ({
      id: `t${String(index + 1)}`,
    })),
    history: { groups: historyGroups },
  };
}

export function scoreSnapshot(
  seed: number,
  participants: ReadyParticipant[],
  tables: AvailableTable[],
  result: MatchResult,
  history: MatchHistory = { groups: [] },
): SnapshotMetrics {
  const issues = checkMatchInvariants(participants, tables, history, result);
  return {
    seed,
    playerCount: participants.length,
    tableCount: tables.length,
    matched: result.matches.reduce((sum, row) => sum + row.seats.length, 0),
    unmatched: result.unmatchedIds.length,
    fours: result.matches.filter((row) => row.seats.length === 4).length,
    threes: result.matches.filter((row) => row.seats.length === 3).length,
    concessions: result.matches.reduce(
      (sum, row) => sum + row.seats.filter((seat) => seat.concession).length,
      0,
    ),
    invariantFailures: issues.length,
  };
}

export function runSeededSnapshot(seed: number, playerCount: number, tableCount: number): SnapshotMetrics {
  const rng = mulberry32(seed);
  const field = randomReadyField(rng, playerCount, tableCount);
  const result = createMatches(field.participants, field.tables, field.history);
  return scoreSnapshot(seed, field.participants, field.tables, result, field.history);
}

export function simulateEvent(seed: number, rounds = 8): EventSimMetrics {
  const rng = mulberry32(seed);
  const playerCount = pickInt(rng, 11, 28);
  const tableCount = pickInt(rng, 2, 6);
  let field = randomReadyField(rng, playerCount, tableCount);
  let finishedPods = 0;
  const waits: number[] = [];
  let last = scoreSnapshot(seed, field.participants, field.tables, {
    matches: [],
    unmatchedIds: field.participants.map((row) => row.id),
  });

  for (let round = 0; round < rounds; round += 1) {
    const result = createMatches(field.participants, field.tables, field.history);
    last = scoreSnapshot(seed, field.participants, field.tables, result, field.history);
    for (const match of result.matches) {
      finishedPods += 1;
      for (const seat of match.seats) {
        const player = field.participants.find((row) => row.id === seat.participantId);
        if (player) {
          waits.push(Math.max(0, 400 - player.readyAt));
        }
      }
      field.history.groups.push(match.seats.map((seat) => seat.participantId));
    }
    const seated = new Set(
      result.matches.flatMap((row) => row.seats.map((seat) => seat.participantId)),
    );
    field = {
      ...field,
      participants: field.participants.map((row) =>
        seated.has(row.id)
          ? { ...row, readyAt: pickInt(rng, 0, 40) }
          : { ...row, readyAt: Math.max(0, row.readyAt - 30) },
      ),
    };
  }

  const meanWaitTicks =
    waits.length === 0 ? 0 : waits.reduce((sum, row) => sum + row, 0) / waits.length;
  return {
    ...last,
    rounds,
    finishedPods,
    meanWaitTicks,
  };
}

export function runMonteCarlo(
  baseSeed: number,
  sizes: number[] = [7, 11, 17, 30],
): SnapshotMetrics[] {
  return sizes.map((playerCount, index) =>
    runSeededSnapshot(baseSeed + index * 997, playerCount, Math.max(1, Math.floor(playerCount / 4))),
  );
}
