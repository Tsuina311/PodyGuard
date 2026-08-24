import { computeFlexDelta, flexScore } from './flex.js';
import {
  FALLBACK_POD_SIZE,
  OPEN_POOL_ID,
  PREFERRED_POD_SIZE,
  type AvailableTable,
  type MatchDeck,
  type MatchHistory,
  type MatchOptions,
  type MatchResult,
  type MatchSeat,
  type ProposedMatch,
  type ReadyParticipant,
} from './types.js';

type Assignment = Map<string, string>;

type ScoredPlan = {
  matches: ProposedMatch[];
  unmatchedIds: string[];
  matched: number;
  fours: number;
  concessions: number;
  rematches: number;
};

export function createMatches(
  participants: ReadyParticipant[],
  tables: AvailableTable[],
  history: MatchHistory = { groups: [] },
  options: MatchOptions = {},
): MatchResult {
  const preferredSize = options.preferredSize ?? PREFERRED_POD_SIZE;
  const allowedSizes = [...(options.allowedSizes ?? [preferredSize, FALLBACK_POD_SIZE])].sort(
    (left, right) => right - left,
  );
  const minSize = Math.min(...allowedSizes);
  if (participants.length === 0 || tables.length === 0 || !Number.isFinite(minSize)) {
    return { matches: [], unmatchedIds: participants.map((row) => row.id) };
  }

  const pairHistory = buildPairHistory(history.groups);
  let assignment: Assignment = new Map(
    participants.map((row) => [row.id, preferredPool(row)]),
  );
  let best = evaluate(
    participants,
    tables,
    assignment,
    pairHistory,
    allowedSizes,
    minSize,
    preferredSize,
  );

  const flexible = participants
    .filter((row) => eligiblePools(row).length > 1)
    .sort(byReadyAt);

  let improved = true;
  while (improved) {
    improved = false;
    for (const player of flexible) {
      const current = assignment.get(player.id);
      for (const poolId of eligiblePools(player)) {
        if (poolId === current) {
          continue;
        }
        const next = new Map(assignment);
        next.set(player.id, poolId);
        const candidate = evaluate(
          participants,
          tables,
          next,
          pairHistory,
          allowedSizes,
          minSize,
          preferredSize,
        );
        if (isBetter(candidate, best)) {
          best = candidate;
          assignment = next;
          improved = true;
          break;
        }
      }
      if (improved) {
        break;
      }
    }
  }

  return {
    matches: best.matches,
    unmatchedIds: best.unmatchedIds,
  };
}

function evaluate(
  participants: ReadyParticipant[],
  tables: AvailableTable[],
  assignment: Assignment,
  pairHistory: Set<string>,
  allowedSizes: number[],
  minSize: number,
  preferredSize: number,
): ScoredPlan {
  const byPool = new Map<string, ReadyParticipant[]>();
  for (const player of participants) {
    const poolId = assignment.get(player.id) ?? preferredPool(player);
    const list = byPool.get(poolId) ?? [];
    list.push(player);
    byPool.set(poolId, list);
  }

  const pods: Array<{ poolId: string; players: ReadyParticipant[] }> = [];
  for (const [poolId, players] of byPool) {
    pods.push(...formPods(players.sort(byReadyAt), allowedSizes, minSize, pairHistory, preferredSize).map((group) => ({
      poolId,
      players: group,
    })));
  }

  pods.sort((left, right) => {
    if (right.players.length !== left.players.length) {
      return right.players.length - left.players.length;
    }
    return totalWait(left.players) - totalWait(right.players);
  });

  const matches: ProposedMatch[] = [];
  const seated = new Set<string>();
  for (let index = 0; index < Math.min(pods.length, tables.length); index += 1) {
    const pod = pods[index];
    const table = tables[index];
    if (!pod || !table) {
      break;
    }
    const seats: MatchSeat[] = pod.players.map((player) => {
      const deck = deckForPool(player, pod.poolId);
      return {
        participantId: player.id,
        poolId: pod.poolId,
        deckId: deck.id,
        concession: deck.concession,
        flexDelta: computeFlexDelta({
          concession: deck.concession,
          podSize: pod.players.length,
          flexCredits: player.flexCredits ?? 0,
          preferredSize,
        }),
      };
    });
    for (const seat of seats) {
      seated.add(seat.participantId);
    }
    matches.push({
      tableId: table.id,
      poolId: pod.poolId,
      seats,
    });
  }

  return {
    matches,
    unmatchedIds: participants
      .filter((row) => !seated.has(row.id))
      .map((row) => row.id),
    matched: seated.size,
    fours: matches.filter((row) => row.seats.length === PREFERRED_POD_SIZE).length,
    concessions: matches.reduce(
      (sum, row) => sum + row.seats.filter((seat) => seat.concession).length,
      0,
    ),
    rematches: matches.reduce(
      (sum, row) => sum + rematchPairs(row.seats.map((seat) => seat.participantId), pairHistory),
      0,
    ),
  };
}

