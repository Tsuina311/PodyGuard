import { StableEventQueue } from './event-queue.js';
import {
  calculateEventMetrics,
  type EventMetricRecord,
  type EventMetrics,
  type MetricGame,
  type MetricGameSeat,
  type MetricParticipant,
  type MetricQueueCycle,
  type MetricScarcityDiagnostic,
  type MetricWeightedDecision,
  type MetricTablePeriod,
  type QueueCycleEndReason,
  type SafetyViolation,
  type WaitDiagnostic,
} from './metrics.js';
import { createSeededRandom, type SeededRandom } from './random.js';
import {
  sampleDistribution,
  sampleWeighted,
  validateScenario,
  type SimulationScenario,
} from './scenario.js';
import { SCENARIO_SUITE_VERSION } from './scenarios.js';
import {
  legacyV1Strategy,
  type MatchmakingMatch,
  type MatchmakingStrategy,
  type StrategyDeck,
} from './strategy.js';
import {
  waitCauseAccountingHolds,
  WaitCauseAccumulator,
  type WaitCausePlayingParticipant,
  type WaitCauseSettings,
} from './wait-cause.js';

type ParticipantStatus = 'joined' | 'ready' | 'playing' | 'paused' | 'left';
type TableState = 'free' | 'occupied' | 'disabled';

type ParticipantState = {
  id: string;
  arrivedAt: number;
  status: ParticipantStatus;
  decks: StrategyDeck[];
  preferredPoolId: string;
  flexCredits: number;
  readyAt?: number;
  cycleCount: number;
  openCycle?: { cycle: number; startedAt: number };
  gamesPlayed: number;
};

type TableStateRecord = {
  id: string;
  state: TableState;
  stateStartedAt: number;
  disabledUntil: number;
  gamesStarted: number;
};

type ActiveGame = {
  metric: MetricGame;
  participantIds: string[];
};

type EngineEvent =
  | { type: 'arrival'; participantId: string }
  | { type: 'ready'; participantId: string }
  | { type: 'match' }
  | { type: 'match-evaluation'; at: number }
  | { type: 'game-finish'; gameId: string }
  | { type: 'resume'; participantId: string }
  | { type: 'leave-if-waiting'; participantId: string; cycle: number }
  | { type: 'pause-if-waiting'; participantId: string; cycle: number }
  | { type: 'table-disable'; tableId: string; until: number }
  | { type: 'table-enable'; tableId: string };

export type DebugTimelineEntry = {
  at: number;
  event: string;
  detail: string;
};

export type ReproducibilityMetadata = {
  scenarioId: string;
  scenarioSuiteVersion: string;
  seed: number;
  strategyId: string;
  strategyName: string;
  graceSeconds: number;
  maxExistingWaitSeconds?: number;
  randomizationMode: SimulationRandomizationMode;
  engineVersion: string;
  replay: string;
};

export type SimulationRandomizationMode = 'legacy' | 'paired-v1';

export type SimulationOptions = {
  seed: number;
  strategy?: MatchmakingStrategy;
  randomizationMode?: SimulationRandomizationMode;
  debug?: boolean;
  failOnSafetyViolation?: boolean;
  suiteVersion?: string;
};

export type SimulationResult = {
  metadata: ReproducibilityMetadata;
  record: EventMetricRecord;
  metrics: EventMetrics;
  timeline?: readonly DebugTimelineEntry[];
};

export const SIMULATION_ENGINE_VERSION = '1';

export class SimulationInvariantError extends Error {
  constructor(
    message: string,
    readonly scenarioId: string,
    readonly seed: number,
    readonly violations: readonly SafetyViolation[],
  ) {
    super(`${message} [scenario=${scenarioId}, seed=${seed}]`);
    this.name = 'SimulationInvariantError';
  }
}

export function runSimulation(
  scenario: SimulationScenario,
  options: SimulationOptions,
): SimulationResult {
  validateScenario(scenario);
  if (!Number.isSafeInteger(options.seed)) {
    throw new Error(`Simulation seed must be a safe integer, received ${options.seed}.`);
  }
  return new SimulationEngine(scenario, options).run();
}

