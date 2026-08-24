import { createMatches } from './create-matches.js';
import { eligiblePoolIds, preferredPoolId } from './invariants.js';
import {
  FALLBACK_POD_SIZE,
  PREFERRED_POD_SIZE,
  type AvailableTable,
  type MatchHistory,
  type MatchOptions,
  type MatchResult,
  type MatchSeat,
  type ProposedMatch,
  type ReadyParticipant,
} from './types.js';

type Scored = {
  matched: number;
  fours: number;
  concessions: number;
  rematches: number;
  result: MatchResult;
};

const NODE_LIMIT = 80_000;

export function optimalMatches(
  participants: ReadyParticipant[],
  tables: AvailableTable[],
  history: MatchHistory = { groups: [] },
  options: MatchOptions = {},
): MatchResult {
  if (participants.length === 0 || tables.length === 0) {
    return { matches: [], unmatchedIds: participants.map((row) => row.id) };
  }
  const preferredSize = options.preferredSize ?? PREFERRED_POD_SIZE;
  const allowedSizes = [...(options.allowedSizes ?? [preferredSize, FALLBACK_POD_SIZE])].sort(
    (left, right) => right - left,
  );
  const minSize = Math.min(...allowedSizes);
  const pairHistory = buildPairHistory(history.groups);
  const byId = new Map(participants.map((row) => [row.id, row]));
  let nodes = 0;
  let best: Scored | undefined;

  const search = (remaining: string[], tableIndex: number, pods: ProposedMatch[]) => {
    nodes += 1;
    if (nodes > NODE_LIMIT) {
      return;
    }
    consider(pods, remaining);
    if (tableIndex >= tables.length || remaining.length < minSize) {
      return;
    }
    const table = tables[tableIndex];
    if (!table) {
      return;
    }
    const players = remaining
      .map((id) => byId.get(id))
      .filter((row): row is ReadyParticipant => Boolean(row));
    const pools = [...new Set(players.flatMap(eligiblePoolIds))];
    for (const size of allowedSizes) {
      if (players.length < size) {
        continue;
      }
      for (const poolId of pools) {
        const eligible = players.filter((row) => eligiblePoolIds(row).includes(poolId));
        if (eligible.length < size) {
          continue;
        }
        for (const group of combinations(eligible, size)) {
          const seats: MatchSeat[] = group.map((player) => ({
            participantId: player.id,
            poolId,
            deckId: deckIdForPool(player, poolId),
            concession: poolId !== preferredPoolId(player),
            flexDelta: 0,
          }));
          const taken = new Set(group.map((row) => row.id));
          search(
            remaining.filter((id) => !taken.has(id)),
            tableIndex + 1,
            [
              ...pods,
              { tableId: table.id, poolId, seats },
            ],
          );
        }
      }
    }
  };

  const consider = (pods: ProposedMatch[], leftover: string[]) => {
    const result: MatchResult = {
      matches: pods,
      unmatchedIds: leftover,
    };
    const scored: Scored = {
      matched: pods.reduce((sum, row) => sum + row.seats.length, 0),
      fours: pods.filter((row) => row.seats.length === preferredSize).length,
      concessions: pods.reduce(
        (sum, row) => sum + row.seats.filter((seat) => seat.concession).length,
        0,
      ),
      rematches: pods.reduce(
        (sum, row) =>
          sum + rematchPairs(row.seats.map((seat) => seat.participantId), pairHistory),
        0,
      ),
      result,
    };
    if (!best || isBetter(scored, best)) {
      best = scored;
    }
  };

  search(
    participants.map((row) => row.id),
    0,
    [],
  );
  return best?.result ?? createMatches(participants, tables, history, options);
}

function isBetter(candidate: Scored, current: Scored): boolean {
  if (candidate.matched !== current.matched) {
    return candidate.matched > current.matched;
  }
  if (candidate.fours !== current.fours) {
    return candidate.fours > current.fours;
  }
  if (candidate.concessions !== current.concessions) {
    return candidate.concessions < current.concessions;
  }
  if (candidate.rematches !== current.rematches) {
    return candidate.rematches < current.rematches;
  }
  return false;
}

function deckIdForPool(player: ReadyParticipant, poolId: string): string {
  const inPool = player.decks.filter((row) => row.poolId === poolId);
  return inPool[0]?.id ?? `${player.id}:${poolId}`;
}

function buildPairHistory(groups: string[][]): Set<string> {
  const pairs = new Set<string>();
  for (const group of groups) {
    for (let left = 0; left < group.length; left += 1) {
      for (let right = left + 1; right < group.length; right += 1) {
        const first = group[left];
        const second = group[right];
        if (first && second) {
          pairs.add(pairKey(first, second));
        }
      }
    }
  }
  return pairs;
}

function rematchPairs(ids: string[], pairHistory: Set<string>): number {
  let count = 0;
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) {
      const first = ids[left];
      const second = ids[right];
      if (first && second && pairHistory.has(pairKey(first, second))) {
        count += 1;
      }
    }
  }
  return count;
}

function pairKey(left: string, right: string): string {
  return left < right ? `${left}:${right}` : `${right}:${left}`;
}

function combinations<T>(items: T[], choose: number): T[][] {
  if (choose === 0) {
    return [[]];
  }
  if (choose > items.length) {
    return [];
  }
  const out: T[][] = [];
  const walk = (start: number, acc: T[]) => {
    if (acc.length === choose) {
      out.push([...acc]);
      return;
    }
    for (let index = start; index < items.length; index += 1) {
      const item = items[index];
      if (!item) {
        continue;
      }
      acc.push(item);
      walk(index + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}
