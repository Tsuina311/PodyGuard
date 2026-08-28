import {
  constant,
  defineScenario,
  mixture,
  normal,
  uniform,
  type SimulationScenario,
} from './scenario.js';

export const SCENARIO_SUITE_VERSION = 'commander-nights-v1';

const DEFAULTS: Omit<SimulationScenario, 'id' | 'description' | 'playerCount'> = {
  durationSeconds: 4 * 60 * 60,
  tableCount: 10,
  initiallyDisabledTables: 0,
  preferredPodSize: 4,
  allowedPodSizes: [4, 3, 5],
  arrivalSeconds: normal(0, 90 * 60, 20 * 60, 15 * 60),
  readyDelaySeconds: uniform(0, 5 * 60),
  poolWeights: [
    { value: 'B2', weight: 55 },
    { value: 'B3', weight: 35 },
    { value: 'B4', weight: 10 },
  ],
  secondaryPoolProbability: 0.28,
  startingFlex: uniform(0, 2),
  gameDurationSeconds: normal(35 * 60, 90 * 60, 60 * 60, 12 * 60),
  requeueProbability: 0.55,
  requeueDelaySeconds: uniform(30, 5 * 60),
  pauseProbability: 0.1,
  pauseDurationSeconds: uniform(5 * 60, 20 * 60),
  leaveProbability: 0.15,
  leaveWhileWaitingProbability: 0.02,
  pauseWhileWaitingProbability: 0.03,
  waitingDecisionDelaySeconds: uniform(20 * 60, 50 * 60),
  tableBreaks: [],
};

type ScenarioOverrides = Partial<Omit<SimulationScenario, 'id' | 'description' | 'playerCount'>>;

function scenario(
  id: string,
  playerCount: number,
  description: string,
  overrides: ScenarioOverrides = {},
): SimulationScenario {
  return defineScenario({ ...DEFAULTS, ...overrides, id, playerCount, description });
}

