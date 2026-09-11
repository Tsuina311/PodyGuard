import { describe, expect, it } from 'vitest';
import {
  assertLockedAssignmentsUnchanged,
  byeCountByPlayer,
  computeDuelStandings,
  createRoundEventState,
  generateDuelRound,
  generatePodRound,
  moveAssignmentToTable,
  planPodSizes,
  publishRound,
  recommendRoundCount,
  reoptimizeUnlockedAssignments,
  shortPodCountByPlayer,
  startRound,
  swapPlayersBetweenAssignments,
  type RoundFairnessHistory,
  type RoundParticipantInput,
  type RoundTableInput,
} from './rounds';

function players(count: number): RoundParticipantInput[] {
  return Array.from({ length: count }, (_, index) => ({
    participantId: `p${String(index + 1).padStart(2, '0')}`,
    displayName: `Player ${index + 1}`,
    eligible: true,
  }));
}

function tables(count: number): RoundTableInput[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `t${index + 1}`,
    label: String(index + 1),
    status: 'free' as const,
  }));
}

describe('round helpers', () => {
  it('recommends a bounded casual round count', () => {
    expect(recommendRoundCount(8)).toBe(3);
    expect(recommendRoundCount(32)).toBe(5);
    expect(recommendRoundCount(200)).toBe(8);
  });

  it('plans 11 players as 4+4+3', () => {
    expect(planPodSizes(11, 4, [3, 4])).toEqual([4, 4, 3]);
  });

  it('plans 8 players as 4+4', () => {
    expect(planPodSizes(8, 4, [3, 4])).toEqual([4, 4]);
  });

  it('plans 14 players with two short pods when needed', () => {
    expect(planPodSizes(14, 4, [3, 4])).toEqual([4, 4, 3, 3]);
  });
});

describe('synchronous pod rounds', () => {
  it('seats everybody exactly once with legal sizes', () => {
    const round = generatePodRound({
      roundNumber: 1,
      participants: players(11),
      tables: tables(4),
      history: { pods: [], duels: [] },
      preferredPodSize: 4,
      allowedPodSizes: [3, 4],
      pairingBasisVersion: 0,
      seedKey: 'event-a',
    });
    const seated = round.assignments.flatMap((assignment) => assignment.participantIds);
    expect(new Set(seated).size).toBe(11);
    expect(seated).toHaveLength(11);
    expect(round.assignments.map((assignment) => assignment.participantIds.length).sort()).toEqual([
      3, 4, 4,
    ]);
    expect(round.status).toBe('PLANNING');
  });

  it('is deterministic for identical inputs', () => {
    const input = {
      roundNumber: 2,
      participants: players(8),
      tables: tables(3),
      history: { pods: [], duels: [] } satisfies RoundFairnessHistory,
      preferredPodSize: 4,
      allowedPodSizes: [3, 4],
      pairingBasisVersion: 1,
      seedKey: 'same',
      now: '2026-01-01T00:00:00.000Z',
    };
    expect(generatePodRound(input)).toEqual(generatePodRound(input));
  });

  it('reduces avoidable rematches across two 8-player rounds', () => {
    const field = players(8);
    const room = tables(2);
    const round1 = generatePodRound({
      roundNumber: 1,
      participants: field,
      tables: room,
      history: { pods: [], duels: [] },
      preferredPodSize: 4,
      allowedPodSizes: [4],
      pairingBasisVersion: 0,
      seedKey: 'rematch',
    });
    const history: RoundFairnessHistory = {
      pods: round1.assignments.map((assignment) => ({
        roundNumber: 1,
        participantIds: assignment.participantIds,
        preferredSize: 4,
      })),
      duels: [],
    };
    const round2 = generatePodRound({
      roundNumber: 2,
      participants: field,
      tables: room,
      history,
      preferredPodSize: 4,
      allowedPodSizes: [4],
      pairingBasisVersion: 1,
      seedKey: 'rematch',
    });
    const priorPairs = new Set<string>();
    for (const assignment of round1.assignments) {
      const ids = assignment.participantIds;
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          priorPairs.add([ids[i], ids[j]].sort().join('|'));
        }
      }
    }
    let repeats = 0;
    for (const assignment of round2.assignments) {
      const ids = assignment.participantIds;
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          if (priorPairs.has([ids[i], ids[j]].sort().join('|'))) repeats += 1;
        }
      }
    }
    // After a 4+4 round, any later 4+4 partition must reuse at least four pairs.
    expect(repeats).toBe(4);
    expect(
      round2.assignments
        .map((assignment) => [...assignment.participantIds].sort().join('|'))
        .sort(),
    ).not.toEqual(
      round1.assignments
        .map((assignment) => [...assignment.participantIds].sort().join('|'))
        .sort(),
    );
  });

  it('rotates short-pod burden across rounds for 11 players', () => {
    const field = players(11);
    const room = tables(3);
    let history: RoundFairnessHistory = { pods: [], duels: [] };
    const shortRecipients: string[][] = [];
    for (let roundNumber = 1; roundNumber <= 4; roundNumber += 1) {
      const round = generatePodRound({
        roundNumber,
        participants: field,
        tables: room,
        history,
        preferredPodSize: 4,
        allowedPodSizes: [3, 4],
        pairingBasisVersion: roundNumber - 1,
        seedKey: 'short-rotate',
      });
      const short = round.assignments.find(
        (assignment) => assignment.participantIds.length === 3,
      );
      expect(short).toBeDefined();
      shortRecipients.push([...short!.participantIds].sort());
      history = {
        pods: [
          ...history.pods,
          ...round.assignments.map((assignment) => ({
            roundNumber,
            participantIds: assignment.participantIds,
            preferredSize: 4,
          })),
        ],
        duels: [],
      };
    }
    const counts = shortPodCountByPlayer(history, 4);
    const values = field.map((player) => counts.get(player.participantId) ?? 0);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
    // Same trio should not monopolize every short pod.
    expect(new Set(shortRecipients.map((ids) => ids.join('|'))).size).toBeGreaterThan(1);
  });

  it('surfaces hard table-lock conflicts instead of silently breaking them', () => {
    const field = players(4);
    field[0] = {
      ...field[0]!,
      tablePreference: 'locked',
      lockedTableId: 'missing-table',
    };
    expect(() =>
      generatePodRound({
        roundNumber: 1,
        participants: field,
        tables: tables(1),
        history: { pods: [], duels: [] },
        preferredPodSize: 4,
        allowedPodSizes: [4],
        pairingBasisVersion: 0,
      }),
    ).toThrow(/Table lock/);
  });
});

