import { assertProbability, type SeededRandom } from './random.js';

export type IntegerDistribution =
  | Readonly<{ kind: 'constant'; value: number }>
  | Readonly<{ kind: 'uniform'; min: number; max: number }>
  | Readonly<{ kind: 'normal'; min: number; max: number; mean: number; deviation: number }>
  | Readonly<{
      kind: 'mixture';
      choices: readonly Readonly<{ weight: number; distribution: IntegerDistribution }>[];
    }>;

export type WeightedValue<T> = Readonly<{ value: T; weight: number }>;

export type TableBreak = Readonly<{
  tableIndex: number;
  at: number;
  duration: number;
}>;

export type SimulationScenario = Readonly<{
  id: string;
  description: string;
  playerCount: number;
  durationSeconds: number;
  tableCount: number;
  initiallyDisabledTables: number;
  preferredPodSize: number;
  allowedPodSizes: readonly number[];
  arrivalSeconds: IntegerDistribution;
  readyDelaySeconds: IntegerDistribution;
  poolWeights: readonly WeightedValue<string>[];
  secondaryPoolProbability: number;
  startingFlex: IntegerDistribution;
  gameDurationSeconds: IntegerDistribution;
  requeueProbability: number;
  requeueDelaySeconds: IntegerDistribution;
  pauseProbability: number;
  pauseDurationSeconds: IntegerDistribution;
  leaveProbability: number;
  leaveWhileWaitingProbability: number;
  pauseWhileWaitingProbability: number;
  waitingDecisionDelaySeconds: IntegerDistribution;
  tableBreaks: readonly TableBreak[];
}>;

export const constant = (value: number): IntegerDistribution => ({ kind: 'constant', value });
export const uniform = (min: number, max: number): IntegerDistribution => ({ kind: 'uniform', min, max });
export const normal = (
  min: number,
  max: number,
  mean: number,
  deviation: number,
): IntegerDistribution => ({ kind: 'normal', min, max, mean, deviation });
export const mixture = (
  choices: readonly Readonly<{ weight: number; distribution: IntegerDistribution }>[],
): IntegerDistribution => ({ kind: 'mixture', choices });

export function sampleDistribution(
  distribution: IntegerDistribution,
  random: SeededRandom,
): number {
  switch (distribution.kind) {
    case 'constant':
      return distribution.value;
    case 'uniform':
      return random.integer(distribution.min, distribution.max);
    case 'normal': {
      // Irwin-Hall approximation avoids implementation-dependent cached state.
      let standardized = 0;
      for (let index = 0; index < 12; index += 1) {
        standardized += random.next();
      }
      standardized -= 6;
      return clamp(
        Math.round(distribution.mean + standardized * distribution.deviation),
        distribution.min,
        distribution.max,
      );
    }
    case 'mixture': {
      const selected = distribution.choices[
        random.weightedIndex(distribution.choices.map((choice) => choice.weight))
      ];
      if (!selected) {
        throw new Error('Mixture selection failed.');
      }
      return sampleDistribution(selected.distribution, random);
    }
  }
}

export function sampleWeighted<T>(
  values: readonly WeightedValue<T>[],
  random: SeededRandom,
): T {
  const selected = values[random.weightedIndex(values.map((entry) => entry.weight))];
  if (!selected) {
    throw new Error('Weighted selection failed.');
  }
  return selected.value;
}

export function defineScenario(input: SimulationScenario): SimulationScenario {
  validateScenario(input);
  return deepFreezeScenario(input);
}