export const simulateEvent = runSimulation;
export const simulateScenario = runSimulation;

class SimulationEngine {
  private readonly strategy: MatchmakingStrategy;
  private readonly random: SeededRandom;
  private readonly queue = new StableEventQueue<EngineEvent>();
  private readonly participants = new Map<string, ParticipantState>();
  private readonly tables = new Map<string, TableStateRecord>();
  private readonly activeGames = new Map<string, ActiveGame>();
  private readonly completedGames: MetricGame[] = [];
  private readonly scarcityDiagnostics: MetricScarcityDiagnostic[] = [];
  private readonly weightedDecisions: MetricWeightedDecision[] = [];
  private readonly priorGroups: string[][] = [];
  private readonly queueCycles: MetricQueueCycle[] = [];
  private readonly tablePeriods: MetricTablePeriod[] = [];
  private readonly violations: SafetyViolation[] = [];
  private readonly timeline: DebugTimelineEntry[] = [];
  private readonly waitCauses: WaitCauseAccumulator;
  private now = 0;
  private gameSequence = 0;
  private scheduledEvaluationAt: number | undefined;

  constructor(
    private readonly scenario: SimulationScenario,
    private readonly options: SimulationOptions,
  ) {
    this.strategy = options.strategy ?? legacyV1Strategy;
    if (options.randomizationMode !== undefined &&
        options.randomizationMode !== 'legacy' &&
        options.randomizationMode !== 'paired-v1') {
      throw new Error(`Unknown simulation randomization mode "${String(options.randomizationMode)}".`);
    }
    this.random = createSeededRandom(options.seed);
    this.waitCauses = new WaitCauseAccumulator(options.debug === true);
    this.initialize();
  }

  run(): SimulationResult {
    while (!this.queue.isEmpty) {
      const scheduled = this.queue.pop();
      if (!scheduled || scheduled.time >= this.scenario.durationSeconds) {
        break;
      }
      if (scheduled.time < this.now) {
        this.fail('TIME_REVERSED', `Event at ${scheduled.time} followed time ${this.now}.`);
      }
      this.now = scheduled.time;
      this.waitCauses.flush(this.waitCauseSettings());
      this.handle(scheduled.value);
    }
    this.now = this.scenario.durationSeconds;
    this.closeEvent();
    const suiteVersion = this.options.suiteVersion ?? SCENARIO_SUITE_VERSION;
    const strategyName = this.strategy.name ?? this.strategy.id;
    const graceSeconds = this.strategy.graceSeconds ?? 0;
    const maxExistingWaitSeconds = this.strategy.maxExistingWaitSeconds;
    const randomizationMode = this.options.randomizationMode ?? 'legacy';
    const metadata: ReproducibilityMetadata = {
      scenarioId: this.scenario.id,
      scenarioSuiteVersion: suiteVersion,
      seed: this.options.seed,
      strategyId: this.strategy.id,
      strategyName,
      graceSeconds,
      ...(maxExistingWaitSeconds === undefined ? {} : { maxExistingWaitSeconds }),
      randomizationMode,
      engineVersion: SIMULATION_ENGINE_VERSION,
      replay: [
        `yarn simulation:run --scenario ${this.scenario.id} --seed ${this.options.seed}`,
        `--strategy ${strategyName} --grace ${graceSeconds}`,
        maxExistingWaitSeconds === undefined ? '' : `--max-existing-wait ${maxExistingWaitSeconds}`,
        randomizationMode === 'paired-v1' ? '--randomization paired-v1' : '',
      ].filter(Boolean).join(' '),
    };
    const record: EventMetricRecord = {
      scenarioId: this.scenario.id,
      seed: this.options.seed,
      strategyId: this.strategy.id,
      suiteVersion,
      durationSeconds: this.scenario.durationSeconds,
      participants: [...this.participants.values()].map(toMetricParticipant),
      queueCycles: this.queueCycles,
      games: this.completedGames,
      tablePeriods: this.tablePeriods,
      safetyViolations: this.violations,
      ...(this.scarcityDiagnostics.length > 0
        ? { scarcityDiagnostics: this.scarcityDiagnostics }
        : {}),
      ...(this.weightedDecisions.length > 0
        ? { weightedDecisions: this.weightedDecisions }
        : {}),
      ...(this.waitCauses.lockoutEvents.length > 0
        ? { connectorLockoutEvents: this.waitCauses.lockoutEvents }
        : {}),
    };
    const result: SimulationResult = {
      metadata,
      record,
      metrics: calculateEventMetrics(record),
    };
    if (this.options.debug) {
      result.timeline = this.timeline;
    }
    return result;
  }

