import {
  FALLBACK_POD_SIZE,
  OPEN_POOL_ID,
  PREFERRED_POD_SIZE,
  type AvailableTable,
  type MatchHistory,
  type MatchOptions,
  type MatchResult,
  type ReadyParticipant,
} from './types.js';

export type InvariantIssue = {
  code: string;
  detail: string;
};

export function eligiblePoolIds(player: ReadyParticipant): string[] {
  if (player.decks.length === 0) {
    return [OPEN_POOL_ID];
  }
  return [...new Set(player.decks.map((row) => row.poolId))];
}

export function preferredPoolId(player: ReadyParticipant): string {
  if (player.decks.length === 0) {
    return OPEN_POOL_ID;
  }
  const preferred = player.decks.find((row) => row.preference === 'preferred');
  return preferred?.poolId ?? player.decks[0]?.poolId ?? OPEN_POOL_ID;
}

export function checkMatchInvariants(
  participants: ReadyParticipant[],
  tables: AvailableTable[],
  history: MatchHistory,
  result: MatchResult,
  options: MatchOptions = {},
): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  const preferredSize = options.preferredSize ?? PREFERRED_POD_SIZE;
  const allowedSizes = new Set(
    options.allowedSizes ?? [preferredSize, FALLBACK_POD_SIZE],
  );
  const byId = new Map(participants.map((row) => [row.id, row]));
  const tableIds = new Set(tables.map((row) => row.id));
  const seated = new Set<string>();
  const usedTables = new Set<string>();

  for (const match of result.matches) {
    if (!tableIds.has(match.tableId)) {
      issues.push({ code: 'unknown-table', detail: match.tableId });
    }
    if (usedTables.has(match.tableId)) {
      issues.push({ code: 'table-reused', detail: match.tableId });
    }
    usedTables.add(match.tableId);
    if (!allowedSizes.has(match.seats.length)) {
      issues.push({
        code: 'invalid-pod-size',
        detail: `${match.tableId}:${String(match.seats.length)}`,
      });
    }
    for (const seat of match.seats) {
      if (seated.has(seat.participantId)) {
        issues.push({ code: 'double-seated', detail: seat.participantId });
      }
      seated.add(seat.participantId);
      const player = byId.get(seat.participantId);
      if (!player) {
        issues.push({ code: 'unknown-player', detail: seat.participantId });
        continue;
      }
      if (!eligiblePoolIds(player).includes(seat.poolId)) {
        issues.push({
          code: 'ineligible-pool',
          detail: `${seat.participantId}:${seat.poolId}`,
        });
      }
      if (seat.poolId !== match.poolId) {
        issues.push({
          code: 'mixed-pool-pod',
          detail: `${match.tableId}:${seat.participantId}`,
        });
      }
    }
  }

  const reported = new Set(result.unmatchedIds);
  for (const player of participants) {
    const matched = seated.has(player.id);
    const unmatched = reported.has(player.id);
    if (matched === unmatched) {
      issues.push({
        code: 'coverage',
        detail: player.id,
      });
    }
  }
  for (const id of result.unmatchedIds) {
    if (!byId.has(id)) {
      issues.push({ code: 'unknown-unmatched', detail: id });
    }
  }

  void history;
  return issues;
}
