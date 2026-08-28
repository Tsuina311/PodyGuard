import {
  createMatchesWithForcedPools,
  type AvailableTable,
  type MatchHistory,
  type MatchOptions,
  type ReadyParticipant,
} from '@podyguard/matching';

import {
  createFrozenQueueV2GraceStrategy,
  type MatchmakingInput,
  type MatchmakingParticipant,
  type MatchmakingResult,
  type MatchmakingStrategy,
} from './strategy.js';

export type WeightedMatchingConfig = {
  seatingWeight: number;
  waitingWeight: number;
  exclusiveWeight: number;
  scarcityWeight: number;
  preferenceWeight: number;
  waitUrgencyCurve?: readonly WaitUrgencyPoint[];
};

export type WeightedGeneratorMode = 'single' | 'pairwise';

export type WeightedCandidateGeneratorConfig = {
  mode: WeightedGeneratorMode;
  maxCandidatePlansPerDecision: number;
  recordControlOnlyDecisions?: boolean;
};

export const DEFAULT_WEIGHTED_GENERATOR_CONFIG: WeightedCandidateGeneratorConfig =
  {
    mode: 'single',
    maxCandidatePlansPerDecision: 128,
  };

export type WaitUrgencyPoint = {
  waitSeconds: number;
  urgency: number;
};

export type WeightedScoreComponents = {
  immediateSeating: number;
  waitingUrgency: number;
  exclusiveUnlock: number;
  scarcity: number;
  preference: number;
};

export type WeightedForcedAssignment = {
  participantId: string;
  poolId: string;
  controlPoolId?: string;
};

export type ResidualPoolState = {
  poolId: string;
  compatibleReadyCount: number;
  exclusiveReadyCount: number;
  oldestRemainingWaitSeconds: number;
  oldestExclusiveWaitSeconds: number;
  cannotFormMinimumPod: boolean;
  exactlyOneShortOfMinimumPod: boolean;
};

export type ResidualPoolDiagnostics = {
  unmatchedReadyCount: number;
  exclusiveParticipantsRemaining: number;
  multiPoolParticipantsRemaining: number;
  multiPoolConnectorsRemaining: number;
  pools: readonly ResidualPoolState[];
};

export type WeightedPlanMatch = {
  tableId: string;
  poolId: string;
  participantIds: readonly string[];
};

export type WeightedCandidateExplanation = {
  key: string;
  source: 'control' | 'single' | 'pair';
  forcedParticipantId?: string;
  forcedPoolId?: string;
  controlPoolId?: string;
  forcedAssignments: readonly WeightedForcedAssignment[];
  plan: readonly WeightedPlanMatch[];
  residual: ResidualPoolDiagnostics;
  seats: number;
  immediateSeatDelta: number;
  unlockedExclusiveParticipantIds: readonly string[];
  secondaryPoolReallocation: boolean;
  components: WeightedScoreComponents;
  weights: Omit<WeightedMatchingConfig, 'waitUrgencyCurve'>;
  weightedTotal: number;
  selected: boolean;
};

export type WeightedDecisionDiagnostic = {
  at: number;
  profileId: string;
  changedFromControl: boolean;
  controlSeats: number;
  selectedSeats: number;
  immediateSeatDelta: number;
  selectedCandidateKey: string;
  secondaryPoolReallocation: boolean;
  exclusiveParticipantsUnlocked: number;
  scoreMargin: number;
  generator: WeightedGeneratorDiagnostic;
  singleGeneratorSelectedCandidateKey: string;
  changedFromSingleGenerator: boolean;
  selectedRequiresTwoForces: boolean;
  immediateSeatDeltaVsSingleGenerator: number;
  candidates: readonly WeightedCandidateExplanation[];
};