describe('duel Swiss-like rounds', () => {
  it('pairs eight players without rematches across three rounds', () => {
    const field = players(8);
    const room = tables(4);
    let history: RoundFairnessHistory = { pods: [], duels: [] };
    for (let roundNumber = 1; roundNumber <= 3; roundNumber += 1) {
      const round = generateDuelRound({
        roundNumber,
        participants: field,
        tables: room,
        history,
        pairingBasisVersion: roundNumber - 1,
        seedKey: 'duel8',
      });
      expect(round.assignments.filter((assignment) => !assignment.isBye)).toHaveLength(4);
      for (const assignment of round.assignments) {
        if (assignment.isBye || assignment.participantIds.length < 2) continue;
        const [a, b] = assignment.participantIds;
        const prior = history.duels.some(
          (duel) =>
            duel.playerBId &&
            [duel.playerAId, duel.playerBId].sort().join('|') === [a, b].sort().join('|'),
        );
        expect(prior).toBe(false);
        assignment.outcome = 'PLAYER_A_WIN';
      }
      history = {
        pods: [],
        duels: [
          ...history.duels,
          ...round.assignments.map((assignment) =>
            assignment.isBye
              ? {
                  roundNumber,
                  playerAId: assignment.participantIds[0]!,
                  isBye: true,
                  outcome: 'BYE' as const,
                }
              : {
                  roundNumber,
                  playerAId: assignment.participantIds[0]!,
                  playerBId: assignment.participantIds[1],
                  outcome: assignment.outcome,
                },
          ),
        ],
      };
    }
  });

  it('rotates byes for seven players', () => {
    const field = players(7);
    const room = tables(4);
    let history: RoundFairnessHistory = { pods: [], duels: [] };
    const byeRecipients: string[] = [];
    for (let roundNumber = 1; roundNumber <= 3; roundNumber += 1) {
      const round = generateDuelRound({
        roundNumber,
        participants: field,
        tables: room,
        history,
        pairingBasisVersion: roundNumber - 1,
        seedKey: 'bye7',
      });
      const bye = round.assignments.find((assignment) => assignment.isBye);
      expect(bye).toBeDefined();
      byeRecipients.push(bye!.participantIds[0]!);
      history = {
        pods: [],
        duels: [
          ...history.duels,
          ...round.assignments.map((assignment) =>
            assignment.isBye
              ? {
                  roundNumber,
                  playerAId: assignment.participantIds[0]!,
                  isBye: true,
                  outcome: 'BYE' as const,
                }
              : {
                  roundNumber,
                  playerAId: assignment.participantIds[0]!,
                  playerBId: assignment.participantIds[1],
                  outcome: 'PLAYER_A_WIN' as const,
                },
          ),
        ],
      };
    }
    expect(new Set(byeRecipients).size).toBe(3);
    const counts = byeCountByPlayer(history);
    expect(Math.max(...[...counts.values()])).toBe(1);
  });

  it('computes simple match-point standings', () => {
    const standings = computeDuelStandings(['a', 'b', 'c'], {
      pods: [],
      duels: [
        { roundNumber: 1, playerAId: 'a', playerBId: 'b', outcome: 'PLAYER_A_WIN' },
        { roundNumber: 1, playerAId: 'c', isBye: true, outcome: 'BYE' },
      ],
    });
    expect(standings[0]?.participantId).toBe('a');
    expect(standings.find((row) => row.participantId === 'c')?.byes).toBe(1);
    expect(standings.find((row) => row.participantId === 'c')?.matchPoints).toBe(3);
  });
});