export const NORMAL_FRIDAY_40 = scenario('NORMAL_FRIDAY_40', 40, 'Typical forty-player Commander night.');
export const NORMAL_FRIDAY_20 = scenario('NORMAL_FRIDAY_20', 20, 'Typical small Commander night.', {
  tableCount: 5,
});
export const NORMAL_FRIDAY_80 = scenario('NORMAL_FRIDAY_80', 80, 'Typical large Commander night.', {
  tableCount: 20,
});
export const LATE_ARRIVALS_40 = scenario('LATE_ARRIVALS_40', 40, 'Most players arrive late.', {
  arrivalSeconds: normal(30 * 60, 120 * 60, 65 * 60, 15 * 60),
});
export const EARLY_ARRIVALS_40 = scenario('EARLY_ARRIVALS_40', 40, 'Most players arrive near opening.', {
  arrivalSeconds: normal(0, 25 * 60, 5 * 60, 5 * 60),
});
export const TWO_ARRIVAL_WAVES_60 = scenario('TWO_ARRIVAL_WAVES_60', 60, 'Two distinct arrival waves.', {
  tableCount: 15,
  arrivalSeconds: mixture([
    { weight: 1, distribution: normal(0, 25 * 60, 8 * 60, 5 * 60) },
    { weight: 1, distribution: normal(55 * 60, 90 * 60, 70 * 60, 6 * 60) },
  ]),
});
export const TABLE_SCARCITY_50 = scenario('TABLE_SCARCITY_50', 50, 'Tables are the primary constraint.', {
  tableCount: 6,
});
export const EXCESS_TABLE_CAPACITY_30 = scenario(
  'EXCESS_TABLE_CAPACITY_30',
  30,
  'Far more tables than pods.',
  { tableCount: 30 },
);
export const B3_DOMINATED_40 = scenario('B3_DOMINATED_40', 40, 'Most players prefer the B3 pool.', {
  poolWeights: [
    { value: 'B2', weight: 15 },
    { value: 'B3', weight: 75 },
    { value: 'B4', weight: 10 },
  ],
});
export const B4_STARVATION_30 = scenario('B4_STARVATION_30', 30, 'Small B4 population risks starvation.', {
  tableCount: 8,
  poolWeights: [
    { value: 'B2', weight: 48 },
    { value: 'B3', weight: 44 },
    { value: 'B4', weight: 8 },
  ],
  secondaryPoolProbability: 0.12,
});
export const EVEN_BRACKET_SPLIT_40 = scenario(
  'EVEN_BRACKET_SPLIT_40',
  40,
  'Players split evenly between pools.',
  {
    poolWeights: [
      { value: 'B2', weight: 1 },
      { value: 'B3', weight: 1 },
    ],
  },
);
export const HIGH_FLEX_40 = scenario('HIGH_FLEX_40', 40, 'Most players accept a secondary pool.', {
  secondaryPoolProbability: 0.9,
  startingFlex: uniform(3, 6),
});
export const ZERO_FLEX_40 = scenario('ZERO_FLEX_40', 40, 'No secondary decks or starting Flex.', {
  secondaryPoolProbability: 0,
  startingFlex: constant(0),
});
export const HIGH_REQUEUE_40 = scenario('HIGH_REQUEUE_40', 40, 'Players commonly requeue.', {
  requeueProbability: 0.85,
  pauseProbability: 0.05,
  leaveProbability: 0.05,
});
export const LOW_REQUEUE_40 = scenario('LOW_REQUEUE_40', 40, 'Players rarely requeue.', {
  requeueProbability: 0.1,
  pauseProbability: 0.1,
  leaveProbability: 0.65,
});
export const LONG_GAMES_40 = scenario('LONG_GAMES_40', 40, 'Games have long durations.', {
  gameDurationSeconds: normal(75 * 60, 150 * 60, 105 * 60, 15 * 60),
});
export const SHORT_GAMES_40 = scenario('SHORT_GAMES_40', 40, 'Games have short durations.', {
  gameDurationSeconds: normal(15 * 60, 45 * 60, 28 * 60, 6 * 60),
});
export const PEOPLE_LEAVE_EARLY_40 = scenario(
  'PEOPLE_LEAVE_EARLY_40',
  40,
  'Waiting and post-game departures are common.',
  {
    requeueProbability: 0.25,
    pauseProbability: 0.05,
    leaveProbability: 0.55,
    leaveWhileWaitingProbability: 0.35,
    waitingDecisionDelaySeconds: uniform(8 * 60, 20 * 60),
  },
);
export const HIGH_PAUSE_RATE_40 = scenario('HIGH_PAUSE_RATE_40', 40, 'Players frequently pause.', {
  requeueProbability: 0.3,
  pauseProbability: 0.5,
  leaveProbability: 0.1,
  pauseWhileWaitingProbability: 0.3,
});
export const ODD_PLAYER_COUNTS = scenario('ODD_PLAYER_COUNTS', 31, 'An odd field stresses pod packing.', {
  tableCount: 8,
});
export const BROKEN_TABLE_MID_EVENT = scenario(
  'BROKEN_TABLE_MID_EVENT',
  40,
  'Tables become unavailable during play.',
  {
    tableCount: 9,
    tableBreaks: [
      { tableIndex: 1, at: 45 * 60, duration: 50 * 60 },
      { tableIndex: 4, at: 90 * 60, duration: 25 * 60 },
    ],
  },
);
export const SMALL_EVENT_8 = scenario('SMALL_EVENT_8', 8, 'Minimum practical two-pod event.', {
  tableCount: 2,
  arrivalSeconds: uniform(0, 10 * 60),
});
export const LARGE_EVENT_120 = scenario('LARGE_EVENT_120', 120, 'Large event performance workload.', {
  tableCount: 30,
});

export const SCENARIOS: readonly SimulationScenario[] = Object.freeze([
  NORMAL_FRIDAY_40,
  NORMAL_FRIDAY_20,
  NORMAL_FRIDAY_80,
  LATE_ARRIVALS_40,
  EARLY_ARRIVALS_40,
  TWO_ARRIVAL_WAVES_60,
  TABLE_SCARCITY_50,
  EXCESS_TABLE_CAPACITY_30,
  B3_DOMINATED_40,
  B4_STARVATION_30,
  EVEN_BRACKET_SPLIT_40,
  HIGH_FLEX_40,
  ZERO_FLEX_40,
  HIGH_REQUEUE_40,
  LOW_REQUEUE_40,
  LONG_GAMES_40,
  SHORT_GAMES_40,
  PEOPLE_LEAVE_EARLY_40,
  HIGH_PAUSE_RATE_40,
  ODD_PLAYER_COUNTS,
  BROKEN_TABLE_MID_EVENT,
  SMALL_EVENT_8,
  LARGE_EVENT_120,
]);

export const SCENARIO_BY_ID: ReadonlyMap<string, SimulationScenario> = new Map(
  SCENARIOS.map((entry) => [entry.id, entry]),
);

export function getScenario(id: string): SimulationScenario {
  const found = SCENARIO_BY_ID.get(id);
  if (!found) {
    throw new Error(`Unknown simulation scenario: ${id}.`);
  }
  return found;
}