export type WeightedGeneratorDiagnostic = {
  mode: WeightedGeneratorMode;
  readyParticipants: number;
  readyMultiPoolParticipants: number;
  singleForceAssignments: number;
  pairForceAssignments: number;
  singleCandidatesGenerated: number;
  pairCandidatesGenerated: number;
  uniqueCandidatesAfterDeduplication: number;
  matcherEvaluations: number;
  candidatePlanCeiling: number;
  ceilingReached: boolean;
  truncatedSingleAssignments: number;
  truncatedPairAssignments: number;
};

export type WeightedProfile = {
  id:
    | 'throughput-heavy'
    | 'balanced'
    | 'fairness-heavy'
    | 'preference-heavy'
    | 'starvation-heavy';
  label: string;
  config: WeightedMatchingConfig;
};

export const DEFAULT_WAIT_URGENCY_CURVE: readonly WaitUrgencyPoint[] = [
  { waitSeconds: 0, urgency: 0 },
  { waitSeconds: 300, urgency: 0.1 },
  { waitSeconds: 600, urgency: 0.25 },
  { waitSeconds: 1_200, urgency: 0.5 },
  { waitSeconds: 1_800, urgency: 0.75 },
  { waitSeconds: 3_600, urgency: 1 },
];

export const WEIGHTED_PROFILES: readonly WeightedProfile[] = [
  {
    id: 'throughput-heavy',
    label: 'THROUGHPUT_HEAVY',
    config: {
      seatingWeight: 2,
      waitingWeight: 0.5,
      exclusiveWeight: 0.5,
      scarcityWeight: 0.5,
      preferenceWeight: 1,
    },
  },
  {
    id: 'balanced',
    label: 'BALANCED',
    config: {
      seatingWeight: 1.5,
      waitingWeight: 1,
      exclusiveWeight: 1,
      scarcityWeight: 1,
      preferenceWeight: 0.75,
    },
  },
  {
    id: 'fairness-heavy',
    label: 'FAIRNESS_HEAVY',
    config: {
      seatingWeight: 1,
      waitingWeight: 1.5,
      exclusiveWeight: 1.5,
      scarcityWeight: 1.5,
      preferenceWeight: 0.5,
    },
  },
  {
    id: 'preference-heavy',
    label: 'PREFERENCE_HEAVY',
    config: {
      seatingWeight: 1.5,
      waitingWeight: 0.75,
      exclusiveWeight: 0.75,
      scarcityWeight: 0.75,
      preferenceWeight: 1.5,
    },
  },
  {
    id: 'starvation-heavy',
    label: 'STARVATION_HEAVY',
    config: {
      seatingWeight: 1,
      waitingWeight: 2,
      exclusiveWeight: 2,
      scarcityWeight: 1.5,
      preferenceWeight: 0.25,
    },
  },
];