describe('surgical repair', () => {
  it('leaves unrelated tables unchanged when re-optimizing two pods', () => {
    const field = players(12);
    const room = tables(3);
    const round = publishRound(
      generatePodRound({
        roundNumber: 1,
        participants: field,
        tables: room,
        history: { pods: [], duels: [] },
        preferredPodSize: 4,
        allowedPodSizes: [4],
        pairingBasisVersion: 0,
        seedKey: 'repair',
      }),
    );
    const unlocked = [round.assignments[1]!.id, round.assignments[2]!.id];
    const repaired = reoptimizeUnlockedAssignments({
      round,
      unlockedAssignmentIds: unlocked,
      participants: field,
      tables: room,
      history: { pods: [], duels: [] },
      preferredPodSize: 4,
      allowedPodSizes: [4],
      seedKey: 'repair',
    });
    assertLockedAssignmentsUnchanged(round, repaired, unlocked);
    expect(repaired.assignments[0]).toEqual({ ...round.assignments[0], locked: true });
  });

  it('swaps two players without touching a third table', () => {
    const round = generatePodRound({
      roundNumber: 1,
      participants: players(12),
      tables: tables(3),
      history: { pods: [], duels: [] },
      preferredPodSize: 4,
      allowedPodSizes: [4],
      pairingBasisVersion: 0,
    });
    const left = round.assignments[0]!;
    const right = round.assignments[1]!;
    const untouched = round.assignments[2]!;
    const swapped = swapPlayersBetweenAssignments(
      round,
      left.id,
      left.participantIds[0]!,
      right.id,
      right.participantIds[0]!,
    );
    expect(swapped.assignments[2]).toEqual(untouched);
    expect(swapped.assignments[0]?.participantIds).toContain(right.participantIds[0]!);
    expect(swapped.assignments[1]?.participantIds).toContain(left.participantIds[0]!);
  });

  it('moves a pod to another free table', () => {
    const round = generatePodRound({
      roundNumber: 1,
      participants: players(4),
      tables: tables(2),
      history: { pods: [], duels: [] },
      preferredPodSize: 4,
      allowedPodSizes: [4],
      pairingBasisVersion: 0,
    });
    const moved = moveAssignmentToTable(round, round.assignments[0]!.id, {
      id: 't2',
      label: '2',
      status: 'free',
    });
    expect(moved.assignments[0]?.tableId).toBe('t2');
  });
});

describe('round lifecycle', () => {
  it('publishes then starts a planning round', () => {
    const draft = generatePodRound({
      roundNumber: 1,
      participants: players(4),
      tables: tables(1),
      history: { pods: [], duels: [] },
      preferredPodSize: 4,
      allowedPodSizes: [4],
      pairingBasisVersion: 0,
    });
    const published = publishRound(draft);
    const active = startRound(published, 3000, '2026-01-01T12:00:00.000Z');
    expect(active.status).toBe('ACTIVE');
    expect(active.startedAt).toBe('2026-01-01T12:00:00.000Z');
    expect(active.assignments[0]?.status).toBe('PLAYING');
  });

  it('creates an initial round event state', () => {
    const state = createRoundEventState({
      activityKind: 'POD',
      participantCount: 16,
      preferredPodSize: 4,
      allowedPodSizes: [3, 4],
      roundCount: 'AUTO',
    });
    expect(state.recommendedRoundCount).toBe(4);
    expect(state.currentRoundNumber).toBe(0);
  });
});