function canFullyPack(count: number, allowedSizes: number[]): boolean {
  if (count === 0) {
    return true;
  }
  const options = allowedSizes.filter((size) => size <= count);
  for (const size of options) {
    if (canFullyPack(count - size, allowedSizes)) {
      return true;
    }
  }
  return false;
}

function choosePodSize(
  remaining: number,
  allowedSizes: number[],
  preferredSize: number,
): number | undefined {
  const ordered = [...allowedSizes]
    .filter((size) => size <= remaining)
    .sort((left, right) => {
      if (left === preferredSize && right !== preferredSize) {
        return -1;
      }
      if (right === preferredSize && left !== preferredSize) {
        return 1;
      }
      return right - left;
    });
  for (const size of ordered) {
    if (canFullyPack(remaining - size, allowedSizes)) {
      return size;
    }
  }
  return ordered[0];
}

function formPods(
  players: ReadyParticipant[],
  allowedSizes: number[],
  minSize: number,
  pairHistory: Set<string>,
  preferredSize: number,
): ReadyParticipant[][] {
  const remaining = [...players];
  const pods: ReadyParticipant[][] = [];
  while (remaining.length >= minSize) {
    const size = choosePodSize(remaining.length, allowedSizes, preferredSize);
    if (!size) {
      break;
    }
    const group = pickGroup(remaining, size, pairHistory);
    pods.push(group);
    const taken = new Set(group.map((row) => row.id));
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      if (taken.has(remaining[index]?.id ?? '')) {
        remaining.splice(index, 1);
      }
    }
  }
  return pods;
}

function pickGroup(
  remaining: ReadyParticipant[],
  size: number,
  pairHistory: Set<string>,
): ReadyParticipant[] {
  const seed = remaining[0];
  if (!seed) {
    return [];
  }
  const rest = remaining.slice(1);
  if (rest.length < size - 1) {
    return remaining.slice(0, size);
  }
  const window = rest.slice(0, Math.min(rest.length, 8));
  const combos = combinations(window, size - 1);
  let best = [seed, ...rest.slice(0, size - 1)];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const combo of combos) {
    const group = [seed, ...combo];
    const rematches = rematchPairs(
      group.map((row) => row.id),
      pairHistory,
    );
    const wait = totalWait(group);
    const flex = group.reduce(
      (sum, row) => sum + flexScore(row.flexCredits ?? 0),
      0,
    );
    const score = rematches * 1_000_000 + wait - flex;
    if (score < bestScore) {
      best = group;
      bestScore = score;
    }
  }
  return best;
}

function eligiblePools(player: ReadyParticipant): string[] {
  const decks = effectiveDecks(player);
  return [...new Set(decks.map((row) => row.poolId))];
}

function preferredPool(player: ReadyParticipant): string {
  const decks = effectiveDecks(player);
  const preferred = decks.find((row) => row.preference === 'preferred');
  return preferred?.poolId ?? decks[0]?.poolId ?? OPEN_POOL_ID;
}

function deckForPool(
  player: ReadyParticipant,
  poolId: string,
): { id: string; concession: boolean } {
  const decks = effectiveDecks(player);
  const inPool = decks.filter((row) => row.poolId === poolId);
  const chosen = inPool.find((row) => row.preference === 'preferred') ?? inPool[0] ?? decks[0];
  return {
    id: chosen?.id ?? `${player.id}:${OPEN_POOL_ID}`,
    concession: poolId !== preferredPool(player),
  };
}

function effectiveDecks(player: ReadyParticipant): MatchDeck[] {
  if (player.decks.length > 0) {
    return player.decks;
  }
  return [
    {
      id: `${player.id}:${OPEN_POOL_ID}`,
      poolId: OPEN_POOL_ID,
      preference: 'preferred',
    },
  ];
}

function byReadyAt(left: ReadyParticipant, right: ReadyParticipant): number {
  return left.readyAt - right.readyAt;
}

function totalWait(players: ReadyParticipant[]): number {
  return players.reduce((sum, row) => sum + row.readyAt, 0);
}

function isBetter(candidate: ScoredPlan, current: ScoredPlan): boolean {
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