  private initialize(): void {
    const poolIds = this.scenario.poolWeights.map((entry) => entry.value);
    for (let index = 0; index < this.scenario.playerCount; index += 1) {
      const id = `p${String(index + 1).padStart(3, '0')}`;
      const preferredPoolId = sampleWeighted(this.scenario.poolWeights, this.random);
      const decks: StrategyDeck[] = [
        { id: `${id}:${preferredPoolId}:preferred`, poolId: preferredPoolId, preference: 'preferred' },
      ];
      if (poolIds.length > 1 && this.random.boolean(this.scenario.secondaryPoolProbability)) {
        const alternatives = poolIds.filter((poolId) => poolId !== preferredPoolId);
        const secondary = this.random.pick(alternatives);
        decks.push({ id: `${id}:${secondary}:accepted`, poolId: secondary, preference: 'accepted' });
      }
      const arrivedAt = sampleDistribution(this.scenario.arrivalSeconds, this.random);
      this.participants.set(id, {
        id,
        arrivedAt,
        status: 'joined',
        decks,
        preferredPoolId,
        flexCredits: clamp(sampleDistribution(this.scenario.startingFlex, this.random), 0, 6),
        cycleCount: 0,
        gamesPlayed: 0,
      });
      if (arrivedAt < this.scenario.durationSeconds) {
        this.queue.schedule(arrivedAt, { type: 'arrival', participantId: id });
      }
    }
    for (let index = 0; index < this.scenario.tableCount; index += 1) {
      const id = `table-${String(index + 1).padStart(2, '0')}`;
      const disabled = index < this.scenario.initiallyDisabledTables;
      this.tables.set(id, {
        id,
        state: disabled ? 'disabled' : 'free',
        stateStartedAt: 0,
        disabledUntil: disabled ? this.scenario.durationSeconds : 0,
        gamesStarted: 0,
      });
    }
    for (const tableBreak of this.scenario.tableBreaks) {
      const tableId = `table-${String(tableBreak.tableIndex + 1).padStart(2, '0')}`;
      const until = Math.min(this.scenario.durationSeconds, tableBreak.at + tableBreak.duration);
      this.queue.schedule(tableBreak.at, { type: 'table-disable', tableId, until });
      if (until < this.scenario.durationSeconds) {
        this.queue.schedule(until, { type: 'table-enable', tableId });
      }
    }
  }

  private handle(event: EngineEvent): void {
    this.trace(event.type, eventDetail(event));
    switch (event.type) {
      case 'arrival':
        this.onArrival(event.participantId);
        break;
      case 'ready':
      case 'resume':
        this.becomeReady(event.participantId);
        break;
      case 'match':
        this.matchReadyPlayers();
        break;
      case 'match-evaluation':
        if (event.at === this.scheduledEvaluationAt) {
          this.scheduledEvaluationAt = undefined;
          this.matchReadyPlayers();
        }
        break;
      case 'game-finish':
        this.finishGame(event.gameId);
        break;
      case 'leave-if-waiting':
        this.leaveIfWaiting(event.participantId, event.cycle);
        break;
      case 'pause-if-waiting':
        this.pauseIfWaiting(event.participantId, event.cycle);
        break;
      case 'table-disable':
        this.disableTable(event.tableId, event.until);
        break;
      case 'table-enable':
        this.enableTable(event.tableId);
        break;
    }
  }