export class QueueV2WeightedAssignmentStrategy
  implements MatchmakingStrategy
{
  readonly id: string;
  readonly name = 'queue-v2-weighted-assignment-experimental' as const;

  constructor(
    readonly profileId: string,
    readonly config: WeightedMatchingConfig,
    readonly generatorConfig: WeightedCandidateGeneratorConfig =
      DEFAULT_WEIGHTED_GENERATOR_CONFIG,
    private readonly frozenGrace: MatchmakingStrategy =
      createFrozenQueueV2GraceStrategy(),
  ) {
    validateWeightedConfig(config);
    validateGeneratorConfig(generatorConfig);
    this.id =
      generatorConfig.mode === 'single'
        ? `queue-v2-weighted-assignment-${profileId}`
        : `queue-v2-weighted-assignment-${profileId}-pairwise`;
  }

  match(input: MatchmakingInput): MatchmakingResult {
    const control = this.frozenGrace.match(input);
    const controlSeats = countSeated(control);
    if (controlSeats === 0 || input.tables.length === 0) return control;

    const controlSeatByParticipant = new Map(
      control.matches.flatMap((match) =>
        match.seats.map((seat) => [seat.participantId, seat] as const),
      ),
    );
    const rawCandidates: Candidate[] = [
      {
        key: 'control',
        source: 'control',
        result: control,
        forcedAssignments: [],
      },
    ];
    const signatures = new Set([resultSignature(control)]);
    let matcherEvaluations = 1;
    let singleForceAssignments = 0;
    let singleCandidatesGenerated = 0;
    let ceilingReached = false;
    let truncatedSingleAssignments = 0;

    for (const participant of [...input.participants].sort(participantOrder)) {
      const controlSeat = controlSeatByParticipant.get(participant.id);
      const pools = participantPools(participant).sort();
      if (!controlSeat || pools.length < 2) continue;
      for (const poolId of pools.filter(
        (candidatePool) => candidatePool !== controlSeat.poolId,
      )) {
        singleForceAssignments += 1;
        if (
          rawCandidates.length >=
          this.generatorConfig.maxCandidatePlansPerDecision
        ) {
          ceilingReached = true;
          truncatedSingleAssignments += 1;
          continue;
        }
        matcherEvaluations += 1;
        const forcedAssignments: WeightedForcedAssignment[] = [
          {
            participantId: participant.id,
            poolId,
            controlPoolId: controlSeat.poolId,
          },
        ];
        const forcedResult = matchForcedPools(input, forcedAssignments);
        const seats = countSeated(forcedResult);
        if (seats < controlSeats - 1) continue;
        if (!forcedAssignmentsAreSeated(forcedResult, forcedAssignments))
          continue;
        const signature = resultSignature(forcedResult);
        if (signatures.has(signature)) continue;
        signatures.add(signature);
        singleCandidatesGenerated += 1;
        rawCandidates.push({
          key: `${participant.id}->${poolId}`,
          source: 'single',
          result: forcedResult,
          forcedAssignments,
        });
      }
    }

    const pairSpecs =
      this.generatorConfig.mode === 'pairwise'
        ? pairwiseAssignmentSpecs(input, controlSeatByParticipant)
        : [];
    let pairCandidatesGenerated = 0;
    let evaluatedPairSpecs = 0;
    for (const forcedAssignments of pairSpecs) {
      if (
        rawCandidates.length >=
        this.generatorConfig.maxCandidatePlansPerDecision
      ) {
        ceilingReached = true;
        break;
      }
      evaluatedPairSpecs += 1;
      matcherEvaluations += 1;
      const forcedResult = matchForcedPools(input, forcedAssignments);
      if (countSeated(forcedResult) < controlSeats - 1) continue;
      const signature = resultSignature(forcedResult);
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      pairCandidatesGenerated += 1;
      rawCandidates.push({
        key: forcedAssignments
          .map(
            (assignment) =>
              `${assignment.participantId}->${assignment.poolId}`,
          )
          .join('|'),
        source: 'pair',
        result: forcedResult,
        forcedAssignments,
      });
    }

    const generator: WeightedGeneratorDiagnostic = {
      mode: this.generatorConfig.mode,
      readyParticipants: input.participants.length,
      readyMultiPoolParticipants: input.participants.filter(
        (participant) => participantPools(participant).length > 1,
      ).length,
      singleForceAssignments,
      pairForceAssignments: pairSpecs.length,
      singleCandidatesGenerated,
      pairCandidatesGenerated,
      uniqueCandidatesAfterDeduplication: rawCandidates.length,
      matcherEvaluations,
      candidatePlanCeiling:
        this.generatorConfig.maxCandidatePlansPerDecision,
      ceilingReached,
      truncatedSingleAssignments,
      truncatedPairAssignments: Math.max(
        0,
        pairSpecs.length - evaluatedPairSpecs,
      ),
    };
    if (
      rawCandidates.length === 1 &&
      this.generatorConfig.mode === 'single' &&
      !this.generatorConfig.recordControlOnlyDecisions
    ) {
      return control;
    }
    const scored = scoreCandidates(
      input,
      control,
      rawCandidates,
      this.config,
    );
    const singleCandidates = rawCandidates.filter(
      (candidate) => candidate.source !== 'pair',
    );
    const singleSelected = scoreCandidates(
      input,
      control,
      singleCandidates,
      this.config,
    )[0]!;
    const selected = scored[0]!;
    const runnerUp = scored[1];
    const changedFromControl = selected.candidate.key !== 'control';
    const explanations = scored.map((entry) => ({
      ...entry.explanation,
      selected: entry === selected,
    }));
    return {
      ...selected.candidate.result,
      weightedDecision: {
        at: input.now,
        profileId: this.profileId,
        changedFromControl,
        controlSeats,
        selectedSeats: selected.explanation.seats,
        immediateSeatDelta:
          selected.explanation.seats - controlSeats,
        selectedCandidateKey: selected.candidate.key,
        secondaryPoolReallocation:
          selected.explanation.secondaryPoolReallocation,
        exclusiveParticipantsUnlocked:
          selected.explanation.unlockedExclusiveParticipantIds.length,
        scoreMargin:
          selected.explanation.weightedTotal -
          (runnerUp?.explanation.weightedTotal ??
            selected.explanation.weightedTotal),
        generator,
        singleGeneratorSelectedCandidateKey:
          singleSelected.candidate.key,
        changedFromSingleGenerator:
          selected.candidate.key !== singleSelected.candidate.key,
        selectedRequiresTwoForces:
          selected.candidate.source === 'pair',
        immediateSeatDeltaVsSingleGenerator:
          selected.explanation.seats -
          singleSelected.explanation.seats,
        candidates: explanations,
      },
    };
  }
}

