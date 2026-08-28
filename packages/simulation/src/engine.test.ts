import { describe, expect, it } from 'vitest';
import { runSimulation } from './engine.js';
import { StableEventQueue } from './event-queue.js';
import type { MetricGame } from './metrics.js';
import { constant, defineScenario, uniform, type SimulationScenario } from './scenario.js';

function scenario(overrides: Partial<SimulationScenario> = {}): SimulationScenario {
  return defineScenario({
    id: 'TEST_SCENARIO',
    description: 'Deterministic simulation test scenario.',
    playerCount: 8,
    durationSeconds: 100,
    tableCount: 2,
    initiallyDisabledTables: 0,
    preferredPodSize: 4,
    allowedPodSizes: [4, 3],
    arrivalSeconds: constant(0),
    readyDelaySeconds: constant(0),
    poolWeights: [{ value: 'B3', weight: 1 }],
    secondaryPoolProbability: 0,
    startingFlex: constant(0),
    gameDurationSeconds: constant(10),
    requeueProbability: 0,
    requeueDelaySeconds: constant(0),
    pauseProbability: 0,
    pauseDurationSeconds: constant(5),
    leaveProbability: 0,
    leaveWhileWaitingProbability: 0,
    pauseWhileWaitingProbability: 0,
    waitingDecisionDelaySeconds: constant(2),
    tableBreaks: [],
    ...overrides,
  });
}

describe('StableEventQueue', () => {
  it('orders by timestamp and preserves insertion order at equal timestamps', () => {
    const queue = new StableEventQueue<string>();
    queue.schedule(20, 'later');
    queue.schedule(10, 'first-at-ten');
    queue.schedule(10, 'second-at-ten');
    queue.schedule(0, 'first');
    expect([queue.pop(), queue.pop(), queue.pop(), queue.pop()]).toEqual([
      { time: 0, sequence: 3, value: 'first' },
      { time: 10, sequence: 1, value: 'first-at-ten' },
      { time: 10, sequence: 2, value: 'second-at-ten' },
      { time: 20, sequence: 0, value: 'later' },
    ]);
  });
});