  private onArrival(participantId: string): void {
    const participant = this.requireParticipant(participantId);
    if (participant.status !== 'joined' || participant.arrivedAt !== this.now) {
      return;
    }
    const readyAt =
      this.now +
      sampleDistribution(
        this.scenario.readyDelaySeconds,
        this.runtimeRandom('ready-delay', participant.id, 0),
      );
    if (readyAt < this.scenario.durationSeconds) {
      this.queue.schedule(readyAt, { type: 'ready', participantId });
    }
  }

  private becomeReady(participantId: string): void {
    const participant = this.requireParticipant(participantId);
    if (participant.status !== 'joined' && participant.status !== 'paused') {
      return;
    }
    participant.status = 'ready';
    participant.readyAt = this.now;
    participant.cycleCount += 1;
    participant.openCycle = { cycle: participant.cycleCount, startedAt: this.now };
    this.waitCauses.startCycle(participant.id);
    const decisionRandom = this.runtimeRandom('wait-leave', participant.id, participant.cycleCount);
    const decision = decisionRandom.next();
    if (
      decision <
      this.scenario.leaveWhileWaitingProbability + this.scenario.pauseWhileWaitingProbability
    ) {
      const delay = sampleDistribution(this.scenario.waitingDecisionDelaySeconds, decisionRandom);
      if (this.now + delay < this.scenario.durationSeconds) {
        this.queue.schedule(this.now + delay, {
          type:
            decision < this.scenario.leaveWhileWaitingProbability
              ? 'leave-if-waiting'
              : 'pause-if-waiting',
          participantId,
          cycle: participant.cycleCount,
        });
      }
    }
    this.queue.schedule(this.now, { type: 'match' });
  }

  private matchReadyPlayers(): void {
    const ready = [...this.participants.values()]
      .filter((participant) => participant.status === 'ready' && participant.readyAt !== undefined)
      .sort((left, right) => (left.readyAt ?? 0) - (right.readyAt ?? 0) || left.id.localeCompare(right.id));
    const freeTables = [...this.tables.values()]
      .filter((table) => table.state === 'free')
      .sort((left, right) => left.id.localeCompare(right.id));
    if (ready.length === 0 || freeTables.length === 0) {
      return;
    }
    const result = this.strategy.match({
      now: this.now,
      participants: ready.map((participant) => ({
        id: participant.id,
        readyAt: participant.readyAt ?? this.now,
        decks: participant.decks,
        flexCredits: participant.flexCredits,
      })),
      tables: freeTables.map((table) => ({ id: table.id })),
      priorGroups: this.priorGroups,
      settings: {
        preferredSize: this.scenario.preferredPodSize,
        allowedSizes: this.scenario.allowedPodSizes,
      },
    });
    this.scheduleEvaluation(result.nextEvaluationAt);
    if (result.diagnostics) {
      this.scarcityDiagnostics.push(...result.diagnostics);
      for (const diagnostic of result.diagnostics) {
        this.trace(
          diagnostic.type,
          `${diagnostic.participantId}:${diagnostic.preferredPoolId}->${diagnostic.scarcePoolId}`,
        );
      }
    }
    if (result.weightedDecision) {
      this.weightedDecisions.push(
        this.options.debug
          ? result.weightedDecision
          : {
              ...result.weightedDecision,
              candidates: result.weightedDecision.candidates.filter(
                (candidate) =>
                  candidate.selected ||
                  candidate.key ===
                    result.weightedDecision
                      ?.singleGeneratorSelectedCandidateKey,
              ),
            },
      );
      if (this.options.debug) {
        for (const candidate of result.weightedDecision.candidates) {
          this.trace(
            'weighted-score',
            JSON.stringify({
              profile: result.weightedDecision.profileId,
              candidate: candidate.key,
              source: candidate.source,
              forcedAssignments: candidate.forcedAssignments,
              seats: candidate.seats,
              delta: candidate.immediateSeatDelta,
              components: candidate.components,
              weights: candidate.weights,
              total: candidate.weightedTotal,
              selected: candidate.selected,
              plan: candidate.plan,
              residual: candidate.residual,
            }),
          );
        }
      }
    }
    const accepted = this.validateMatches(result.matches, ready, freeTables);
    for (const match of accepted) {
      this.startGame(match);
    }
  }