export function createWeightedStrategy(
  profile: WeightedProfile,
  generatorConfig: WeightedCandidateGeneratorConfig =
    DEFAULT_WEIGHTED_GENERATOR_CONFIG,
): MatchmakingStrategy {
  return new QueueV2WeightedAssignmentStrategy(
    profile.id,
    profile.config,
    generatorConfig,
  );
}

export function waitUrgency(
  waitSeconds: number,
  curve: readonly WaitUrgencyPoint[] = DEFAULT_WAIT_URGENCY_CURVE,
): number {
  validateWaitUrgencyCurve(curve);
  const boundedWait = Math.max(0, waitSeconds);
  const first = curve[0]!;
  if (boundedWait <= first.waitSeconds) return first.urgency;
  for (let index = 1; index < curve.length; index += 1) {
    const right = curve[index]!;
    const left = curve[index - 1]!;
    if (boundedWait <= right.waitSeconds) {
      const position =
        (boundedWait - left.waitSeconds) /
        (right.waitSeconds - left.waitSeconds);
      return left.urgency + position * (right.urgency - left.urgency);
    }
  }
  return curve[curve.length - 1]!.urgency;
}

export function scarcityForAssignment(
  compatibleWithoutParticipant: number,
  allowedSizes: readonly number[],
): number {
  const canFormWithout = canFormLegalPod(
    compatibleWithoutParticipant,
    allowedSizes,
  );
  const canFormWith = canFormLegalPod(
    compatibleWithoutParticipant + 1,
    allowedSizes,
  );
  if (!canFormWithout && canFormWith) return 1;
  return 1 / (1 + compatibleWithoutParticipant);
}

export function seatingComponent(
  seats: number,
  maximumSeats: number,
): number {
  return maximumSeats === 0 ? 0 : seats / maximumSeats;
}

export function exclusiveUnlockComponent(
  unlockedExclusiveCount: number,
  targetPodSize: number,
): number {
  return targetPodSize === 0
    ? 0
    : Math.min(1, unlockedExclusiveCount / targetPodSize);
}

export function preferenceComponent(
  preferredSeats: number,
  seats: number,
): number {
  return seats === 0 ? 0 : preferredSeats / seats;
}

