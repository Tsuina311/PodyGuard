import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  assertLockedAssignmentsUnchanged,
  generateDuelRound,
  generatePodRound,
  reoptimizeUnlockedAssignments,
  type RoundParticipantInput,
  type RoundTableInput,
} from './rounds';

const configuredRuns = Number.parseInt(process.env.SIMULATION_PROPERTY_RUNS ?? '400', 10);
const propertyRuns =
  Number.isSafeInteger(configuredRuns) && configuredRuns > 0 ? configuredRuns : 400;
const PROPERTY_CHUNK_RUNS = 100;
const propertyTestTimeoutMs = Math.max(120_000, Math.ceil(propertyRuns / 400) * 120_000);

function tablesFor(count: number): RoundTableInput[] {
  return Array.from({ length: Math.ceil(count / 2) + 2 }, (_, index) => ({
    id: `t${index + 1}`,
    label: String(index + 1),
    status: 'free' as const,
  }));
}

function eightPlayers(): RoundParticipantInput[] {
  return Array.from({ length: 8 }, (_, index) => ({
    participantId: `p${String(index + 1).padStart(2, '0')}`,
    displayName: `Player ${index + 1}`,
    eligible: true,
  }));
}

describe('synchronous round properties', () => {
  it(
    `pod rounds stay legal, deterministic, and immutable (${propertyRuns} runs)`,
    async () => {
      let remaining = propertyRuns;
      while (remaining > 0) {
        const numRuns = Math.min(PROPERTY_CHUNK_RUNS, remaining);
        fc.assert(
          fc.property(
            fc.constantFrom(4, 6, 8, 11),
            fc.string({ maxLength: 8 }),
            (count, seed) => {
              const participants = Array.from({ length: count }, (_, index) => ({
                participantId: `p${String(index + 1).padStart(2, '0')}`,
                displayName: `Player ${index + 1}`,
                eligible: true,
              }));
              const allowedPodSizes = count % 4 === 0 ? [4] : count === 6 ? [3] : [3, 4];
              const preferredPodSize = allowedPodSizes.includes(4) ? 4 : 3;
              const input = {
                roundNumber: 1,
                participants,
                tables: tablesFor(count),
                history: { pods: [], duels: [] },
                preferredPodSize,
                allowedPodSizes,
                pairingBasisVersion: 0,
                seedKey: seed,
                now: '2026-01-01T00:00:00.000Z',
              };
              const before = structuredClone(input);
              const round = generatePodRound(input);
              expect(input).toEqual(before);
              expect(generatePodRound(input)).toEqual(round);

              const seated = round.assignments.flatMap(
                (assignment) => assignment.participantIds,
              );
              expect(new Set(seated).size).toBe(seated.length);
              expect(seated.length).toBe(count);
              for (const assignment of round.assignments) {
                expect(allowedPodSizes).toContain(assignment.participantIds.length);
              }
              const tableIds = round.assignments.map((assignment) => assignment.tableId);
              expect(new Set(tableIds).size).toBe(tableIds.length);
              return true;
            },
          ),
          { numRuns },
        );
        remaining -= numRuns;
        if (remaining > 0) {
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      }
    },
    propertyTestTimeoutMs,
  );

  it(
    `surgical repair never mutates locked assignments (${propertyRuns} runs)`,
    async () => {
      let remaining = propertyRuns;
      while (remaining > 0) {
        const numRuns = Math.min(PROPERTY_CHUNK_RUNS, remaining);
        fc.assert(
          fc.property(
            fc.integer({ min: 0, max: 1 }),
            fc.string({ maxLength: 6 }),
            (unlockIndex, seed) => {
              const participants = eightPlayers();
              const tables = tablesFor(8);
              const round = generatePodRound({
                roundNumber: 1,
                participants,
                tables,
                history: { pods: [], duels: [] },
                preferredPodSize: 4,
                allowedPodSizes: [4],
                pairingBasisVersion: 0,
                seedKey: seed,
                now: '2026-01-01T00:00:00.000Z',
              });
              const unlocked = [
                round.assignments[unlockIndex % round.assignments.length]!.id,
              ];
              const repaired = reoptimizeUnlockedAssignments({
                round,
                unlockedAssignmentIds: unlocked,
                participants,
                tables,
                history: { pods: [], duels: [] },
                preferredPodSize: 4,
                allowedPodSizes: [4],
                seedKey: seed,
              });
              assertLockedAssignmentsUnchanged(round, repaired, unlocked);
              return true;
            },
          ),
          { numRuns },
        );
        remaining -= numRuns;
        if (remaining > 0) {
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      }
    },
    propertyTestTimeoutMs,
  );

  it('duel rounds assign each eligible player at most once', () => {
    const participants = Array.from({ length: 7 }, (_, index) => ({
      participantId: `p${index + 1}`,
      displayName: `Player ${index + 1}`,
      eligible: true,
    }));
    const round = generateDuelRound({
      roundNumber: 1,
      participants,
      tables: tablesFor(7),
      history: { pods: [], duels: [] },
      pairingBasisVersion: 0,
      now: '2026-01-01T00:00:00.000Z',
    });
    const seated = round.assignments.flatMap((assignment) => assignment.participantIds);
    expect(new Set(seated).size).toBe(7);
    expect(round.assignments.filter((assignment) => assignment.isBye)).toHaveLength(1);
  });
});