  private validateMatches(
    matches: readonly MatchmakingMatch[],
    ready: readonly ParticipantState[],
    freeTables: readonly TableStateRecord[],
  ): MatchmakingMatch[] {
    const readyIds = new Set(ready.map((participant) => participant.id));
    const tableIds = new Set(freeTables.map((table) => table.id));
    const usedParticipants = new Set<string>();
    const usedTables = new Set<string>();
    const accepted: MatchmakingMatch[] = [];
    for (const match of matches) {
      const localViolations: Array<[string, string]> = [];
      if (!tableIds.has(match.tableId) || usedTables.has(match.tableId)) {
        localViolations.push(['INVALID_TABLE_ASSIGNMENT', `Table ${match.tableId} is unavailable or duplicated.`]);
      }
      if (!this.scenario.allowedPodSizes.includes(match.seats.length)) {
        localViolations.push(['INVALID_POD_SIZE', `Pod has ${match.seats.length} seats.`]);
      }
      const localIds = new Set<string>();
      for (const seat of match.seats) {
        const participant = this.participants.get(seat.participantId);
        if (!readyIds.has(seat.participantId) || usedParticipants.has(seat.participantId) ||
            localIds.has(seat.participantId)) {
          localViolations.push(['DUPLICATE_OR_INELIGIBLE_SEAT', `Invalid seat for ${seat.participantId}.`]);
        }
        if (!participant?.decks.some((deck) => deck.poolId === seat.poolId) || seat.poolId !== match.poolId) {
          localViolations.push(['INCOMPATIBLE_POOL', `${seat.participantId} cannot play ${seat.poolId}.`]);
        }
        localIds.add(seat.participantId);
      }
      if (localViolations.length > 0) {
        localViolations.forEach(([code, detail]) => this.recordViolation(code, detail));
        if (this.options.failOnSafetyViolation !== false) {
          throw new SimulationInvariantError(
            'Strategy returned an unsafe assignment.',
            this.scenario.id,
            this.options.seed,
            this.violations,
          );
        }
        continue;
      }
      usedTables.add(match.tableId);
      localIds.forEach((id) => usedParticipants.add(id));
      accepted.push(match);
    }
    return accepted;
  }

  private startGame(match: MatchmakingMatch): void {
    const table = this.requireTable(match.tableId);
    this.transitionTable(table, 'occupied');
    this.gameSequence += 1;
    const gameId = `game-${String(this.gameSequence).padStart(4, '0')}`;
    const participantIds = match.seats.map((seat) => seat.participantId);
    table.gamesStarted += 1;
    const gameRandom = this.options.randomizationMode === 'paired-v1'
      ? this.runtimeRandom('game-table-slot', table.id, table.gamesStarted)
      : this.runtimeRandom(
          'game',
          [...participantIds].sort().join(','),
          Math.max(...match.seats.map((seat) => this.requireParticipant(seat.participantId).gamesPlayed)),
        );
    const endedAt = this.now + sampleDistribution(this.scenario.gameDurationSeconds, gameRandom);
    const metricSeats: MetricGameSeat[] = match.seats.map((seat) => {
      const participant = this.requireParticipant(seat.participantId);
      this.endCycle(participant, 'matched');
      participant.status = 'playing';
      participant.readyAt = undefined;
      participant.flexCredits = clamp(participant.flexCredits + seat.flexDelta, 0, 6);
      participant.gamesPlayed += 1;
      return {
        participantId: participant.id,
        preferredPoolId: participant.preferredPoolId,
        acceptedPoolIds: participant.decks.map((deck) => deck.poolId),
        assignedPoolId: seat.poolId,
        preferredPodSize: this.scenario.preferredPodSize,
        flexDelta: seat.flexDelta,
        concession: seat.concession,
        postGameDecision: 'event-closed',
      };
    });
    const metric: MetricGame = {
      id: gameId,
      tableId: table.id,
      poolId: match.poolId,
      startedAt: this.now,
      endedAt,
      seats: metricSeats,
    };
    this.activeGames.set(gameId, { metric, participantIds });
    if (endedAt < this.scenario.durationSeconds) {
      this.queue.schedule(endedAt, { type: 'game-finish', gameId });
    }
    this.trace('game-start', `${gameId}:${participantIds.join(',')}`);
  }