export function weightedTotal(
  components: WeightedScoreComponents,
  config: WeightedMatchingConfig,
): number {
  validateWeightedConfig(config);
  const weightSum =
    config.seatingWeight +
    config.waitingWeight +
    config.exclusiveWeight +
    config.scarcityWeight +
    config.preferenceWeight;
  return (
    (components.immediateSeating * config.seatingWeight +
      components.waitingUrgency * config.waitingWeight +
      components.exclusiveUnlock * config.exclusiveWeight +
      components.scarcity * config.scarcityWeight +
      components.preference * config.preferenceWeight) /
    weightSum
  );
}

type Candidate = {
  key: string;
  source: 'control' | 'single' | 'pair';
  result: MatchmakingResult;
  forcedAssignments: readonly WeightedForcedAssignment[];
};

type ScoredCandidate = {
  candidate: Candidate;
  explanation: WeightedCandidateExplanation;
};

function scoreCandidates(
  input: MatchmakingInput,
  control: MatchmakingResult,
  candidates: readonly Candidate[],
  config: WeightedMatchingConfig,
): ScoredCandidate[] {
  const maxSeats = Math.max(
    ...candidates.map((candidate) => countSeated(candidate.result)),
  );
  return candidates
    .map((candidate) =>
      scoreCandidate(input, control, candidate, maxSeats, config),
    )
    .sort(compareScoredCandidates);
}

function scoreCandidate(
  input: MatchmakingInput,
  control: MatchmakingResult,
  candidate: Candidate,
  maxSeats: number,
  config: WeightedMatchingConfig,
): ScoredCandidate {
  const seats = candidate.result.matches.flatMap((match) => match.seats);
  const participantById = new Map(
    input.participants.map((participant) => [participant.id, participant]),
  );
  const controlSeated = new Set(
    control.matches.flatMap((match) =>
      match.seats.map((seat) => seat.participantId),
    ),
  );
  const curve = config.waitUrgencyCurve ?? DEFAULT_WAIT_URGENCY_CURVE;
  const waitingUrgency =
    seats.length === 0
      ? 0
      : seats.reduce((sum, seat) => {
          const participant = participantById.get(seat.participantId);
          return (
            sum +
            waitUrgency(
              participant ? input.now - participant.readyAt : 0,
              curve,
            )
          );
        }, 0) / seats.length;
  const preferredSeats = seats.filter((seat) => {
    const participant = participantById.get(seat.participantId);
    return (
      participant !== undefined &&
      preferredPool(participant) === seat.poolId
    );
  }).length;
  const multiPoolScarcity = seats.flatMap((seat) => {
    const participant = participantById.get(seat.participantId);
    if (!participant || participantPools(participant).length < 2) return [];
    const substitutes = input.participants.filter(
      (entry) =>
        entry.id !== participant.id &&
        participantPools(entry).includes(seat.poolId),
    ).length;
    return [
      scarcityForAssignment(substitutes, input.settings.allowedSizes),
    ];
  });
  const scarcity =
    multiPoolScarcity.length === 0
      ? 0
      : multiPoolScarcity.reduce((sum, value) => sum + value, 0) /
        multiPoolScarcity.length;

  const unlockedExclusiveParticipantIds: string[] = [];
  const unlockedExclusiveIds = new Set<string>();
  const targetMatchKeys = new Set<string>();
  let targetPodSize = 0;
  for (const assignment of candidate.forcedAssignments) {
    const targetMatch = candidate.result.matches.find(
      (match) =>
        match.poolId === assignment.poolId &&
        match.seats.some(
          (seat) => seat.participantId === assignment.participantId,
        ),
    );
    if (!targetMatch) continue;
    const targetMatchKey = `${targetMatch.tableId}:${targetMatch.poolId}`;
    if (!targetMatchKeys.has(targetMatchKey)) {
      targetMatchKeys.add(targetMatchKey);
      targetPodSize += targetMatch.seats.length;
    }
    for (const participantId of targetMatch.seats
      .map((seat) => seat.participantId)
      .filter((participantId) => {
        const participant = participantById.get(participantId);
        return (
          participant !== undefined &&
          participantPools(participant).length === 1 &&
          !controlSeated.has(participantId)
        );
      })) {
      if (!unlockedExclusiveIds.has(participantId)) {
        unlockedExclusiveIds.add(participantId);
        unlockedExclusiveParticipantIds.push(participantId);
      }
    }
  }
  const components: WeightedScoreComponents = {
    immediateSeating: seatingComponent(seats.length, maxSeats),
    waitingUrgency,
    exclusiveUnlock: exclusiveUnlockComponent(
      unlockedExclusiveParticipantIds.length,
      targetPodSize,
    ),
    scarcity,
    preference: preferenceComponent(preferredSeats, seats.length),
  };
  const singleAssignment =
    candidate.forcedAssignments.length === 1
      ? candidate.forcedAssignments[0]
      : undefined;
  return {
    candidate,
    explanation: {
      key: candidate.key,
      source: candidate.source,
      ...(singleAssignment
        ? { forcedParticipantId: singleAssignment.participantId }
        : {}),
      ...(singleAssignment
        ? { forcedPoolId: singleAssignment.poolId }
        : {}),
      ...(singleAssignment?.controlPoolId
        ? { controlPoolId: singleAssignment.controlPoolId }
        : {}),
      forcedAssignments: candidate.forcedAssignments,
      plan: candidate.result.matches.map((match) => ({
        tableId: match.tableId,
        poolId: match.poolId,
        participantIds: match.seats
          .map((seat) => seat.participantId)
          .sort(),
      })),
      residual: residualPoolDiagnostics(input, candidate.result),
      seats: seats.length,
      immediateSeatDelta: seats.length - countSeated(control),
      unlockedExclusiveParticipantIds,
      secondaryPoolReallocation:
        candidate.forcedAssignments.some((assignment) => {
          const participant = participantById.get(
            assignment.participantId,
          );
          return (
            participant !== undefined &&
            assignment.poolId !== preferredPool(participant)
          );
        }),
      components,
      weights: {
        seatingWeight: config.seatingWeight,
        waitingWeight: config.waitingWeight,
        exclusiveWeight: config.exclusiveWeight,
        scarcityWeight: config.scarcityWeight,
        preferenceWeight: config.preferenceWeight,
      },
      weightedTotal: weightedTotal(components, config),
      selected: false,
    },
  };
}