export function validateScenario(scenario: SimulationScenario): void {
  if (!/^[A-Z][A-Z0-9_]+$/.test(scenario.id)) {
    throw new Error(`Scenario id must be uppercase snake case: ${scenario.id}.`);
  }
  assertPositiveInteger(scenario.playerCount, 'playerCount');
  assertPositiveInteger(scenario.durationSeconds, 'durationSeconds');
  assertPositiveInteger(scenario.tableCount, 'tableCount');
  assertNonNegativeInteger(scenario.initiallyDisabledTables, 'initiallyDisabledTables');
  if (scenario.initiallyDisabledTables > scenario.tableCount) {
    throw new Error('initiallyDisabledTables cannot exceed tableCount.');
  }
  assertPositiveInteger(scenario.preferredPodSize, 'preferredPodSize');
  if (
    scenario.allowedPodSizes.length === 0 ||
    scenario.allowedPodSizes.some((size) => !Number.isSafeInteger(size) || size < 2) ||
    new Set(scenario.allowedPodSizes).size !== scenario.allowedPodSizes.length
  ) {
    throw new Error('allowedPodSizes must contain unique integers of at least two.');
  }
  if (!scenario.allowedPodSizes.includes(scenario.preferredPodSize)) {
    throw new Error('allowedPodSizes must include preferredPodSize.');
  }
  validateDistribution(scenario.arrivalSeconds, 'arrivalSeconds', 0);
  validateDistribution(scenario.readyDelaySeconds, 'readyDelaySeconds', 0);
  validateDistribution(scenario.startingFlex, 'startingFlex', 0);
  validateDistribution(scenario.gameDurationSeconds, 'gameDurationSeconds', 1);
  validateDistribution(scenario.requeueDelaySeconds, 'requeueDelaySeconds', 0);
  validateDistribution(scenario.pauseDurationSeconds, 'pauseDurationSeconds', 1);
  validateDistribution(scenario.waitingDecisionDelaySeconds, 'waitingDecisionDelaySeconds', 1);
  validateWeights(scenario.poolWeights, 'poolWeights');
  assertProbability(scenario.secondaryPoolProbability, 'secondaryPoolProbability');
  assertProbability(scenario.requeueProbability, 'requeueProbability');
  assertProbability(scenario.pauseProbability, 'pauseProbability');
  assertProbability(scenario.leaveProbability, 'leaveProbability');
  assertProbability(scenario.leaveWhileWaitingProbability, 'leaveWhileWaitingProbability');
  assertProbability(scenario.pauseWhileWaitingProbability, 'pauseWhileWaitingProbability');
  if (scenario.requeueProbability + scenario.pauseProbability + scenario.leaveProbability > 1) {
    throw new Error('Post-game decision probabilities cannot sum above one.');
  }
  if (scenario.leaveWhileWaitingProbability + scenario.pauseWhileWaitingProbability > 1) {
    throw new Error('Waiting decision probabilities cannot sum above one.');
  }
  for (const tableBreak of scenario.tableBreaks) {
    assertNonNegativeInteger(tableBreak.tableIndex, 'tableBreak.tableIndex');
    assertNonNegativeInteger(tableBreak.at, 'tableBreak.at');
    assertPositiveInteger(tableBreak.duration, 'tableBreak.duration');
    if (tableBreak.tableIndex >= scenario.tableCount || tableBreak.at >= scenario.durationSeconds) {
      throw new Error('Table break references an invalid table or starts after event close.');
    }
  }
}

export function validateDistribution(
  distribution: IntegerDistribution,
  name = 'distribution',
  minimum = Number.MIN_SAFE_INTEGER,
): void {
  if (distribution.kind === 'constant') {
    assertIntegerAtLeast(distribution.value, minimum, `${name}.value`);
    return;
  }
  if (distribution.kind === 'uniform') {
    assertIntegerAtLeast(distribution.min, minimum, `${name}.min`);
    assertIntegerAtLeast(distribution.max, distribution.min, `${name}.max`);
    return;
  }
  if (distribution.kind === 'normal') {
    assertIntegerAtLeast(distribution.min, minimum, `${name}.min`);
    assertIntegerAtLeast(distribution.max, distribution.min, `${name}.max`);
    if (
      !Number.isFinite(distribution.mean) ||
      distribution.mean < distribution.min ||
      distribution.mean > distribution.max ||
      !Number.isFinite(distribution.deviation) ||
      distribution.deviation <= 0
    ) {
      throw new Error(`${name} has an invalid normal mean or deviation.`);
    }
    return;
  }
  if (distribution.choices.length === 0) {
    throw new Error(`${name}.choices cannot be empty.`);
  }
  distribution.choices.forEach((choice, index) => {
    if (!Number.isFinite(choice.weight) || choice.weight <= 0) {
      throw new Error(`${name}.choices[${index}].weight must be positive.`);
    }
    validateDistribution(choice.distribution, `${name}.choices[${index}].distribution`, minimum);
  });
}

function validateWeights<T>(values: readonly WeightedValue<T>[], name: string): void {
  if (values.length === 0 || values.some((entry) => !Number.isFinite(entry.weight) || entry.weight <= 0)) {
    throw new Error(`${name} must be non-empty and contain positive finite weights.`);
  }
}

function assertPositiveInteger(value: number, name: string): void {
  assertIntegerAtLeast(value, 1, name);
}

function assertNonNegativeInteger(value: number, name: string): void {
  assertIntegerAtLeast(value, 0, name);
}

function assertIntegerAtLeast(value: number, minimum: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer of at least ${minimum}, received ${value}.`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function deepFreezeScenario(scenario: SimulationScenario): SimulationScenario {
  return Object.freeze({
    ...scenario,
    allowedPodSizes: Object.freeze([...scenario.allowedPodSizes]),
    poolWeights: Object.freeze(scenario.poolWeights.map((entry) => Object.freeze({ ...entry }))),
    tableBreaks: Object.freeze(scenario.tableBreaks.map((entry) => Object.freeze({ ...entry }))),
  });
}