describe('simulation engine lifecycle and reproducibility', () => {
  it('produces byte-for-byte equivalent results for the same seed', () => {
    const input = scenario({
      arrivalSeconds: uniform(0, 20),
      readyDelaySeconds: uniform(0, 5),
      gameDurationSeconds: uniform(5, 15),
      requeueProbability: 0.7,
    });
    expect(runSimulation(input, { seed: 12345, debug: true })).toEqual(
      runSimulation(input, { seed: 12345, debug: true }),
    );
  });

  it('makes different seeds observably different for stochastic scenarios', () => {
    const input = scenario({
      playerCount: 20,
      tableCount: 5,
      arrivalSeconds: uniform(0, 40),
      readyDelaySeconds: uniform(0, 10),
      gameDurationSeconds: uniform(5, 20),
      requeueProbability: 0.5,
    });
    const first = runSimulation(input, { seed: 1, debug: true });
    const second = runSimulation(input, { seed: 2, debug: true });
    expect(first.record).not.toEqual(second.record);
    expect(first.timeline).not.toEqual(second.timeline);
  });

  it('releases a table and reuses it across multiple games', () => {
    const result = runSimulation(scenario({
      playerCount: 4,
      tableCount: 1,
      durationSeconds: 36,
      gameDurationSeconds: constant(5),
      requeueProbability: 1,
    }), { seed: 7 });
    expect(result.record.games.length).toBeGreaterThan(1);
    expect(new Set(result.record.games.map((game) => game.tableId))).toEqual(new Set(['table-01']));
    for (let index = 1; index < result.record.games.length; index += 1) {
      expect(result.record.games[index]?.startedAt).toBe(result.record.games[index - 1]?.endedAt);
    }
  });

  it('creates a fresh queue cycle for every requeue', () => {
    const result = runSimulation(scenario({
      playerCount: 4,
      tableCount: 1,
      durationSeconds: 31,
      gameDurationSeconds: constant(5),
      requeueProbability: 1,
    }), { seed: 11 });
    const cycles = result.record.queueCycles.filter((cycle) => cycle.participantId === 'p001');
    expect(cycles.length).toBeGreaterThan(2);
    expect(cycles.map((cycle) => cycle.cycle)).toEqual(
      Array.from({ length: cycles.length }, (_, index) => index + 1),
    );
    expect(cycles.every((cycle) => cycle.reason === 'matched')).toBe(true);
  });

  it('closes a paused wait and resumes into a new cycle', () => {
    const result = runSimulation(scenario({
      playerCount: 1,
      tableCount: 1,
      initiallyDisabledTables: 1,
      durationSeconds: 20,
      pauseWhileWaitingProbability: 1,
    }), { seed: 5 });
    const cycles = result.record.queueCycles.filter((cycle) => cycle.participantId === 'p001');
    expect(cycles.slice(0, 3).map(({ cycle, reason }) => ({ cycle, reason }))).toEqual([
      { cycle: 1, reason: 'paused' },
      { cycle: 2, reason: 'paused' },
      { cycle: 3, reason: 'paused' },
    ]);
    expect(cycles.every((cycle) => cycle.reason === 'paused')).toBe(true);
    expect(result.record.participants[0]?.finalStatus).toBe('paused');
  });

  it('closes the open queue cycle when a waiting participant leaves', () => {
    const result = runSimulation(scenario({
      playerCount: 1,
      tableCount: 1,
      initiallyDisabledTables: 1,
      durationSeconds: 20,
      leaveWhileWaitingProbability: 1,
    }), { seed: 9 });
    expect(result.record.queueCycles).toEqual([
      expect.objectContaining({
        participantId: 'p001',
        cycle: 1,
        startedAt: 0,
        endedAt: 2,
        reason: 'left',
      }),
    ]);
    expect(result.record.participants[0]?.finalStatus).toBe('left');
  });

  it('never places one participant in overlapping active games', () => {
    const result = runSimulation(scenario({
      playerCount: 20,
      tableCount: 5,
      durationSeconds: 100,
      arrivalSeconds: uniform(0, 15),
      gameDurationSeconds: uniform(5, 20),
      requeueProbability: 1,
    }), { seed: 101 });
    const gamesByParticipant = new Map<string, MetricGame[]>();
    for (const game of result.record.games) {
      for (const seat of game.seats) {
        const games = gamesByParticipant.get(seat.participantId) ?? [];
        games.push(game);
        gamesByParticipant.set(seat.participantId, games);
      }
    }
    for (const games of gamesByParticipant.values()) {
      games.sort((left, right) => left.startedAt - right.startedAt);
      for (let index = 1; index < games.length; index += 1) {
        expect(games[index]?.startedAt).toBeGreaterThanOrEqual(games[index - 1]?.endedAt ?? 0);
      }
    }
    expect(result.record.safetyViolations).toEqual([]);
  });

  it('replays exactly from metadata seed and scenario', () => {
    const input = scenario({ arrivalSeconds: uniform(0, 20), requeueProbability: 0.5 });
    const original = runSimulation(input, { seed: 8675309, suiteVersion: 'test-suite' });
    expect(original.metadata.replay).toContain('--scenario TEST_SCENARIO --seed 8675309');
    const replayed = runSimulation(input, {
      seed: original.metadata.seed,
      suiteVersion: original.metadata.scenarioSuiteVersion,
    });
    expect(replayed).toEqual(original);
  });
});

describe('scenario validation at the engine boundary', () => {
  it.each([
    ['bad id', { id: 'bad-id' }],
    ['zero players', { playerCount: 0 }],
    ['too many disabled tables', { tableCount: 1, initiallyDisabledTables: 2 }],
    ['missing preferred size', { preferredPodSize: 4, allowedPodSizes: [3] }],
    ['probabilities above one', { requeueProbability: 0.8, pauseProbability: 0.3 }],
    ['invalid table break', { tableCount: 1, tableBreaks: [{ tableIndex: 1, at: 1, duration: 1 }] }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => scenario(overrides as Partial<SimulationScenario>)).toThrow();
  });

  it('rejects an unsafe seed before simulation starts', () => {
    expect(() => runSimulation(scenario(), { seed: Number.MAX_VALUE })).toThrow(
      /safe integer/,
    );
  });
});