function compareScoredCandidates(
  left: ScoredCandidate,
  right: ScoredCandidate,
): number {
  if (
    left.explanation.weightedTotal !== right.explanation.weightedTotal
  ) {
    return (
      right.explanation.weightedTotal -
      left.explanation.weightedTotal
    );
  }
  if (left.explanation.seats !== right.explanation.seats) {
    return right.explanation.seats - left.explanation.seats;
  }
  if (
    left.explanation.components.preference !==
    right.explanation.components.preference
  ) {
    return (
      right.explanation.components.preference -
      left.explanation.components.preference
    );
  }
  return left.candidate.key.localeCompare(right.candidate.key);
}

function matchForcedPools(
  input: MatchmakingInput,
  forcedAssignments: readonly WeightedForcedAssignment[],
): MatchmakingResult {
  const participants: ReadyParticipant[] = input.participants.map(
    (participant) => ({
      id: participant.id,
      readyAt: participant.readyAt,
      decks: participant.decks.map((deck) => ({
        id: deck.id,
        poolId: deck.poolId,
        preference: deck.preference,
      })),
      flexCredits: participant.flexCredits,
    }),
  );
  const tables: AvailableTable[] = input.tables.map((table) => ({
    id: table.id,
  }));
  const history: MatchHistory = {
    groups: input.priorGroups.map((group) => [...group]),
  };
  const options: MatchOptions = {
    preferredSize: input.settings.preferredSize,
    allowedSizes: [...input.settings.allowedSizes],
  };
  const forcedLegacy: MatchmakingStrategy = {
    id: `legacy-v1-force-${forcedAssignments
      .map(
        (assignment) =>
          `${assignment.participantId}-${assignment.poolId}`,
      )
      .join('-')}`,
    match: () =>
      createMatchesWithForcedPools(
        participants,
        tables,
        history,
        options,
        new Map(
          forcedAssignments.map((assignment) => [
            assignment.participantId,
            assignment.poolId,
          ]),
        ),
      ),
  };
  return createFrozenQueueV2GraceStrategy(forcedLegacy).match(input);
}