  private finishGame(gameId: string): void {
    const game = this.activeGames.get(gameId);
    if (!game) {
      return;
    }
    this.activeGames.delete(gameId);
    this.completedGames.push(game.metric);
    this.priorGroups.push([...game.participantIds]);
    const table = this.requireTable(game.metric.tableId);
    this.transitionTable(table, this.now < table.disabledUntil ? 'disabled' : 'free');
    game.metric.seats.forEach((seat) => {
      const participant = this.requireParticipant(seat.participantId);
      const random = this.runtimeRandom('post-game', participant.id, participant.gamesPlayed);
      const draw = random.next();
      if (draw < this.scenario.requeueProbability) {
        seat.postGameDecision = 'requeue';
        participant.status = 'joined';
        const delay = sampleDistribution(this.scenario.requeueDelaySeconds, random);
        this.scheduleParticipant(this.now + delay, { type: 'ready', participantId: participant.id });
      } else if (draw < this.scenario.requeueProbability + this.scenario.pauseProbability) {
        seat.postGameDecision = 'pause';
        participant.status = 'paused';
        const delay = sampleDistribution(this.scenario.pauseDurationSeconds, random);
        this.scheduleParticipant(this.now + delay, { type: 'resume', participantId: participant.id });
      } else if (
        draw <
        this.scenario.requeueProbability + this.scenario.pauseProbability + this.scenario.leaveProbability
      ) {
        seat.postGameDecision = 'leave';
        participant.status = 'left';
      } else {
        seat.postGameDecision = 'stay';
        participant.status = 'joined';
      }
    });
    this.queue.schedule(this.now, { type: 'match' });
  }

  private leaveIfWaiting(participantId: string, cycle: number): void {
    const participant = this.requireParticipant(participantId);
    if (participant.status !== 'ready' || participant.openCycle?.cycle !== cycle) {
      return;
    }
    this.endCycle(participant, 'left');
    participant.status = 'left';
    participant.readyAt = undefined;
  }

  private pauseIfWaiting(participantId: string, cycle: number): void {
    const participant = this.requireParticipant(participantId);
    if (participant.status !== 'ready' || participant.openCycle?.cycle !== cycle) {
      return;
    }
    this.endCycle(participant, 'paused');
    participant.status = 'paused';
    participant.readyAt = undefined;
    const random = this.runtimeRandom('waiting-pause', participant.id, cycle);
    const delay = sampleDistribution(this.scenario.pauseDurationSeconds, random);
    this.scheduleParticipant(this.now + delay, { type: 'resume', participantId });
  }

  private disableTable(tableId: string, until: number): void {
    const table = this.requireTable(tableId);
    table.disabledUntil = Math.max(table.disabledUntil, until);
    if (table.state === 'free') {
      this.transitionTable(table, 'disabled');
    }
  }

  private enableTable(tableId: string): void {
    const table = this.requireTable(tableId);
    if (this.now < table.disabledUntil) {
      return;
    }
    if (table.state === 'disabled') {
      this.transitionTable(table, 'free');
      this.queue.schedule(this.now, { type: 'match' });
    }
  }