function forcedAssignmentsAreSeated(
  result: MatchmakingResult,
  assignments: readonly WeightedForcedAssignment[],
): boolean {
  return assignments.every((assignment) =>
    result.matches.some(
      (match) =>
        match.poolId === assignment.poolId &&
        match.seats.some(
          (seat) => seat.participantId === assignment.participantId,
        ),
    ),
  );
}

function pairwiseAssignmentSpecs(
  input: MatchmakingInput,
  controlSeatByParticipant: ReadonlyMap<
    string,
    { readonly poolId: string }
  >,
): WeightedForcedAssignment[][] {
  const participants = [...input.participants]
    .filter((participant) => participantPools(participant).length > 1)
    .sort(participantOrder);
  const specs: WeightedForcedAssignment[][] = [];
  const keys = new Set<string>();
  for (let leftIndex = 0; leftIndex < participants.length; leftIndex += 1) {
    const left = participants[leftIndex]!;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < participants.length;
      rightIndex += 1
    ) {
      const right = participants[rightIndex]!;
      for (const leftPoolId of participantPools(left).sort()) {
        for (const rightPoolId of participantPools(right).sort()) {
          const leftControl = controlSeatByParticipant.get(left.id)?.poolId;
          const rightControl =
            controlSeatByParticipant.get(right.id)?.poolId;
          if (
            leftControl === leftPoolId &&
            rightControl === rightPoolId
          ) {
            continue;
          }
          const assignments: WeightedForcedAssignment[] = [
            {
              participantId: left.id,
              poolId: leftPoolId,
              ...(leftControl ? { controlPoolId: leftControl } : {}),
            },
            {
              participantId: right.id,
              poolId: rightPoolId,
              ...(rightControl ? { controlPoolId: rightControl } : {}),
            },
          ];
          const key = assignments
            .map(
              (assignment) =>
                `${assignment.participantId}->${assignment.poolId}`,
            )
            .join('|');
          if (keys.has(key)) continue;
          keys.add(key);
          specs.push(assignments);
        }
      }
    }
  }
  return specs;
}

export function residualPoolDiagnostics(
  input: MatchmakingInput,
  result: MatchmakingResult,
): ResidualPoolDiagnostics {
  const participantById = new Map(
    input.participants.map((participant) => [participant.id, participant]),
  );
  const remaining = result.unmatchedIds
    .map((participantId) => participantById.get(participantId))
    .filter(
      (participant): participant is MatchmakingParticipant =>
        participant !== undefined,
    );
  const poolIds = [
    ...new Set(
      input.participants.flatMap((participant) =>
        participantPools(participant),
      ),
    ),
  ].sort();
  const minimumPodSize = Math.min(...input.settings.allowedSizes);
  return {
    unmatchedReadyCount: remaining.length,
    exclusiveParticipantsRemaining: remaining.filter(
      (participant) => participantPools(participant).length === 1,
    ).length,
    multiPoolParticipantsRemaining: remaining.filter(
      (participant) => participantPools(participant).length > 1,
    ).length,
    multiPoolConnectorsRemaining: remaining.filter(
      (participant) => participantPools(participant).length > 1,
    ).length,
    pools: poolIds.map((poolId) => {
      const compatible = remaining.filter((participant) =>
        participantPools(participant).includes(poolId),
      );
      return {
        poolId,
        compatibleReadyCount: compatible.length,
        exclusiveReadyCount: compatible.filter(
          (participant) => participantPools(participant).length === 1,
        ).length,
        oldestRemainingWaitSeconds:
          compatible.length === 0
            ? 0
            : Math.max(
                ...compatible.map(
                  (participant) => input.now - participant.readyAt,
                ),
              ),
        oldestExclusiveWaitSeconds: (() => {
          const exclusive = compatible.filter(
            (participant) => participantPools(participant).length === 1,
          );
          return exclusive.length === 0
            ? 0
            : Math.max(
                ...exclusive.map(
                  (participant) => input.now - participant.readyAt,
                ),
              );
        })(),
        cannotFormMinimumPod: compatible.length < minimumPodSize,
        exactlyOneShortOfMinimumPod:
          compatible.length === minimumPodSize - 1,
      };
    }),
  };
}