  private endCycle(participant: ParticipantState, reason: QueueCycleEndReason): void {
    const open = participant.openCycle;
    if (!open) {
      this.fail('MISSING_QUEUE_CYCLE', `Participant ${participant.id} has no open queue cycle.`);
      return;
    }
    const attributed = this.waitCauses.endCycle(participant.id, this.waitCauseSettings());
    const cycle: MetricQueueCycle = {
      participantId: participant.id,
      cycle: open.cycle,
      startedAt: open.startedAt,
      endedAt: this.now,
      reason,
      waitCauses: attributed.seconds,
      ...(this.options.debug && attributed.intervals.length > 0
        ? { waitCauseIntervals: attributed.intervals }
        : {}),
    };
    if (!waitCauseAccountingHolds(this.now - open.startedAt, attributed.seconds)) {
      this.recordViolation(
        'WAIT_CAUSE_ACCOUNTING',
        `${participant.id} cycle ${open.cycle} wait ${this.now - open.startedAt}s accounted ${
          attributed.seconds.structuralScarcity +
          attributed.seconds.tableCapacity +
          attributed.seconds.matcherChoice +
          attributed.seconds.connectorLockoutOtherPool +
          attributed.seconds.connectorLockoutSamePool +
          attributed.seconds.opportunityGrace +
          attributed.seconds.unknown
        }s.`,
      );
    }
    if (reason !== 'matched') {
      cycle.diagnostic = this.classifyWait(participant);
    }
    this.queueCycles.push(cycle);
    participant.openCycle = undefined;
  }

  private waitCauseSettings(): WaitCauseSettings {
    const ready = [...this.participants.values()]
      .filter((participant) => participant.status === 'ready' && participant.readyAt !== undefined)
      .map((participant) => ({
        id: participant.id,
        readyAt: participant.readyAt ?? this.now,
        poolIds: [...new Set(participant.decks.map((deck) => deck.poolId))],
        preferredPoolId: participant.preferredPoolId,
      }));
    const playing: WaitCausePlayingParticipant[] = [];
    for (const game of this.activeGames.values()) {
      for (const seat of game.metric.seats) {
        const participant = this.participants.get(seat.participantId);
        if (!participant || participant.status !== 'playing') continue;
        playing.push({
          id: participant.id,
          poolIds: [...new Set(participant.decks.map((deck) => deck.poolId))],
          preferredPoolId: participant.preferredPoolId,
          assignedPoolId: seat.assignedPoolId,
          gameStartedAt: game.metric.startedAt,
          gameEndedAt: game.metric.endedAt,
        });
      }
    }
    return {
      now: this.now,
      minPodSize: Math.min(...this.scenario.allowedPodSizes),
      preferredPodSize: this.scenario.preferredPodSize,
      graceSeconds: this.strategy.graceSeconds ?? 0,
      maxExistingWaitSeconds: this.strategy.maxExistingWaitSeconds,
      freeTableCount: [...this.tables.values()].filter((table) => table.state === 'free').length,
      ready,
      playing,
    };
  }

  private classifyWait(participant: ParticipantState): WaitDiagnostic {
    const ready = [...this.participants.values()].filter((entry) => entry.status === 'ready');
    const minimum = Math.min(...this.scenario.allowedPodSizes);
    const compatible = ready.filter((entry) =>
      entry.decks.some((deck) => participant.decks.some((ownDeck) => ownDeck.poolId === deck.poolId)));
    if (compatible.length < minimum) {
      return 'WAITING_FOR_PLAYERS';
    }
    if (![...this.tables.values()].some((table) => table.state === 'free')) {
      return 'WAITING_FOR_TABLE';
    }
    const hasCompatiblePod = participant.decks.some(
      (deck) => ready.filter((entry) => entry.decks.some((candidate) => candidate.poolId === deck.poolId)).length >= minimum,
    );
    return hasCompatiblePod ? 'MATCH_AVAILABLE_BUT_NOT_SELECTED' : 'WAITING_FOR_COMPATIBLE_POOL';
  }