function validateWeightedConfig(config: WeightedMatchingConfig): void {
  const weights = [
    config.seatingWeight,
    config.waitingWeight,
    config.exclusiveWeight,
    config.scarcityWeight,
    config.preferenceWeight,
  ];
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new Error('Weighted matching weights must be finite and non-negative.');
  }
  if (weights.every((weight) => weight === 0)) {
    throw new Error('Weighted matching requires at least one positive weight.');
  }
  validateWaitUrgencyCurve(
    config.waitUrgencyCurve ?? DEFAULT_WAIT_URGENCY_CURVE,
  );
}

function validateGeneratorConfig(
  config: WeightedCandidateGeneratorConfig,
): void {
  if (
    !['single', 'pairwise'].includes(config.mode) ||
    !Number.isInteger(config.maxCandidatePlansPerDecision) ||
    config.maxCandidatePlansPerDecision < 2
  ) {
    throw new Error(
      'Weighted candidate generation requires mode single/pairwise and a plan ceiling of at least 2.',
    );
  }
}

function validateWaitUrgencyCurve(
  curve: readonly WaitUrgencyPoint[],
): void {
  if (curve.length < 2) {
    throw new Error('Wait urgency curve requires at least two points.');
  }
  for (let index = 0; index < curve.length; index += 1) {
    const point = curve[index]!;
    const previous = curve[index - 1];
    if (
      !Number.isFinite(point.waitSeconds) ||
      point.waitSeconds < 0 ||
      !Number.isFinite(point.urgency) ||
      point.urgency < 0 ||
      point.urgency > 1 ||
      (previous !== undefined &&
        (point.waitSeconds <= previous.waitSeconds ||
          point.urgency < previous.urgency))
    ) {
      throw new Error(
        'Wait urgency curve must have increasing non-negative seconds and non-decreasing urgency in [0,1].',
      );
    }
  }
}

function countSeated(result: MatchmakingResult): number {
  return result.matches.reduce((sum, match) => sum + match.seats.length, 0);
}

function canFormLegalPod(
  compatibleCount: number,
  allowedSizes: readonly number[],
): boolean {
  return allowedSizes.some((size) => size <= compatibleCount);
}

function participantPools(participant: MatchmakingParticipant): string[] {
  return [...new Set(participant.decks.map((deck) => deck.poolId))];
}

function preferredPool(participant: MatchmakingParticipant): string {
  return (
    participant.decks.find((deck) => deck.preference === 'preferred')?.poolId ??
    participant.decks[0]?.poolId ??
    'open'
  );
}

function participantOrder(
  left: MatchmakingParticipant,
  right: MatchmakingParticipant,
): number {
  return left.readyAt - right.readyAt || left.id.localeCompare(right.id);
}

function resultSignature(result: MatchmakingResult): string {
  return JSON.stringify(
    result.matches
      .map((match) => ({
        tableId: match.tableId,
        poolId: match.poolId,
        ids: match.seats.map((seat) => seat.participantId).sort(),
      }))
      .sort(
        (left, right) =>
          left.tableId.localeCompare(right.tableId) ||
          left.poolId.localeCompare(right.poolId),
      ),
  );
}