  private closeEvent(): void {
    this.waitCauses.flush(this.waitCauseSettings());
    for (const participant of this.participants.values()) {
      if (participant.status === 'ready') {
        this.endCycle(participant, 'event-closed');
      }
    }
    for (const table of this.tables.values()) {
      this.closeTablePeriod(table);
    }
  }

  private transitionTable(table: TableStateRecord, next: TableState): void {
    if (table.state === next) {
      return;
    }
    this.closeTablePeriod(table);
    table.state = next;
    table.stateStartedAt = this.now;
  }

  private closeTablePeriod(table: TableStateRecord): void {
    if (this.now > table.stateStartedAt) {
      this.tablePeriods.push({
        tableId: table.id,
        startedAt: table.stateStartedAt,
        endedAt: this.now,
        state: table.state,
      });
    }
    table.stateStartedAt = this.now;
  }

  private scheduleParticipant(time: number, event: EngineEvent): void {
    if (time < this.scenario.durationSeconds) {
      this.queue.schedule(time, event);
    }
  }

  private scheduleEvaluation(nextEvaluationAt: number | undefined): void {
    if (nextEvaluationAt === undefined) {
      this.scheduledEvaluationAt = undefined;
      return;
    }
    if (!Number.isSafeInteger(nextEvaluationAt) || nextEvaluationAt <= this.now) {
      this.fail(
        'INVALID_EVALUATION_TIME',
        `Strategy evaluation time ${nextEvaluationAt} must be after ${this.now}.`,
      );
      return;
    }
    if (nextEvaluationAt === this.scheduledEvaluationAt) return;
    this.scheduledEvaluationAt = nextEvaluationAt;
    if (nextEvaluationAt < this.scenario.durationSeconds) {
      this.queue.schedule(nextEvaluationAt, {
        type: 'match-evaluation',
        at: nextEvaluationAt,
      });
    }
  }

  private runtimeRandom(kind: string, id: string, cycle: number): SeededRandom {
    return createSeededRandom(hashSeed(this.options.seed, `${kind}\u0000${id}\u0000${cycle}`));
  }

  private requireParticipant(id: string): ParticipantState {
    const participant = this.participants.get(id);
    if (!participant) {
      throw new SimulationInvariantError(
        `Unknown participant ${id}.`,
        this.scenario.id,
        this.options.seed,
        this.violations,
      );
    }
    return participant;
  }

  private requireTable(id: string): TableStateRecord {
    const table = this.tables.get(id);
    if (!table) {
      throw new SimulationInvariantError(
        `Unknown table ${id}.`,
        this.scenario.id,
        this.options.seed,
        this.violations,
      );
    }
    return table;
  }

  private recordViolation(code: string, detail: string): void {
    this.violations.push({ code, at: this.now, detail });
  }

  private fail(code: string, detail: string): void {
    this.recordViolation(code, detail);
    if (this.options.failOnSafetyViolation !== false) {
      throw new SimulationInvariantError(detail, this.scenario.id, this.options.seed, this.violations);
    }
  }

  private trace(event: string, detail: string): void {
    if (this.options.debug) {
      this.timeline.push({ at: this.now, event, detail });
    }
  }
}

function toMetricParticipant(participant: ParticipantState): MetricParticipant {
  return {
    id: participant.id,
    arrivedAt: participant.arrivedAt,
    finalStatus: participant.status,
    preferredPoolId: participant.preferredPoolId,
    acceptedPoolIds: participant.decks.map((deck) => deck.poolId),
  };
}

function eventDetail(event: EngineEvent): string {
  if ('participantId' in event) {
    return event.participantId;
  }
  if ('tableId' in event) {
    return event.tableId;
  }
  if ('gameId' in event) {
    return event.gameId;
  }
  return '';
}

function hashSeed(seed: number, value: string): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
