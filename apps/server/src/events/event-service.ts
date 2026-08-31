import {
  challengeInPack,
  cloneOfficialPack,
  emptyPrivatePack,
  OFFICIAL_COMMANDER_CHALLENGES,
  parseChallengePack,
  assignTreacheryRoles,
  assignTreacheryIdentities,
  parseGameMode,
  parseRulesFormat,
  resolveRulesFormat,
  cancelTournamentMatch,
  createTournamentState,
  currentTournamentRound,
  markTournamentMatchFormed,
  markTournamentMatchPlaying,
  normalizeTournamentState,
  recordTournamentGame,
  setTournamentMatchBestOf,
  startTournament,
  treacheryIdentityById,
  treacheryDistribution,
  EventStatus,
  ParticipantStatus,
  PhysicalTableStatus,
  addLimitedTimerSeconds,
  calculateLimitedStandings,
  defaultLimitedRounds,
  deterministicDraftSeats,
  isLimitedMode,
  limitedModeConfig,
  pairLimitedRound,
  pauseLimitedTimer,
  resumeLimitedTimer,
  startLimitedTimer,
  validateLimitedCohortSize,
  type ChallengePack,
  type EventMetrics,
  type GameMode,
  type EventSnapshot,
  type LimitedEventModeConfig,
  type LimitedMatchOutcome,
  type LimitedMode,
  type LimitedSessionStatus,
  type LimitedTimerPhase,
  type PodRating,
  type ProductEventName,
  type PublicEvent,
  type PublicLimitedSession,
  type PublicParticipant,
  type PublicPod,
  type PublicTable,
  type PublicChallengeCompletion,
  type RulesFormat,
  type TreacheryRoleAssignment,
  type SeriesLength,
  type TournamentFormat,
  type TournamentOptions,
  type TournamentState,
} from '@podyguard/shared';
import { randomUUID } from 'node:crypto';
import {
  InvalidParticipantSessionError,
  type IdentityBoundary,
} from '../identity/index.js';
import { boundedFlex, createMatches, eventMatchOptions } from '@podyguard/matching';
import { generateJoinCode } from './join-code.js';
import { nextBotName } from './bot-names.js';
import { SEATS_PER_TABLE } from './plan-pods.js';
import {
  DevToolsDisabledError,
  EventNotFoundError,
  EventNotJoinableError,
  InvalidHostPinError,
  InvalidParticipantTransitionError,
  JoinCodeConflictError,
  LimitedPersistenceConflictError,
  ParticipantNotFoundError,
  TableNotFoundError,
  PodNotFoundError,
  type EventStore,
  type StoredAssignment,
  type StoredCompletedGame,
  type StoredDeck,
  type StoredEvent,
  type StoredLimitedMatch,
  type StoredLimitedSession,
  type StoredParticipant,
  type StoredTable,
} from './event-store.js';
import {
  assertDecks,
  assertDisplayName,
  assertEventName,
  assertLifetimeHours,
  assertPreferredPodSize,
  assertHostPin,
  assertTableCount,
  assertTableLabel,
  hashHostPin,
  InvalidEventInputError,
  verifyHostPin,
  type DeckDraft,
} from './validation.js';
import { computeEventMetrics } from './metrics.js';

const JOIN_CODE_ATTEMPTS = 8;

export class LimitedSessionNotFoundError extends Error {
  readonly code = 'LIMITED_SESSION_NOT_FOUND';

  constructor() {
    super('Limited session not found.');
    this.name = 'LimitedSessionNotFoundError';
  }
}

export type LimitedResultInput = {
  outcome: LimitedMatchOutcome;
  playerAGameWins: number;
  playerBGameWins: number;
};

export type CreateEventInput = {
  name: string;
  hostPin: string;
  tableCount: number;
  gameMode?: GameMode;
  rulesFormat?: RulesFormat;
  allowThreePods?: boolean;
  allowFivePods?: boolean;
  preferredPodSize?: number;
  lifetimeHours?: number;
  tournamentFormat?: TournamentFormat;
  tournamentOptions?: TournamentOptions;
  limitedModeConfigs?: LimitedEventModeConfig[];
};

export type CreateEventResult = {
  event: PublicEvent;
  hostToken: string;
};

export type JoinEventResult = {
  event: PublicEvent;
  participant: PublicParticipant;
  token: string;
};

export type HostUnlockResult = {
  event: PublicEvent;
  hostToken: string;
};

export type AddTablesInput = {
  count?: number;
  labels?: string[];
};

export type EventServiceOptions = {
  isDev?: boolean;
  now?: () => Date;
};

export type MatchResult = {
  pods: PublicPod[];
  botsAdded: number;
};

export class EventService {
  constructor(
    private readonly store: EventStore,
    private readonly identity: IdentityBoundary,
    private readonly options: EventServiceOptions = {},
  ) {}

  async createEvent(input: CreateEventInput): Promise<CreateEventResult> {
    const name = assertEventName(input.name);
    const hostPin = assertHostPin(input.hostPin);
    const gameMode: GameMode = parseGameMode(input.gameMode);
    const rulesFormat = resolveRulesFormat(
      gameMode,
      parseRulesFormat(input.rulesFormat),
    );
    const preferredPodSize = assertPreferredPodSize(
      gameMode,
      input.preferredPodSize,
    );
    const tournamentFormat = parseTournamentFormat(input.tournamentFormat);
    if (
      tournamentFormat &&
      (gameMode === 'two-headed-giant' ||
        gameMode === 'archenemy-commander' ||
        gameMode === 'emperor')
    ) {
      throw new InvalidEventInputError(
        'Tournaments currently require individual winners.',
      );
    }
    const tournamentOptions = parseTournamentOptions(input.tournamentOptions);
    const limitedModeConfigs = normalizeLimitedModeConfigs(
      input.limitedModeConfigs,
    );
    const lifetimeHours = assertLifetimeHours(input.lifetimeHours);
    const createdAt = this.now();
    const expiresAt = new Date(
      createdAt.getTime() + lifetimeHours * 60 * 60 * 1000,
    );
    const allowFivePods =
      gameMode === 'commander' ||
      ((gameMode === 'treachery' ||
        gameMode === 'assassin' ||
        gameMode === 'multiplayer') &&
        preferredPodSize >= 5);
    const labels = resolveTableLabels({ count: input.tableCount }, 0);
    const hostCredentialHash = await hashHostPin(hostPin);
    let initialTournamentState: TournamentState | undefined;
    if (tournamentFormat) {
      try {
        initialTournamentState = createTournamentState(
          tournamentFormat,
          tournamentOptions.matchSize ?? 2,
          tournamentOptions,
        );
      } catch (error) {
        throw new InvalidEventInputError(
          error instanceof Error ? error.message : 'Invalid tournament options.',
        );
      }
    }

    let stored: StoredEvent | undefined;
    for (let attempt = 0; attempt < JOIN_CODE_ATTEMPTS; attempt += 1) {
      try {
        stored = await this.store.insertEvent({
          name,
          joinCode: generateJoinCode(),
          hostCredentialHash,
          gameMode,
          rulesFormat,
          allowThreePods:
            gameMode === 'assassin' ||
            gameMode === 'multiplayer' ||
            gameMode === 'commander',
          allowFivePods,
          preferredPodSize,
          tournamentFormat,
          tournamentState: initialTournamentState,
          limitedModeConfigs,
          expiresAt,
          createdAt,
        });
        break;
      } catch (error) {
        if (
          error instanceof JoinCodeConflictError &&
          attempt < JOIN_CODE_ATTEMPTS - 1
        ) {
          continue;
        }
        throw error;
      }
    }
    if (!stored) {
      throw new JoinCodeConflictError();
    }

    for (const [index, label] of labels.entries()) {
      await this.store.insertTable({
        eventId: stored.id,
        label,
        sortOrder: index,
      });
    }

    const { token } = this.identity.hostEventSessions.issue(stored.id);
    return { event: await this.presentEvent(stored), hostToken: token };
  }

  async getEvent(joinCode: string): Promise<PublicEvent> {
    const stored = await this.requireByJoinCode(joinCode);
    return this.presentEvent(stored);
  }

  async listParticipants(joinCode: string): Promise<PublicParticipant[]> {
    const stored = await this.requireByJoinCode(joinCode);
    const [rows, assignments, decks, completions] = await Promise.all([
      this.store.listParticipants(stored.id),
      this.store.listAssignments(stored.id),
      this.store.listDecks(stored.id),
      this.store.listChallengeCompletions(stored.id),
    ]);
    const byParticipant = assignmentMap(assignments);
    const decksByParticipant = decksMap(decks);
    return rows.map((row) =>
      toPublicParticipant(
        row,
        byParticipant.get(row.id),
        decksByParticipant.get(row.id) ?? [],
        completions.filter((completion) => completion.participantId === row.id),
      ),
    );
  }

  async joinEvent(
    joinCode: string,
    displayName: string,
    decks?: DeckDraft[],
  ): Promise<JoinEventResult> {
    const stored = await this.requireByJoinCode(joinCode);
    if (
      stored.status !== EventStatus.Open ||
      (stored.tournamentState &&
        stored.tournamentState.phase !== 'registration')
    ) {
      throw new EventNotJoinableError();
    }
    const name = assertDisplayName(displayName);
    const participant = await this.store.insertParticipant({
      eventId: stored.id,
      displayName: name,
    });
    const storedDecks =
      decks && decks.length > 0
        ? await this.store.replaceDecks(
            participant.id,
            assertDecks(decks).map((row) => ({
              participantId: participant.id,
              ...row,
            })),
          )
        : [];
    const session = this.identity.participantSessions.issue({
      eventId: stored.id,
      participantId: participant.id,
    });
    await this.track(stored.id, 'joined_event');
    return {
      event: await this.presentEvent(stored),
      participant: toPublicParticipant(participant, undefined, storedDecks),
      token: session.token,
    };
  }

  async setDecks(
    joinCode: string,
    participantToken: string,
    decks: DeckDraft[],
  ): Promise<PublicParticipant> {
    const stored = await this.requireByJoinCode(joinCode);
    const participant = await this.requireParticipant(
      stored.id,
      participantToken,
    );
    if (
      participant.status !== ParticipantStatus.Joined &&
      participant.status !== ParticipantStatus.Ready &&
      participant.status !== ParticipantStatus.Paused
    ) {
      throw new InvalidParticipantTransitionError(
        'Deck lists can only change while waiting, ready, or paused.',
      );
    }
    const storedDecks = await this.store.replaceDecks(
      participant.id,
      assertDecks(decks).map((row) => ({
        participantId: participant.id,
        ...row,
      })),
    );
    const assignments = await this.store.listAssignments(stored.id);
    const seat = assignments.find((row) => row.participantId === participant.id);
    return toPublicParticipant(participant, seat, storedDecks);
  }

  async unlockHost(
    joinCode: string,
    hostPin: string,
  ): Promise<HostUnlockResult> {
    const stored = await this.requireByJoinCode(joinCode);
    const pin = assertHostPin(hostPin);
    const ok = await verifyHostPin(pin, stored.hostCredentialHash);
    if (!ok) {
      throw new InvalidHostPinError();
    }
    const { token } = this.identity.hostEventSessions.issue(stored.id);
    return { event: await this.presentEvent(stored), hostToken: token };
  }

  async verifyHostToken(joinCode: string, token: string): Promise<PublicEvent> {
    const stored = await this.requireHostToken(joinCode, token);
    return this.presentEvent(stored);
  }

  async getMe(
    joinCode: string,
    participantToken: string,
  ): Promise<{ event: PublicEvent; participant: PublicParticipant }> {
    const stored = await this.requireByJoinCode(joinCode);
    const participant = await this.requireParticipant(
      stored.id,
      participantToken,
    );
    const assignments = await this.store.listAssignments(stored.id);
    const seat = assignments.find((row) => row.participantId === participant.id);
    return {
      event: await this.presentEvent(stored),
      participant: await this.present(participant, seat),
    };
  }

  async getTreacheryRole(
    joinCode: string,
    participantToken: string,
  ): Promise<TreacheryRoleAssignment> {
    const stored = await this.requireByJoinCode(joinCode);
    if (stored.gameMode !== 'treachery') {
      throw new InvalidParticipantTransitionError(
        'This event does not use Treachery roles.',
      );
    }
    const participant = await this.requireParticipant(
      stored.id,
      participantToken,
    );
    const own = await this.store.findActiveTreacheryAssignment(
      stored.id,
      participant.id,
    );
    if (!own) {
      throw new PodNotFoundError();
    }
    const podAssignments = (await this.store.listAssignments(stored.id)).filter(
      (row) => row.podId === own.podId && row.treacheryRole,
    );
    const leader = podAssignments.find(
      (row) => row.treacheryRole === 'leader',
    );
    if (!leader) {
      throw new Error('Treachery pod has no Leader.');
    }
    return {
      podId: own.podId,
      role: own.role,
      identity: requireTreacheryIdentity(own.identityId),
      unveiled: Boolean(own.unveiledAt),
      leaderParticipantId: leader.participantId,
      distribution: treacheryDistribution(
        podAssignments.map((row) => row.treacheryRole!),
      ),
    };
  }

  async unveilTreacheryIdentity(
    joinCode: string,
    participantToken: string,
  ): Promise<TreacheryRoleAssignment> {
    const current = await this.getTreacheryRole(joinCode, participantToken);
    const stored = await this.requireByJoinCode(joinCode);
    const participant = await this.requireParticipant(
      stored.id,
      participantToken,
    );
    const active = await this.store.findActiveTreacheryAssignment(
      stored.id,
      participant.id,
    );
    if (active?.podStatus !== 'playing') {
      throw new InvalidParticipantTransitionError(
        'An identity can only be unveiled after the game starts.',
      );
    }
    await this.store.unveilTreacheryIdentity(current.podId, participant.id);
    await this.track(stored.id, 'identity_unveiled');
    return { ...current, unveiled: true };
  }

  async setReady(
    joinCode: string,
    participantToken: string,
    ready: boolean,
  ): Promise<PublicParticipant> {
    const stored = await this.requireByJoinCode(joinCode);
    const participant = await this.requireParticipant(
      stored.id,
      participantToken,
    );

    if (ready) {
      if (participant.limitedQueueMode) {
        throw new InvalidParticipantTransitionError(
          'Leave the Limited queue before joining normal matchmaking.',
        );
      }
      if (
        participant.status !== ParticipantStatus.Joined &&
        participant.status !== ParticipantStatus.Paused
      ) {
        throw new InvalidParticipantTransitionError(
          'Only waiting or paused players can mark themselves ready.',
        );
      }
      const updated = await this.store.updateParticipant(participant.id, {
        status: ParticipantStatus.Ready,
        readyAt: new Date(),
      });
      await this.track(stored.id, 'became_ready');
      return this.present(updated);
    }

    if (participant.status !== ParticipantStatus.Ready) {
      throw new InvalidParticipantTransitionError(
        'Only ready players can step back from the queue.',
      );
    }
    const updated = await this.store.updateParticipant(participant.id, {
      status: ParticipantStatus.Joined,
      readyAt: null,
    });
    return this.present(updated);
  }

  async setPaused(
    joinCode: string,
    participantToken: string,
    paused: boolean,
  ): Promise<PublicParticipant> {
    const stored = await this.requireByJoinCode(joinCode);
    const participant = await this.requireParticipant(
      stored.id,
      participantToken,
    );

    if (paused) {
      if (participant.limitedQueueMode) {
        throw new InvalidParticipantTransitionError(
          'Leave the Limited queue before pausing normal matchmaking.',
        );
      }
      if (
        participant.status !== ParticipantStatus.Joined &&
        participant.status !== ParticipantStatus.Ready
      ) {
        throw new InvalidParticipantTransitionError(
          'Only waiting or ready players can pause.',
        );
      }
      const updated = await this.store.updateParticipant(participant.id, {
        status: ParticipantStatus.Paused,
        readyAt: null,
      });
      await this.track(stored.id, 'paused');
      return this.present(updated);
    }

    if (participant.status !== ParticipantStatus.Paused) {
      throw new InvalidParticipantTransitionError(
        'Only paused players can return to the floor.',
      );
    }
    const updated = await this.store.updateParticipant(participant.id, {
      status: ParticipantStatus.Joined,
      readyAt: null,
    });
    return this.present(updated);
  }

  async leaveEvent(
    joinCode: string,
    participantToken: string,
  ): Promise<PublicParticipant> {
    const stored = await this.requireByJoinCode(joinCode);
    const participant = await this.requireParticipant(
      stored.id,
      participantToken,
    );
    if (
      participant.status !== ParticipantStatus.Joined &&
      participant.status !== ParticipantStatus.Ready &&
      participant.status !== ParticipantStatus.Paused &&
      participant.status !== ParticipantStatus.Matched
    ) {
      throw new InvalidParticipantTransitionError(
        'Players in a game stay until the host finishes the table.',
      );
    }
    if (participant.status === ParticipantStatus.Matched) {
      const assignments = await this.store.listAssignments(stored.id);
      const seat = assignments.find((row) => row.participantId === participant.id);
      if (seat?.podStatus === 'playing') {
        throw new InvalidParticipantTransitionError(
          'Players in a game stay until the host finishes the table.',
        );
      }
      if (seat) {
        const pod = await this.store.findActivePodByTableId(stored.id, seat.tableId);
        if (pod) {
          await this.store.cancelPod(pod.id);
        }
      }
    }
    const updated = await this.store.updateParticipant(participant.id, {
      status: ParticipantStatus.Left,
      readyAt: null,
      limitedQueueMode: null,
      limitedQueuedAt: null,
    });
    await this.track(stored.id, 'left_event');
    return this.present(updated);
  }

  /**
   * The host's broom. A player whose phone lost its seat key rejoins as someone
   * new, and the roster is left holding a name nobody is behind — matching would
   * keep seating that ghost. Only the host can sweep it, and only once the table
   * it sits at is done, so a live game is never pulled apart underneath the
   * players who are still at it.
   */
  async removeParticipant(
    joinCode: string,
    hostToken: string,
    participantId: string,
  ): Promise<PublicParticipant> {
    const stored = await this.requireHostToken(joinCode, hostToken);
    const participant = await this.store.findParticipantById(participantId);
    if (!participant || participant.eventId !== stored.id) {
      throw new ParticipantNotFoundError();
    }
    if (participant.status === ParticipantStatus.Playing) {
      throw new InvalidParticipantTransitionError(
        'Finish or cancel the table before removing a player seated at it.',
      );
    }
    const assignments = await this.store.listAssignments(stored.id);
    const seat = assignments.find((row) => row.participantId === participant.id);
    if (seat) {
      if (seat.podStatus === 'playing') {
        throw new InvalidParticipantTransitionError(
          'Finish or cancel the table before removing a player seated at it.',
        );
      }
      // A pod is dealt as a whole, so the rest of the seats go back to the
      // queue to be matched again rather than playing a hand short.
      await this.store.cancelPod(seat.podId);
    }
    const updated = await this.store.updateParticipant(participant.id, {
      status: ParticipantStatus.Left,
      readyAt: null,
      limitedQueueMode: null,
      limitedQueuedAt: null,
    });
    await this.track(stored.id, 'left_event');
    return this.present(updated);
  }

  async getSnapshot(joinCode: string): Promise<EventSnapshot> {
    const stored = await this.requireByJoinCode(joinCode);
    const [event, participants, tables, sessions, people] = await Promise.all([
      this.presentEvent(stored),
      this.listParticipants(joinCode),
      this.listTablesByEventId(stored.id),
      this.store.listLimitedSessions(stored.id),
      this.store.listParticipants(stored.id),
    ]);
    return {
      event,
      participants,
      tables,
      limitedQueues: limitedQueueSummaries(stored, people),
      limitedSessions: sessions.map((session) =>
        toPublicLimitedSession(session, this.now()),
      ),
    };
  }

  async joinLimitedQueue(
    joinCode: string,
    participantToken: string,
    mode: LimitedMode,
  ): Promise<EventSnapshot> {
    const stored = await this.requireByJoinCode(joinCode);
    const config = requireEnabledLimitedConfig(stored, mode);
    const participant = await this.requireParticipant(
      stored.id,
      participantToken,
    );
    if (
      participant.status !== ParticipantStatus.Joined &&
      participant.status !== ParticipantStatus.Ready &&
      participant.status !== ParticipantStatus.Paused
    ) {
      throw new InvalidParticipantTransitionError(
        'Only an unseated player can join a Limited queue.',
      );
    }
    await this.store.updateParticipant(participant.id, {
      status: ParticipantStatus.Joined,
      readyAt: null,
      limitedQueueMode: mode,
      limitedQueuedAt: this.now(),
    });
    await this.track(stored.id, 'limited_queued');
    const target = config.preferredCohortSize ?? config.minCohortSize;
    const queue = await this.limitedQueue(stored.id, mode);
    if (queue.length >= target) {
      try {
        await this.createLimitedSessionFromQueue(stored, config, {
          participantCount: target,
          automatic: true,
        });
      } catch (error) {
        if (!(error instanceof LimitedPersistenceConflictError)) throw error;
      }
    }
    return this.getSnapshot(joinCode);
  }

  async leaveLimitedQueue(
    joinCode: string,
    participantToken: string,
  ): Promise<EventSnapshot> {
    const stored = await this.requireByJoinCode(joinCode);
    const participant = await this.requireParticipant(
      stored.id,
      participantToken,
    );
    if (!participant.limitedQueueMode) {
      throw new InvalidParticipantTransitionError(
        'This player is not in a Limited queue.',
      );
    }
    await this.store.updateParticipant(participant.id, {
      status: ParticipantStatus.Joined,
      readyAt: null,
      limitedQueueMode: null,
      limitedQueuedAt: null,
    });
    return this.getSnapshot(joinCode);
  }

  async createLimitedSession(
    joinCode: string,
    hostToken: string,
    input: {
      mode: LimitedMode;
      participantCount?: number;
      allowUndersizedLaunch?: boolean;
      label?: string;
      draftTableIds?: string[];
    },
  ): Promise<PublicLimitedSession> {
    const stored = await this.requireHostToken(joinCode, hostToken);
    const config = requireEnabledLimitedConfig(stored, input.mode);
    return toPublicLimitedSession(
      await this.createLimitedSessionFromQueue(stored, config, {
        participantCount: input.participantCount,
        allowUndersizedLaunch: input.allowUndersizedLaunch,
        label: input.label,
        draftTableIds: input.draftTableIds,
        automatic: false,
      }),
    );
  }

  async launchLimitedSession(
    joinCode: string,
    hostToken: string,
    sessionId: string,
  ): Promise<PublicLimitedSession> {
    const event = await this.requireHostToken(joinCode, hostToken);
    const session = await this.requireLimitedSession(event.id, sessionId);
    if (session.status !== 'FORMING') {
      throw new InvalidParticipantTransitionError(
        'Only a forming Limited session can be launched.',
      );
    }
    try {
      validateLimitedCohortSize(
        session.mode,
        session.participants.filter(
          (participant) => participant.status !== 'DROPPED',
        ).length,
        {
          allowUndersizedLaunch: session.allowUndersizedLaunch,
          preferredCohortSize: session.preferredCohortSize ?? undefined,
          minCohortSize: session.minCohortSize,
          maxCohortSize: session.maxCohortSize ?? undefined,
        },
      );
    } catch (error) {
      throw new InvalidEventInputError(
        error instanceof Error ? error.message : 'Invalid Limited cohort.',
      );
    }
    const updated = await this.store.updateLimitedSessionPhase(session.id, {
      status: 'SEATING',
      startedAt: this.now(),
    });
    await this.track(event.id, 'limited_phase_changed');
    return toPublicLimitedSession(updated);
  }

  async replaceLimitedSessionRoster(
    joinCode: string,
    hostToken: string,
    sessionId: string,
    participantIds: string[],
  ): Promise<PublicLimitedSession> {
    const event = await this.requireHostToken(joinCode, hostToken);
    const session = await this.requireLimitedSession(event.id, sessionId);
    if (session.status !== 'FORMING') {
      throw new InvalidParticipantTransitionError(
        'Only a forming Limited session can change its roster.',
      );
    }
    if (new Set(participantIds).size !== participantIds.length) {
      throw new InvalidEventInputError(
        'A Limited roster cannot contain the same player twice.',
      );
    }
    const hardMaximum = limitedModeConfig(session.mode).maxCohortSize;
    const maximum =
      hardMaximum === undefined
        ? session.maxCohortSize ?? undefined
        : Math.min(session.maxCohortSize ?? hardMaximum, hardMaximum);
    if (
      participantIds.length < 1 ||
      (maximum !== undefined && participantIds.length > maximum)
    ) {
      throw new InvalidEventInputError(
        maximum === undefined
          ? 'A forming Limited roster needs at least one player.'
          : `A forming Limited roster supports between 1 and ${maximum} players.`,
      );
    }
    const currentIds = new Set(
      session.participants.map((participant) => participant.participantId),
    );
    const people = await this.store.listParticipants(event.id);
    const eligibleIds = new Set(
      people
        .filter(
          (participant) =>
            currentIds.has(participant.id) ||
            participant.limitedQueueMode === session.mode,
        )
        .map((participant) => participant.id),
    );
    if (participantIds.some((participantId) => !eligibleIds.has(participantId))) {
      throw new InvalidEventInputError(
        'Added players must be waiting in this Limited mode queue.',
      );
    }
    const seats =
      session.mode === 'SEALED'
        ? new Map<string, number>()
        : new Map(
            deterministicDraftSeats(participantIds).map((seat) => [
              seat.participantId,
              seat.seat,
            ]),
          );
    const updated = await this.store.replaceLimitedSessionRoster(
      session.id,
      participantIds.map((participantId) => ({
        participantId,
        draftSeat: seats.get(participantId),
      })),
    );
    await this.track(event.id, 'limited_host_override');
    return toPublicLimitedSession(updated, this.now());
  }

  async replaceLimitedDraftTables(
    joinCode: string,
    hostToken: string,
    sessionId: string,
    tableIds: string[],
  ): Promise<PublicLimitedSession> {
    const event = await this.requireHostToken(joinCode, hostToken);
    const session = await this.requireLimitedSession(event.id, sessionId);
    if (session.mode === 'SEALED') {
      throw new InvalidEventInputError(
        'Sealed sessions do not use draft-table reservations.',
      );
    }
    const updated = await this.store.replaceLimitedDraftTables(
      session.id,
      tableIds,
    );
    await this.track(event.id, 'limited_host_override');
    return toPublicLimitedSession(updated, this.now());
  }

  async advanceLimitedSession(
    joinCode: string,
    hostToken: string,
    sessionId: string,
    status: LimitedSessionStatus,
    durationSeconds?: number,
  ): Promise<PublicLimitedSession> {
    const event = await this.requireHostToken(joinCode, hostToken);
    const session = await this.requireLimitedSession(event.id, sessionId);
    const allowed = nextLimitedPhases(session);
    if (!allowed.includes(status)) {
      throw new InvalidParticipantTransitionError(
        `Limited session cannot move from ${session.status} to ${status}.`,
      );
    }
    const config = requireLimitedConfig(event, session.mode);
    const timer =
      status === 'DECKBUILDING'
        ? startLimitedTimer(
            'DECKBUILDING',
            durationSeconds ?? config.deckbuildingMinutes * 60,
            this.now().toISOString(),
          )
        : status === 'DRAFTING'
          ? startLimitedTimer(
              'DRAFTING',
              durationSeconds ?? (config.draftMinutes ?? 50) * 60,
              this.now().toISOString(),
            )
          : null;
    const updated = await this.store.updateLimitedSessionPhase(session.id, {
      status,
      timer,
    });
    await this.track(event.id, 'limited_phase_changed');
    return toPublicLimitedSession(updated);
  }

  async updateLimitedTimer(
    joinCode: string,
    hostToken: string,
    sessionId: string,
    action: 'START' | 'PAUSE' | 'RESUME' | 'ADD',
    input: { durationSeconds?: number; seconds?: number; phase?: LimitedTimerPhase },
  ): Promise<PublicLimitedSession> {
    const event = await this.requireHostToken(joinCode, hostToken);
    const session = await this.requireLimitedSession(event.id, sessionId);
    const now = this.now().toISOString();
    const expectedPhase = timerPhaseForStatus(session.status);
    if (!expectedPhase) {
      throw new InvalidParticipantTransitionError(
        'This Limited phase does not use an authoritative timer.',
      );
    }
    let timer = session.timer;
    try {
      if (action === 'START') {
        const phase = input.phase ?? expectedPhase;
        if (phase !== expectedPhase || !input.durationSeconds) {
          throw new Error('Starting a timer requires a phase and duration.');
        }
        timer = startLimitedTimer(phase, input.durationSeconds, now);
      } else {
        if (!timer) throw new Error('This Limited session has no active timer.');
        timer =
          action === 'PAUSE'
            ? pauseLimitedTimer(timer, now)
            : action === 'RESUME'
              ? resumeLimitedTimer(timer, now)
              : addLimitedTimerSeconds(timer, input.seconds ?? 0);
      }
    } catch (error) {
      throw new InvalidEventInputError(
        error instanceof Error ? error.message : 'Invalid Limited timer action.',
      );
    }
    const updated = await this.store.updateLimitedSessionPhase(session.id, {
      status: session.status,
      timer,
    });
    await this.track(event.id, 'limited_host_override');
    return toPublicLimitedSession(updated);
  }

  async startLimitedRound(
    joinCode: string,
    hostToken: string,
    sessionId: string,
  ): Promise<PublicLimitedSession> {
    const event = await this.requireHostToken(joinCode, hostToken);
    const session = await this.requireLimitedSession(event.id, sessionId);
    if (
      session.status !== 'BETWEEN_ROUNDS' &&
      session.status !== 'DECKBUILDING'
    ) {
      throw new InvalidParticipantTransitionError(
        'A Limited round can only start after deckbuilding or between rounds.',
      );
    }
    const previousRound = session.rounds.at(-1);
    if (
      previousRound &&
      previousRound.matches.some((match) => match.status !== 'COMPLETED')
    ) {
      throw new InvalidParticipantTransitionError(
        'Finish every match before starting the next round.',
      );
    }
    const roundNumber = (session.currentRound ?? 0) + 1;
    if (roundNumber > session.totalRounds) {
      throw new InvalidParticipantTransitionError(
        'All configured Limited rounds have already been played.',
      );
    }
    const paired = pairLimitedRound({
      sessionId: session.id,
      mode: session.mode,
      roundNumber,
      participants: session.participants.map((participant) => ({
        participantId: participant.participantId,
        displayName: participant.displayName,
        dropped: participant.status === 'DROPPED',
      })),
      previousMatches: session.rounds.flatMap((round) =>
        round.matches.map(toLimitedMatch),
      ),
      bestOf: session.matchStructure === 'BO1' ? 1 : 3,
    });
    const draftTableIds = new Set(session.draftTableIds);
    const tables = (await this.store.listTables(event.id))
      .filter(
        (table) =>
          table.status === PhysicalTableStatus.Free ||
          draftTableIds.has(table.id),
      )
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
      );
    const tableMatches = paired.matches.filter((match) => match.playerBId);
    if (tables.length < tableMatches.length) {
      throw new InvalidParticipantTransitionError(
        `Starting this round needs ${tableMatches.length} free tables.`,
      );
    }
    let tableIndex = 0;
    const now = this.now();
    await this.store.createLimitedRound({
      sessionId: session.id,
      number: roundNumber,
      status: 'ACTIVE',
      startedAt: now,
      matches: paired.matches.map((match) => {
        const table = match.playerBId ? tables[tableIndex++] : undefined;
        return {
          position: match.position,
          playerAId: match.playerAId,
          playerBId: match.playerBId,
          tableId: table?.id,
          status: match.status === 'COMPLETED' ? 'COMPLETED' : 'PLAYING',
          bestOf: match.bestOf === 1 ? 1 : 3,
          outcome: match.outcome,
          playerAGameWins: match.playerAGameWins,
          playerBGameWins: match.playerBGameWins,
          reportedAt: match.outcome ? now : undefined,
        };
      }),
    });
    const config = requireLimitedConfig(event, session.mode);
    await this.store.updateLimitedSessionPhase(session.id, {
      status: 'ROUND_ACTIVE',
      currentRound: roundNumber,
      timer: startLimitedTimer(
        'ROUND',
        config.roundMinutes * 60,
        now.toISOString(),
      ),
    });
    await this.track(event.id, 'limited_round_created');
    await this.track(event.id, 'limited_phase_changed');
    return toPublicLimitedSession(
      (await this.store.findLimitedSessionById(session.id))!,
    );
  }

  async reportLimitedResult(
    joinCode: string,
    participantToken: string,
    sessionId: string,
    matchId: string,
    result: LimitedResultInput,
  ): Promise<PublicLimitedSession> {
    const event = await this.requireByJoinCode(joinCode);
    const reporter = await this.requireParticipant(
      event.id,
      participantToken,
    );
    const session = await this.requireLimitedSession(event.id, sessionId);
    if (session.status !== 'ROUND_ACTIVE') {
      throw new InvalidParticipantTransitionError(
        'Results can only be reported during an active Limited round.',
      );
    }
    const match = requireLimitedMatch(session, matchId);
    if (
      reporter.id !== match.playerAId &&
      reporter.id !== match.playerBId
    ) {
      throw new InvalidParticipantTransitionError(
        'Only a player paired in this match can report its result.',
      );
    }
    if (match.outcome) {
      throw new InvalidParticipantTransitionError(
        'Only the host can correct a reported Limited result.',
      );
    }
    validateLimitedResult(match, result);
    await this.store.finalizeLimitedMatchResult({
      matchId,
      ...result,
      reportedAt: this.now(),
      correctedByParticipantId: reporter.id,
    });
    await this.track(event.id, 'limited_result_reported');
    return this.progressLimitedRound(event.id, session.id);
  }

  async correctLimitedResult(
    joinCode: string,
    hostToken: string,
    sessionId: string,
    matchId: string,
    result: LimitedResultInput & { correctionReason: string },
  ): Promise<PublicLimitedSession> {
    const event = await this.requireHostToken(joinCode, hostToken);
    const session = await this.requireLimitedSession(event.id, sessionId);
    const match = requireLimitedMatch(session, matchId);
    if (!match.outcome || !result.correctionReason.trim()) {
      throw new InvalidEventInputError(
        'A host correction requires an existing result and a reason.',
      );
    }
    validateLimitedResult(match, result);
    await this.store.finalizeLimitedMatchResult({
      matchId,
      ...result,
      correctionReason: result.correctionReason.trim(),
      reportedAt: this.now(),
    });
    await this.track(event.id, 'limited_result_corrected');
    return this.progressLimitedRound(event.id, session.id);
  }

  async dropLimitedPlayer(
    joinCode: string,
    token: string,
    sessionId: string,
    participantId?: string,
  ): Promise<PublicLimitedSession> {
    const event = await this.requireByJoinCode(joinCode);
    let dropId: string;
    if (participantId) {
      await this.requireHostToken(joinCode, token);
      dropId = participantId;
    } else {
      dropId = (await this.requireParticipant(event.id, token)).id;
    }
    const session = await this.requireLimitedSession(event.id, sessionId);
    if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
      throw new InvalidParticipantTransitionError(
        'A completed Limited session cannot accept drops.',
      );
    }
    const member = session.participants.find(
      (participant) => participant.participantId === dropId,
    );
    if (!member || member.status === 'DROPPED') {
      throw new InvalidParticipantTransitionError(
        'That player is not active in this Limited session.',
      );
    }
    await this.store.dropLimitedParticipant(session.id, dropId, this.now());
    const activeMatch = session.rounds
      .at(-1)
      ?.matches.find(
        (match) =>
          match.status !== 'COMPLETED' &&
          (match.playerAId === dropId || match.playerBId === dropId),
      );
    if (activeMatch?.playerBId) {
      const wins = activeMatch.bestOf === 1 ? 1 : 2;
      await this.store.finalizeLimitedMatchResult({
        matchId: activeMatch.id,
        outcome:
          activeMatch.playerAId === dropId
            ? 'PLAYER_B_WIN'
            : 'PLAYER_A_WIN',
        playerAGameWins: activeMatch.playerAId === dropId ? 0 : wins,
        playerBGameWins: activeMatch.playerAId === dropId ? wins : 0,
        correctionReason: 'Automatic forfeit after player drop',
        reportedAt: this.now(),
      });
    }
    await this.track(event.id, 'limited_participant_dropped');
    const afterDrop = await this.requireLimitedSession(event.id, session.id);
    if (
      afterDrop.participants.filter(
        (participant) => participant.status !== 'DROPPED',
      ).length < 2
    ) {
      const completed = await this.store.finishLimitedSession(
        session.id,
        'COMPLETED',
        this.now(),
      );
      await this.track(event.id, 'limited_session_completed');
      return toPublicLimitedSession(completed);
    }
    return this.progressLimitedRound(event.id, session.id);
  }

  async cancelLimitedSession(
    joinCode: string,
    hostToken: string,
    sessionId: string,
  ): Promise<PublicLimitedSession> {
    const event = await this.requireHostToken(joinCode, hostToken);
    const session = await this.requireLimitedSession(event.id, sessionId);
    if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
      return toPublicLimitedSession(session);
    }
    const cancelled = await this.store.finishLimitedSession(
      session.id,
      'CANCELLED',
      this.now(),
    );
    await this.track(event.id, 'limited_phase_changed');
    return toPublicLimitedSession(cancelled);
  }

  async completeLimitedSession(
    joinCode: string,
    hostToken: string,
    sessionId: string,
  ): Promise<PublicLimitedSession> {
    const event = await this.requireHostToken(joinCode, hostToken);
    const session = await this.requireLimitedSession(event.id, sessionId);
    if (session.status === 'COMPLETED' || session.status === 'CANCELLED') {
      return toPublicLimitedSession(session, this.now());
    }
    const completed = await this.store.finishLimitedSession(
      session.id,
      'COMPLETED',
      this.now(),
    );
    await this.track(event.id, 'limited_session_completed');
    await this.track(event.id, 'limited_host_override');
    return toPublicLimitedSession(completed, this.now());
  }

  async startTournament(
    joinCode: string,
    hostToken: string,
  ): Promise<PublicEvent> {
    const stored = await this.requireHostToken(joinCode, hostToken);
    const registration = this.requireTournament(stored);
    if (registration.phase !== 'registration') {
      throw new InvalidParticipantTransitionError(
        'This tournament has already started.',
      );
    }
    const people = await this.store.listParticipants(stored.id);
    const allowBots = Boolean(this.options.isDev);
    const entrantIds = people
      .filter(
        (person) =>
          (allowBots || !person.isBot) &&
          person.status === ParticipantStatus.Ready &&
          !person.limitedQueueMode,
      )
      .map((person) => person.id);
    if (entrantIds.length < 2) {
      throw new InvalidParticipantTransitionError(
        'At least two ready players are required to start a tournament.',
      );
    }
    let tournamentState: TournamentState;
    try {
      tournamentState = startTournament(
        registration,
        entrantIds,
        this.now().toISOString(),
      );
    } catch (error) {
      throw new InvalidEventInputError(
        error instanceof Error ? error.message : 'Could not start tournament.',
      );
    }
    await this.store.updateEvent(stored.id, { tournamentState });
    await this.scheduleTournamentMatches(stored.id, tournamentState);
    const updated = await this.store.findEventById(stored.id);
    if (!updated) {
      throw new EventNotFoundError();
    }
    return this.presentEvent(updated);
  }

  async reportTournamentResult(
    joinCode: string,
    hostToken: string,
    matchId: string,
    winnerParticipantId: string,
  ): Promise<PublicEvent> {
    const stored = await this.requireHostToken(joinCode, hostToken);
    const tournamentState = this.requireTournament(stored);
    const match = tournamentState.rounds
      .flatMap((round) => round.matches)
      .find((candidate) => candidate.id === matchId);
    if (
      !match?.podId ||
      !match.tableId ||
      match.status !== 'playing'
    ) {
      throw new InvalidParticipantTransitionError(
        'That tournament match is not ready for a result.',
      );
    }
    if (!match.participantIds.includes(winnerParticipantId)) {
      throw new InvalidEventInputError(
        'The winner must be a player in this tournament match.',
      );
    }
    const pod = await this.store.findActivePodByTableId(
      stored.id,
      match.tableId,
    );
    if (!pod || pod.id !== match.podId) {
      throw new PodNotFoundError();
    }
    const winsNeeded = Math.ceil(match.bestOf / 2);
    const seriesComplete =
      (match.seriesWins?.[winnerParticipantId] ?? 0) + 1 >= winsNeeded;
    await this.store.completePod(pod.id, {
      winnerParticipantId,
      requeue: !seriesComplete,
    });
    const recorded = recordTournamentGame(
      tournamentState,
      matchId,
      winnerParticipantId,
      this.now().toISOString(),
    );
    const next = recorded.state;
    await this.store.updateEvent(stored.id, { tournamentState: next });
    await this.scheduleTournamentMatches(stored.id, next);
    await this.track(stored.id, 'game_finished');
    const updated = await this.store.findEventById(stored.id);
    if (!updated) {
      throw new EventNotFoundError();
    }
    return this.presentEvent(updated);
  }

  async setTournamentMatchBestOf(
    joinCode: string,
    hostToken: string,
    matchId: string,
    bestOf: SeriesLength,
  ): Promise<PublicEvent> {
    const stored = await this.requireHostToken(joinCode, hostToken);
    let tournamentState: TournamentState;
    try {
      tournamentState = setTournamentMatchBestOf(
        this.requireTournament(stored),
        matchId,
        bestOf,
      );
    } catch (error) {
      throw new InvalidEventInputError(
        error instanceof Error ? error.message : 'Could not update series length.',
      );
    }
    await this.store.updateEvent(stored.id, { tournamentState });
    const updated = await this.store.findEventById(stored.id);
    if (!updated) {
      throw new EventNotFoundError();
    }
    return this.presentEvent(updated);
  }

  async listTables(joinCode: string): Promise<PublicTable[]> {
    const stored = await this.requireByJoinCode(joinCode);
    return this.listTablesByEventId(stored.id);
  }

  async addTables(
    joinCode: string,
    hostToken: string,
    input: AddTablesInput,
  ): Promise<PublicTable[]> {
    const stored = await this.requireHostToken(joinCode, hostToken);
    const existing = await this.store.listTables(stored.id);
    const labels = resolveTableLabels(input, existing.length);
    const created: PublicTable[] = [];
    for (const [index, label] of labels.entries()) {
      const row = await this.store.insertTable({
        eventId: stored.id,
        label,
        sortOrder: existing.length + index,
      });
      created.push(toPublicTable(row, []));
    }
    return created;
  }

  async setTableStatus(
    joinCode: string,
    hostToken: string,
    tableId: string,
    status: 'free' | 'disabled',
  ): Promise<PublicTable> {
    const stored = await this.requireHostToken(joinCode, hostToken);
    const table = await this.store.findTableById(tableId);
    if (!table || table.eventId !== stored.id) {
      throw new TableNotFoundError();
    }
    if (table.status === PhysicalTableStatus.Occupied) {
      throw new InvalidParticipantTransitionError(
        'An occupied table cannot be changed until the pod is finished.',
      );
    }
    const next =
      status === 'disabled'
        ? PhysicalTableStatus.Disabled
        : PhysicalTableStatus.Free;
    const updated = await this.store.updateTableStatus(table.id, next);
    return toPublicTable(updated, []);
  }

  async startTable(
    joinCode: string,
    hostToken: string,
    tableId: string,
  ): Promise<PublicTable> {
    const stored = await this.requireHostToken(joinCode, hostToken);
    await this.requireTable(stored.id, tableId);
    const pod = await this.store.findActivePodByTableId(stored.id, tableId);
    if (!pod) {
      throw new PodNotFoundError();
    }
    if (pod.status !== 'formed') {
      throw new InvalidParticipantTransitionError(
        'Only a seated pod that has not started can begin playing.',
      );
    }
    await this.store.startPod(pod.id);
    if (stored.tournamentState && pod.tournamentMatchId) {
      await this.store.updateEvent(stored.id, {
        tournamentState: markTournamentMatchPlaying(
          stored.tournamentState,
          pod.tournamentMatchId,
        ),
      });
    }
    await this.track(stored.id, 'match_confirmed');
    return this.snapshotTable(stored.id, tableId);
  }

  async chooseTracker(
    joinCode: string,
    participantToken: string,
    trackerUsed: boolean,
  ): Promise<PublicParticipant> {
    const stored = await this.requireByJoinCode(joinCode);
    const participant = await this.requireParticipant(
      stored.id,
      participantToken,
    );
    if (participant.status !== ParticipantStatus.Playing) {
      return this.present(participant);
    }
    const assignments = await this.store.listAssignments(stored.id);
    const seat = assignments.find(
      (row) => row.participantId === participant.id,
    );
    if (!seat) {
      return this.present(participant);
    }
    // Once any phone opens the tracker the pod used it, even if another phone
    // reports "without tracker" a moment later.
    const measuredUse = seat.trackerUsed === true || trackerUsed;
    await this.store.setPodTrackerUsed(seat.podId, measuredUse);
    await this.track(
      stored.id,
      measuredUse ? 'game_tracker_started' : 'game_tracker_skipped',
    );
    const updatedSeat = { ...seat, trackerUsed: measuredUse };
    return this.present(participant, updatedSeat);
  }

  async completeChallenge(
    joinCode: string,
    participantToken: string,
    input: {
      challengeId: string;
      targetParticipantId: string;
      source: 'automatic' | 'confirmation' | 'manual';
      confirmed?: boolean;
    },
  ): Promise<{
    completion: PublicChallengeCompletion;
    created: boolean;
  }> {
    const stored = await this.requireByJoinCode(joinCode);
    const pack = await this.resolvePack(stored);
    const reporter = await this.requireParticipant(stored.id, participantToken);
    const challenge = challengeInPack(pack, input.challengeId);
    if (!challenge || challenge.detectionMode !== input.source) {
      throw new InvalidEventInputError('That challenge claim is not valid.');
    }
    if (challenge.detectionMode === 'confirmation' && input.confirmed !== true) {
      throw new InvalidEventInputError(
        'This challenge needs confirmation from the table.',
      );
    }
    const [assignments, target, games] = await Promise.all([
      this.store.listAssignments(stored.id),
      this.store.findParticipantById(input.targetParticipantId),
      this.store.listCompletedGames(stored.id),
    ]);
    const reporterSeat = assignments.find(
      (row) => row.participantId === reporter.id,
    );
    const targetSeat = assignments.find(
      (row) => row.participantId === input.targetParticipantId,
    );
    const activePodId =
      reporterSeat &&
      targetSeat &&
      reporterSeat.podId === targetSeat.podId
        ? reporterSeat.podId
        : undefined;
    const finishedPodId = latestSharedGame(
      games,
      reporter.id,
      input.targetParticipantId,
    )?.id;
    const podId = activePodId ?? finishedPodId;
    if (
      !podId ||
      !target ||
      target.eventId !== stored.id ||
      target.isBot
    ) {
      throw new InvalidEventInputError(
        'Challenges can only be awarded to a player in this pod.',
      );
    }
    const scopeKey =
      challenge.repeatRule === 'once-per-event'
        ? 'event'
        : challenge.repeatRule === 'once-per-game'
          ? podId
          : `${podId}:${randomUUID()}`;
    const result = await this.store.insertChallengeCompletion({
      eventId: stored.id,
      participantId: target.id,
      podId,
      challengeId: challenge.id,
      scopeKey,
      points: challenge.points,
    });
    if (result.created) {
      await this.track(stored.id, 'challenge_completed');
    }
    return result;
  }

  async reportGameResult(
    joinCode: string,
    participantToken: string,
    input: { winnerParticipantId: string; durationSeconds?: number },
  ): Promise<PublicParticipant> {
    const stored = await this.requireByJoinCode(joinCode);
    const participant = await this.requireParticipant(
      stored.id,
      participantToken,
    );
    if (participant.status !== ParticipantStatus.Playing) {
      return this.present(participant);
    }
    const assignments = await this.store.listAssignments(stored.id);
    const seat = assignments.find(
      (row) => row.participantId === participant.id,
    );
    if (!seat) {
      return this.present(participant);
    }
    const pod = await this.store.findActivePodByTableId(
      stored.id,
      seat.tableId,
    );
    if (!pod) {
      return this.present(participant);
    }
    if (!pod.memberIds.includes(input.winnerParticipantId)) {
      throw new InvalidEventInputError(
        'The winner must be a player in this pod.',
      );
    }
    const durationSeconds =
      input.durationSeconds === undefined
        ? undefined
        : Math.max(0, Math.min(24 * 60 * 60, Math.round(input.durationSeconds)));
    if (pod.tournamentMatchId) {
      const tournamentState = this.requireTournament(stored);
      const match = tournamentState.rounds
        .flatMap((round) => round.matches)
        .find((candidate) => candidate.id === pod.tournamentMatchId);
      const winsNeeded = Math.ceil((match?.bestOf ?? 1) / 2);
      const seriesComplete =
        (match?.seriesWins?.[input.winnerParticipantId] ?? 0) + 1 >=
        winsNeeded;
      await this.store.completePod(pod.id, {
        winnerParticipantId: input.winnerParticipantId,
        durationSeconds,
        requeue: !seriesComplete,
      });
      const recorded = recordTournamentGame(
        tournamentState,
        pod.tournamentMatchId,
        input.winnerParticipantId,
        this.now().toISOString(),
      );
      await this.store.updateEvent(stored.id, {
        tournamentState: recorded.state,
      });
      await this.scheduleTournamentMatches(stored.id, recorded.state);
    } else {
      try {
        await this.store.completePod(pod.id, {
          winnerParticipantId: input.winnerParticipantId,
          durationSeconds,
          requeue: true,
        });
      } catch (error) {
        if (!(error instanceof PodNotFoundError)) {
          throw error;
        }
      }
    }
    await this.track(stored.id, 'game_finished');
    if (!pod.tournamentMatchId) {
      await this.track(stored.id, 'requeued');
    }
    const updated = await this.store.findParticipantById(participant.id);
    if (!updated) {
      throw new InvalidParticipantSessionError();
    }
    return this.present(updated);
  }

  async finishTable(
    joinCode: string,
    hostToken: string,
    tableId: string,
  ): Promise<PublicTable> {
    const stored = await this.requireHostToken(joinCode, hostToken);
    await this.requireTable(stored.id, tableId);
    const pod = await this.store.findActivePodByTableId(stored.id, tableId);
    if (!pod) {
      throw new PodNotFoundError();
    }
    if (pod.tournamentMatchId) {
      throw new InvalidParticipantTransitionError(
        'Choose a winner for this tournament match instead of finishing it.',
      );
    }
    await this.store.completePod(pod.id);
    await this.track(stored.id, 'game_finished');
    await this.track(stored.id, 'requeued');
    return this.snapshotTable(stored.id, tableId);
  }

  async cancelTable(
    joinCode: string,
    hostToken: string,
    tableId: string,
  ): Promise<PublicTable> {
    const stored = await this.requireHostToken(joinCode, hostToken);
    await this.requireTable(stored.id, tableId);
    const pod = await this.store.findActivePodByTableId(stored.id, tableId);
    if (!pod) {
      throw new PodNotFoundError();
    }
    await this.store.cancelPod(pod.id);
    if (stored.tournamentState && pod.tournamentMatchId) {
      const tournamentState = cancelTournamentMatch(
        stored.tournamentState,
        pod.tournamentMatchId,
      );
      await this.store.updateEvent(stored.id, { tournamentState });
      await this.scheduleTournamentMatches(stored.id, tournamentState);
    }
    return this.snapshotTable(stored.id, tableId);
  }

  async updateMatchSettings(
    joinCode: string,
    hostToken: string,
    patch: {
      allowThreePods?: boolean;
      allowFivePods?: boolean;
      preferredPodSize?: number;
      lifetimeHours?: number;
    },
  ): Promise<PublicEvent> {
    const stored = await this.requireHostToken(joinCode, hostToken);
    const preferredPodSize =
      patch.preferredPodSize === undefined
        ? stored.preferredPodSize
        : assertPreferredPodSize(stored.gameMode, patch.preferredPodSize);
    const allowFivePods =
      stored.gameMode === 'treachery' ||
      stored.gameMode === 'assassin' ||
      stored.gameMode === 'multiplayer'
        ? preferredPodSize >= 5
        : stored.gameMode === 'commander'
          ? true
          : false;
    const expiresAt =
      patch.lifetimeHours === undefined
        ? stored.expiresAt
        : new Date(
            stored.createdAt.getTime() +
              assertLifetimeHours(patch.lifetimeHours) * 60 * 60 * 1000,
          );
    const updated = await this.store.updateEvent(stored.id, {
      allowThreePods:
        stored.gameMode === 'assassin' ||
        stored.gameMode === 'multiplayer' ||
        stored.gameMode === 'commander'
          ? true
          : stored.gameMode === 'treachery' || stored.gameMode === 'duel'
            ? false
            : patch.allowThreePods === undefined
              ? stored.allowThreePods
              : Boolean(patch.allowThreePods),
      allowFivePods,
      preferredPodSize,
      expiresAt,
    });
    return this.presentEvent(updated);
  }

  async cancelEvent(joinCode: string, hostToken: string): Promise<PublicEvent> {
    const stored = await this.requireHostToken(joinCode, hostToken);
    if (stored.status === EventStatus.Closed) {
      return this.presentEvent(stored);
    }

    const [assignments, people, limitedSessions] = await Promise.all([
      this.store.listAssignments(stored.id),
      this.store.listParticipants(stored.id),
      this.store.listLimitedSessions(stored.id),
    ]);
    const cancelledPods = new Set<string>();
    for (const seat of assignments) {
      if (cancelledPods.has(seat.podId)) {
        continue;
      }
      cancelledPods.add(seat.podId);
      try {
        await this.store.cancelPod(seat.podId);
      } catch (error) {
        if (!(error instanceof PodNotFoundError)) {
          throw error;
        }
      }
    }
    for (const session of limitedSessions) {
      if (session.status !== 'COMPLETED' && session.status !== 'CANCELLED') {
        await this.store.finishLimitedSession(
          session.id,
          'CANCELLED',
          this.now(),
        );
      }
    }
    for (const person of people) {
      if (person.status === ParticipantStatus.Left) {
        continue;
      }
      await this.store.updateParticipant(person.id, {
        status: ParticipantStatus.Left,
        readyAt: null,
      });
    }

    let tournamentState = stored.tournamentState
      ? normalizeTournamentState(stored.tournamentState)
      : null;
    if (tournamentState && tournamentState.phase !== 'completed') {
      tournamentState = {
        ...tournamentState,
        phase: 'completed',
        completedAt: this.now().toISOString(),
      };
    }

    const updated = await this.store.updateEvent(stored.id, {
      status: EventStatus.Closed,
      expiresAt: this.now(),
      tournamentState,
    });
    return this.presentEvent(updated);
  }

  async saveChallengePack(
    joinCode: string,
    hostToken: string,
    input: { mode: 'copy-official' | 'from-scratch' | 'save'; pack?: unknown },
  ): Promise<PublicEvent> {
    const stored = await this.requireHostToken(joinCode, hostToken);
    const packId = privatePackId(stored.id);
    let pack: ChallengePack;
    if (input.mode === 'copy-official') {
      pack = cloneOfficialPack(packId);
    } else if (input.mode === 'from-scratch') {
      pack = emptyPrivatePack(packId);
    } else {
      let parsed: ChallengePack;
      try {
        parsed = parseChallengePack(input.pack);
      } catch (error) {
        throw new InvalidEventInputError(
          error instanceof Error ? error.message : 'That pack cannot be saved.',
        );
      }
      const nextId =
        parsed.id === OFFICIAL_COMMANDER_CHALLENGES.id ? packId : parsed.id;
      const nextVersion =
        stored.challengePackId === nextId
          ? stored.challengePackVersion + 1
          : 1;
      pack = {
        ...parsed,
        id: nextId,
        version: nextVersion,
        visibility: 'private',
      };
    }
    await this.store.insertChallengePackVersion(stored.id, pack);
    const updated = await this.store.updateEvent(stored.id, {
      challengePackId: pack.id,
      challengePackVersion: pack.version,
    });
    return this.presentEvent(updated);
  }

  async getMetrics(
    joinCode: string,
    hostToken: string,
  ): Promise<EventMetrics> {
    const stored = await this.requireHostToken(joinCode, hostToken);
    const [people, tables, games, completions, sessions, resultAudits] =
      await Promise.all([
      this.store.listParticipants(stored.id),
      this.store.listTables(stored.id),
      this.store.listCompletedGames(stored.id),
      this.store.listChallengeCompletions(stored.id),
      this.store.listLimitedSessions(stored.id),
      this.store.listLimitedResultAudits(stored.id),
    ]);
    const queueWaits = sessions.flatMap((session) =>
      session.participants.flatMap((participant) =>
        participant.assignedAt
          ? [
              Math.max(
                0,
                Math.round(
                  (participant.assignedAt.getTime() -
                    participant.joinedAt.getTime()) /
                    1000,
                ),
              ),
            ]
          : [],
      ),
    );
    const formationDurations = sessions.flatMap((session) =>
      session.startedAt
        ? [
            Math.max(
              0,
              Math.round(
                (session.startedAt.getTime() - session.createdAt.getTime()) /
                  1000,
              ),
            ),
          ]
        : [],
    );
    const roundDurations = sessions.flatMap((session) =>
      session.rounds.flatMap((round) =>
        round.startedAt && round.completedAt
          ? [
              Math.max(
                0,
                Math.round(
                  (round.completedAt.getTime() - round.startedAt.getTime()) /
                    1000,
                ),
              ),
            ]
          : [],
      ),
    );
    return computeEventMetrics({
      participants: people,
      tables,
      games,
      challengeCompletions: completions,
      limited: {
        sessions: sessions.length,
        completedSessions: sessions.filter(
          (session) => session.status === 'COMPLETED',
        ).length,
        cancelledSessions: sessions.filter(
          (session) => session.status === 'CANCELLED',
        ).length,
        droppedParticipants: sessions.reduce(
          (count, session) =>
            count +
            session.participants.filter(
              (participant) => participant.status === 'DROPPED',
            ).length,
          0,
        ),
        undersizedLaunches: sessions.filter(
          (session) =>
            session.allowUndersizedLaunch &&
            session.preferredCohortSize !== null &&
            session.participants.length < session.preferredCohortSize,
        ).length,
        resultCorrections: resultAudits.filter(
          (audit) => audit.previousOutcome !== null,
        ).length,
        averageCohortSize:
          sessions.length === 0
            ? null
            : sessions.reduce(
                (sum, session) => sum + session.participants.length,
                0,
              ) / sessions.length,
        queueWaitSeconds: summarizeLimitedMetric(queueWaits),
        formationSeconds: averageLimitedMetric(formationDurations),
        roundDurationSeconds: averageLimitedMetric(roundDurations),
      },
    });
  }

  async rateLastPod(
    joinCode: string,
    participantToken: string,
    rating: PodRating,
  ): Promise<{ rating: PodRating; alreadyRecorded: boolean }> {
    const stored = await this.requireByJoinCode(joinCode);
    const participant = await this.requireParticipant(
      stored.id,
      participantToken,
    );
    const games = await this.store.listCompletedGames(stored.id);
    const latest = games.find((game) =>
      game.memberIds.includes(participant.id),
    );
    if (!latest) {
      throw new PodNotFoundError();
    }
    if (latest.rating != null) {
      return { rating: clampRating(latest.rating), alreadyRecorded: true };
    }
    await this.store.setPodRating(latest.id, rating);
    await this.track(stored.id, 'pod_rated');
    return { rating, alreadyRecorded: false };
  }

  async matchNow(joinCode: string, hostToken: string): Promise<MatchResult> {
    const stored = await this.requireHostToken(joinCode, hostToken);
    if (stored.tournamentState) {
      if (stored.tournamentState.phase === 'registration') {
        throw new InvalidParticipantTransitionError(
          'Start the tournament before scheduling its matches.',
        );
      }
      const pods = await this.scheduleTournamentMatches(
        stored.id,
        stored.tournamentState,
      );
      return { pods, botsAdded: 0 };
    }
    const pods = await this.runMatch(stored.id);
    return { pods, botsAdded: 0 };
  }

  async fillTablesWithBots(
    joinCode: string,
    hostToken: string,
  ): Promise<MatchResult> {
    if (!this.options.isDev) {
      throw new DevToolsDisabledError();
    }
    const stored = await this.requireHostToken(joinCode, hostToken);
    const [tables, people] = await Promise.all([
      this.store.listTables(stored.id),
      this.store.listParticipants(stored.id),
    ]);
    const freeTables = tables.filter(
      (table) => table.status === PhysicalTableStatus.Free,
    );
    if (freeTables.length === 0) {
      throw new InvalidEventInputError(
        'Add free tables before filling them with bots.',
      );
    }

    const readyCount = people.filter(
      (row) =>
        row.status === ParticipantStatus.Ready && !row.limitedQueueMode,
    ).length;
    const matchOptions = eventMatchOptions(stored);
    const tournamentMatchSize = stored.tournamentState?.podSize;
    const seatsNeeded =
      freeTables.length *
      (tournamentMatchSize ?? matchOptions.preferredSize ?? 4);
    const botsToAdd =
      stored.tournamentState?.phase === 'in-progress'
        ? 0
        : Math.max(0, seatsNeeded - readyCount);
    const taken = new Set(
      people.map((row) => row.displayName.toLowerCase()),
    );

    const readyHumans = people.filter(
      (row) =>
        row.status === ParticipantStatus.Ready &&
        !row.isBot &&
        !row.limitedQueueMode,
    );
    const decks = await this.store.listDecks(stored.id);
    const botPoolId = majorityPreferredPool(
      decks,
      new Set(readyHumans.map((row) => row.id)),
    );

    for (let index = 0; index < botsToAdd; index += 1) {
      const bot = await this.store.insertParticipant({
        eventId: stored.id,
        displayName: nextBotName(taken),
        isBot: true,
        status: ParticipantStatus.Ready,
        readyAt: new Date(),
      });
      if (botPoolId) {
        await this.store.replaceDecks(bot.id, [
          {
            participantId: bot.id,
            name: null,
            poolId: botPoolId,
            preference: 'preferred',
            commanders: [],
          },
        ]);
      }
    }

    if (stored.tournamentState?.phase === 'registration') {
      return { pods: [], botsAdded: botsToAdd };
    }
    if (stored.tournamentState) {
      const pods = await this.scheduleTournamentMatches(
        stored.id,
        stored.tournamentState,
      );
      return { pods, botsAdded: botsToAdd };
    }

    const pods = await this.runMatch(stored.id);
    return { pods, botsAdded: botsToAdd };
  }

  private async limitedQueue(
    eventId: string,
    mode: LimitedMode,
  ): Promise<StoredParticipant[]> {
    return (await this.store.listParticipants(eventId))
      .filter((participant) => participant.limitedQueueMode === mode)
      .sort(compareLimitedQueueOrder);
  }

  private async createLimitedSessionFromQueue(
    event: StoredEvent,
    config: LimitedEventModeConfig,
    options: {
      participantCount?: number;
      allowUndersizedLaunch?: boolean;
      label?: string;
      draftTableIds?: string[];
      automatic: boolean;
    },
  ): Promise<StoredLimitedSession> {
    const queue = await this.limitedQueue(event.id, config.mode);
    const target =
      options.participantCount ??
      config.preferredCohortSize ??
      config.minCohortSize;
    if (!Number.isInteger(target) || target < 1 || queue.length < target) {
      throw new InvalidParticipantTransitionError(
        `The ${config.mode} queue does not have ${target} waiting players.`,
      );
    }
    const allowUndersizedLaunch =
      !options.automatic &&
      options.allowUndersizedLaunch === true &&
      config.allowUndersizedLaunch;
    try {
      validateLimitedCohortSize(config.mode, target, {
        allowUndersizedLaunch,
        preferredCohortSize: config.preferredCohortSize,
        minCohortSize: config.minCohortSize,
        maxCohortSize: config.maxCohortSize,
      });
    } catch (error) {
      throw new InvalidEventInputError(
        error instanceof Error ? error.message : 'Invalid Limited cohort.',
      );
    }
    const selected = queue.slice(0, target);
    const seats = config.mode === 'SEALED'
      ? new Map<string, number>()
      : new Map(
          deterministicDraftSeats(selected.map((person) => person.id)).map(
            (seat) => [seat.participantId, seat.seat],
          ),
        );
    const totalRounds =
      config.totalRounds === 'AUTO'
        ? defaultLimitedRounds(selected.length)
        : config.totalRounds;
    const sequence = (await this.store.listLimitedSessions(event.id)).filter(
      (session) => session.mode === config.mode,
    ).length + 1;
    const session = await this.store.createLimitedSession({
      eventId: event.id,
      mode: config.mode,
      label: options.label?.trim() || `${limitedModeLabel(config.mode)} ${sequence}`,
      matchStructure: config.matchStructure,
      pairingPolicy: limitedModeConfig(config.mode).pairingPolicy,
      preferredCohortSize: config.preferredCohortSize,
      minCohortSize: config.minCohortSize,
      maxCohortSize: config.maxCohortSize,
      allowUndersizedLaunch,
      totalRounds,
      participants: selected.map((person) => ({
        participantId: person.id,
        draftSeat: seats.get(person.id),
        queuedAt: person.limitedQueuedAt ?? undefined,
      })),
      draftTableIds: options.draftTableIds,
      createdAt: this.now(),
    });
    await this.track(event.id, 'limited_session_created');
    if (allowUndersizedLaunch) {
      await this.track(event.id, 'limited_host_override');
    }
    return session;
  }

  private async requireLimitedSession(
    eventId: string,
    sessionId: string,
  ): Promise<StoredLimitedSession> {
    const session = await this.store.findLimitedSessionById(sessionId);
    if (!session || session.eventId !== eventId) {
      throw new LimitedSessionNotFoundError();
    }
    return session;
  }

  private async progressLimitedRound(
    eventId: string,
    sessionId: string,
  ): Promise<PublicLimitedSession> {
    let session = await this.requireLimitedSession(eventId, sessionId);
    const round = session.rounds.find(
      (candidate) => candidate.number === session.currentRound,
    );
    if (
      !round ||
      round.matches.some((match) => match.status !== 'COMPLETED')
    ) {
      return toPublicLimitedSession(session);
    }
    if (round.status !== 'COMPLETED') {
      await this.store.updateLimitedRound(round.id, {
        status: 'COMPLETED',
        completedAt: this.now(),
      });
    }
    if (round.number >= session.totalRounds) {
      session = await this.store.finishLimitedSession(
        session.id,
        'COMPLETED',
        this.now(),
      );
      await this.track(eventId, 'limited_session_completed');
    } else {
      session = await this.store.updateLimitedSessionPhase(session.id, {
        status: 'BETWEEN_ROUNDS',
        timer: null,
      });
      await this.track(eventId, 'limited_phase_changed');
    }
    return toPublicLimitedSession(session);
  }

  private async scheduleTournamentMatches(
    eventId: string,
    initialState: TournamentState,
  ): Promise<PublicPod[]> {
    if (initialState.phase !== 'in-progress') {
      return [];
    }
    const [tables, decks, event] = await Promise.all([
      this.store.listTables(eventId),
      this.store.listDecks(eventId),
      this.store.findEventById(eventId),
    ]);
    if (!event) {
      throw new EventNotFoundError();
    }
    const pending =
      currentTournamentRound(initialState)?.matches.filter(
        (match) => match.status === 'pending',
      ) ?? [];
    const freeTables = tables.filter(
      (table) => table.status === PhysicalTableStatus.Free,
    );
    const byParticipant = decksMap(decks);
    let tournamentState = initialState;
    const created: PublicPod[] = [];

    for (let index = 0; index < Math.min(pending.length, freeTables.length); index += 1) {
      const match = pending[index];
      const table = freeTables[index];
      if (!match || !table) {
        continue;
      }
      const treacheryRoles =
        event.gameMode === 'treachery'
          ? assignTreacheryRoles(match.participantIds)
          : undefined;
      const treacheryIdentities = treacheryRoles
        ? assignTreacheryIdentities(treacheryRoles)
        : undefined;
      const pod = await this.store.createPod({
        eventId,
        tableId: table.id,
        poolId: 'tournament',
        tournamentMatchId: match.id,
        seats: match.participantIds.map((participantId) => {
          const options = byParticipant.get(participantId) ?? [];
          const deck =
            options.find((candidate) => candidate.preference === 'preferred') ??
            options[0];
          return {
            participantId,
            deckId: deck?.id ?? '',
            assignedPoolId: deck?.poolId ?? 'open',
            treacheryRole: treacheryRoles?.get(participantId),
            treacheryIdentityId: treacheryIdentities?.get(participantId),
          };
        }),
      });
      tournamentState = markTournamentMatchFormed(
        tournamentState,
        match.id,
        pod.id,
        table.id,
      );
      await this.store.updateEvent(eventId, { tournamentState });
      created.push({
        id: pod.id,
        tableLabel: pod.tableLabel,
        playerNames: pod.playerNames,
        status: pod.status,
        poolId: pod.poolId,
      });
    }
    if (created.length > 0) {
      await this.track(eventId, 'match_found');
    }
    return created;
  }

  private async runMatch(eventId: string): Promise<PublicPod[]> {
    const [tables, people, decks, history, event] = await Promise.all([
      this.store.listTables(eventId),
      this.store.listParticipants(eventId),
      this.store.listDecks(eventId),
      this.store.listMatchHistory(eventId),
      this.store.findEventById(eventId),
    ]);
    if (!event) {
      throw new EventNotFoundError();
    }
    const matchOptions = eventMatchOptions(event);
    const freeTables = tables.filter(
      (table) => table.status === PhysicalTableStatus.Free,
    );
    const byParticipant = decksMap(decks);
    const ready = people
      .filter(
        (row) =>
          row.status === ParticipantStatus.Ready && !row.limitedQueueMode,
      )
      .sort(compareReadyOrder);
    const result = createMatches(
      ready.map((row) => ({
        id: row.id,
        readyAt: row.readyAt?.getTime() ?? row.createdAt.getTime(),
        flexCredits: row.flexCredits,
        decks: (byParticipant.get(row.id) ?? []).map((deck) => ({
          id: deck.id,
          poolId: deck.poolId,
          preference: deck.preference,
        })),
      })),
      freeTables.map((table) => ({ id: table.id })),
      { groups: history },
      matchOptions,
    );
    const created: PublicPod[] = [];
    for (const match of result.matches) {
      const treacheryRoles =
        event.gameMode === 'treachery'
          ? assignTreacheryRoles(match.seats.map((seat) => seat.participantId))
          : undefined;
      const treacheryIdentities = treacheryRoles
        ? assignTreacheryIdentities(treacheryRoles)
        : undefined;
      const pod = await this.store.createPod({
        eventId,
        tableId: match.tableId,
        poolId: match.poolId,
        seats: match.seats.map((seat) => ({
          participantId: seat.participantId,
          deckId: seat.deckId,
          assignedPoolId: seat.poolId,
          treacheryRole: treacheryRoles?.get(seat.participantId),
          treacheryIdentityId: treacheryIdentities?.get(seat.participantId),
        })),
      });
      for (const seat of match.seats) {
        const person = people.find((row) => row.id === seat.participantId);
        if (!person) {
          continue;
        }
        await this.store.updateParticipant(person.id, {
          status: ParticipantStatus.Matched,
          readyAt: person.readyAt,
          flexCredits: boundedFlex((person.flexCredits ?? 0) + seat.flexDelta),
        });
        if (seat.flexDelta !== 0) {
          await this.track(eventId, 'flex_concession_used');
        }
      }
      created.push({
        id: pod.id,
        tableLabel: pod.tableLabel,
        playerNames: pod.playerNames,
        status: pod.status,
        poolId: pod.poolId,
      });
    }
    if (created.length > 0) {
      await this.track(eventId, 'match_found');
    }
    return created;
  }

  private async present(
    participant: StoredParticipant,
    assignment?: StoredAssignment,
  ): Promise<PublicParticipant> {
    const [allDecks, allCompletions] = await Promise.all([
      this.store.listDecks(participant.eventId),
      this.store.listChallengeCompletions(participant.eventId),
    ]);
    const decks = allDecks.filter((row) => row.participantId === participant.id);
    const completions = allCompletions.filter(
      (row) => row.participantId === participant.id,
    );
    return toPublicParticipant(participant, assignment, decks, completions);
  }

  private async presentEvent(event: StoredEvent): Promise<PublicEvent> {
    return toPublicEvent(event, await this.resolvePack(event));
  }

  private async resolvePack(event: StoredEvent): Promise<ChallengePack> {
    const custom = await this.store.findChallengePack(
      event.id,
      event.challengePackId,
      event.challengePackVersion,
    );
    if (custom) {
      return custom;
    }
    if (
      event.challengePackId === OFFICIAL_COMMANDER_CHALLENGES.id &&
      event.challengePackVersion === OFFICIAL_COMMANDER_CHALLENGES.version
    ) {
      return OFFICIAL_COMMANDER_CHALLENGES;
    }
    throw new InvalidEventInputError(
      'This event uses a challenge pack version this server cannot score.',
    );
  }

  private async track(eventId: string, name: ProductEventName): Promise<void> {
    try {
      await this.store.insertProductEvent(eventId, name);
    } catch {
      /* Telemetry must never block a game action. */
    }
  }

  private async requireHostToken(
    joinCode: string,
    token: string,
  ): Promise<StoredEvent> {
    const stored = await this.requireByJoinCode(joinCode);
    const session = this.identity.hostEventSessions.verify(token);
    if (session.eventId !== stored.id) {
      throw new InvalidHostPinError();
    }
    return stored;
  }

  private async requireParticipant(
    eventId: string,
    token: string,
  ): Promise<StoredParticipant> {
    let identity;
    try {
      identity = this.identity.participantSessions.verify(token);
    } catch {
      throw new InvalidParticipantSessionError();
    }
    if (identity.eventId !== eventId) {
      throw new InvalidParticipantSessionError();
    }
    const participant = await this.store.findParticipantById(
      identity.participantId,
    );
    if (!participant || participant.eventId !== eventId) {
      throw new InvalidParticipantSessionError();
    }
    return participant;
  }

  private async requireTable(
    eventId: string,
    tableId: string,
  ): Promise<StoredTable> {
    const table = await this.store.findTableById(tableId);
    if (!table || table.eventId !== eventId) {
      throw new TableNotFoundError();
    }
    return table;
  }

  private async snapshotTable(
    eventId: string,
    tableId: string,
  ): Promise<PublicTable> {
    const tables = await this.listTablesByEventId(eventId);
    const table = tables.find((row) => row.id === tableId);
    if (!table) {
      throw new TableNotFoundError();
    }
    return table;
  }

  private async listTablesByEventId(eventId: string): Promise<PublicTable[]> {
    const [rows, assignments, people] = await Promise.all([
      this.store.listTables(eventId),
      this.store.listAssignments(eventId),
      this.store.listParticipants(eventId),
    ]);
    return rows.map((row) =>
      toPublicTable(
        row,
        seatedNamesForTable(row.id, assignments, people),
        podStatusForTable(row.id, assignments),
        poolIdForTable(row.id, assignments),
        trackerUsedForTable(row.id, assignments),
      ),
    );
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private requireTournament(stored: StoredEvent): TournamentState {
    if (!stored.tournamentState) {
      throw new InvalidParticipantTransitionError(
        'This is a casual event, not a tournament.',
      );
    }
    return normalizeTournamentState(stored.tournamentState);
  }

  private async requireByJoinCode(joinCode: string): Promise<StoredEvent> {
    const stored = await this.store.findEventByJoinCode(joinCode);
    if (!stored || stored.expiresAt.getTime() <= this.now().getTime()) {
      throw new EventNotFoundError();
    }
    return stored;
  }
}

function normalizeLimitedModeConfigs(
  input: LimitedEventModeConfig[] | undefined,
): LimitedEventModeConfig[] {
  if (!input) return [];
  const seen = new Set<LimitedMode>();
  return input.map((config) => {
    if (!isLimitedMode(config.mode) || seen.has(config.mode)) {
      throw new InvalidEventInputError(
        'Each Limited mode may be configured once.',
      );
    }
    seen.add(config.mode);
    const domain = limitedModeConfig(config.mode);
    if (!domain.supportedMatchStructures.includes(config.matchStructure)) {
      throw new InvalidEventInputError(
        `${config.mode} does not support that match structure.`,
      );
    }
    const integers = [
      config.minCohortSize,
      ...(config.draftMinutes === undefined ? [] : [config.draftMinutes]),
      config.deckbuildingMinutes,
      config.roundMinutes,
    ];
    if (integers.some((value) => !Number.isInteger(value) || value < 1)) {
      throw new InvalidEventInputError(
        'Limited sizes and timer minutes must be positive integers.',
      );
    }
    if (
      config.preferredCohortSize !== undefined &&
      (!Number.isInteger(config.preferredCohortSize) ||
        config.preferredCohortSize < config.minCohortSize)
    ) {
      throw new InvalidEventInputError(
        'Limited preferred cohort size must meet its minimum.',
      );
    }
    if (
      config.maxCohortSize !== undefined &&
      (config.maxCohortSize < config.minCohortSize ||
        (config.preferredCohortSize !== undefined &&
          config.preferredCohortSize > config.maxCohortSize))
    ) {
      throw new InvalidEventInputError(
        'Limited cohort sizes must be ordered minimum, preferred, maximum.',
      );
    }
    if (
      config.totalRounds !== 'AUTO' &&
      (!Number.isInteger(config.totalRounds) || config.totalRounds < 1)
    ) {
      throw new InvalidEventInputError(
        'Limited rounds must be AUTO or a positive integer.',
      );
    }
    try {
      validateLimitedCohortSize(config.mode, config.minCohortSize, {
        allowUndersizedLaunch: true,
        preferredCohortSize: config.preferredCohortSize,
        minCohortSize: config.minCohortSize,
        maxCohortSize: config.maxCohortSize,
      });
      if (config.maxCohortSize !== undefined) {
        validateLimitedCohortSize(config.mode, config.maxCohortSize, {
          allowUndersizedLaunch: true,
          preferredCohortSize: config.preferredCohortSize,
          minCohortSize: config.minCohortSize,
          maxCohortSize: config.maxCohortSize,
        });
      }
    } catch (error) {
      throw new InvalidEventInputError(
        error instanceof Error ? error.message : 'Invalid Limited cohort sizes.',
      );
    }
    return {
      ...config,
      enabled: config.enabled === true,
      allowUndersizedLaunch: config.allowUndersizedLaunch === true,
    };
  });
}

function requireLimitedConfig(
  event: StoredEvent,
  mode: LimitedMode,
): LimitedEventModeConfig {
  const config = event.limitedModeConfigs.find((row) => row.mode === mode);
  if (!config) {
    throw new InvalidParticipantTransitionError(
      `${mode} is not configured for this event.`,
    );
  }
  return config;
}

function requireEnabledLimitedConfig(
  event: StoredEvent,
  mode: LimitedMode,
): LimitedEventModeConfig {
  const config = requireLimitedConfig(event, mode);
  if (!config.enabled) {
    throw new InvalidParticipantTransitionError(
      `${mode} is not enabled for this event.`,
    );
  }
  return config;
}

function compareLimitedQueueOrder(
  left: StoredParticipant,
  right: StoredParticipant,
): number {
  return (
    (left.limitedQueuedAt?.getTime() ?? left.createdAt.getTime()) -
      (right.limitedQueuedAt?.getTime() ?? right.createdAt.getTime()) ||
    left.id.localeCompare(right.id)
  );
}

function limitedQueueSummaries(
  event: StoredEvent,
  participants: StoredParticipant[],
) {
  return event.limitedModeConfigs.map((config) => {
    const queue = participants
      .filter((participant) => participant.limitedQueueMode === config.mode)
      .sort(compareLimitedQueueOrder);
    return {
      mode: config.mode,
      participantIds: queue.map((participant) => participant.id),
      waitingCount: queue.length,
      preferredCohortSize: config.preferredCohortSize,
      oldestReadyAt: queue[0]?.limitedQueuedAt?.toISOString(),
    };
  });
}

function toLimitedMatch(match: StoredLimitedMatch) {
  return {
    id: match.id,
    roundNumber: match.roundNumber,
    position: match.position,
    playerAId: match.playerAId,
    playerBId: match.playerBId ?? undefined,
    tableId: match.tableId ?? undefined,
    tableLabel: match.tableLabel ?? undefined,
    status: match.status,
    bestOf: match.bestOf,
    outcome: match.outcome ?? undefined,
    playerAGameWins: match.playerAGameWins ?? undefined,
    playerBGameWins: match.playerBGameWins ?? undefined,
    reportedAt: match.reportedAt?.toISOString(),
  };
}

function toPublicLimitedSession(
  session: StoredLimitedSession,
  now?: Date,
): PublicLimitedSession {
  const rounds = session.rounds.map((round) => ({
    id: round.id,
    number: round.number,
    status: round.status,
    matches: round.matches.map(toLimitedMatch),
    createdAt: round.createdAt.toISOString(),
    startedAt: round.startedAt?.toISOString(),
    completedAt: round.completedAt?.toISOString(),
  }));
  return {
    id: session.id,
    mode: session.mode,
    status: session.status,
    label: session.label,
    participants: session.participants.map((participant) => ({
      participantId: participant.participantId,
      displayName: participant.displayName,
      status: participant.status,
      joinedAt: participant.joinedAt.toISOString(),
      assignedAt: participant.assignedAt?.toISOString(),
      draftSeat: participant.draftSeat ?? undefined,
      droppedAt: participant.droppedAt?.toISOString(),
    })),
    rounds,
    standings: calculateLimitedStandings(
      session.participants.map((participant) => ({
        participantId: participant.participantId,
        displayName: participant.displayName,
        dropped: participant.status === 'DROPPED',
      })),
      rounds.flatMap((round) => round.matches),
    ),
    matchStructure: session.matchStructure,
    pairingPolicy: session.pairingPolicy,
    preferredCohortSize: session.preferredCohortSize ?? undefined,
    minCohortSize: session.minCohortSize,
    maxCohortSize: session.maxCohortSize ?? undefined,
    allowUndersizedLaunch: session.allowUndersizedLaunch,
    currentRound: session.currentRound ?? undefined,
    totalRounds: session.totalRounds,
    draftTableIds: session.draftTableIds,
    draftPod:
      session.mode === 'SEALED'
        ? undefined
        : {
            id: session.id,
            sessionId: session.id,
            tableIds: session.draftTableIds,
            seats: session.participants
              .filter(
                (participant) =>
                  participant.draftSeat !== null &&
                  participant.status !== 'DROPPED',
              )
              .map((participant) => ({
                participantId: participant.participantId,
                seat: participant.draftSeat!,
              }))
              .sort((left, right) => left.seat - right.seat),
          },
    timer:
      session.timer &&
      now &&
      session.timer.status === 'RUNNING' &&
      new Date(session.timer.targetAt).getTime() <= now.getTime()
        ? { ...session.timer, status: 'EXPIRED' }
        : session.timer ?? undefined,
    createdAt: session.createdAt.toISOString(),
    startedAt: session.startedAt?.toISOString(),
    completedAt: session.completedAt?.toISOString(),
  };
}

function nextLimitedPhases(
  session: StoredLimitedSession,
): LimitedSessionStatus[] {
  if (session.status === 'SEATING') {
    return [session.mode === 'SEALED' ? 'DECKBUILDING' : 'DRAFTING'];
  }
  if (session.status === 'DRAFTING') return ['DECKBUILDING'];
  if (session.status === 'DECKBUILDING') return ['BETWEEN_ROUNDS'];
  return [];
}

function timerPhaseForStatus(
  status: LimitedSessionStatus,
): LimitedTimerPhase | undefined {
  if (status === 'DRAFTING') return 'DRAFTING';
  if (status === 'DECKBUILDING') return 'DECKBUILDING';
  if (status === 'ROUND_ACTIVE') return 'ROUND';
  return undefined;
}

function requireLimitedMatch(
  session: StoredLimitedSession,
  matchId: string,
): StoredLimitedMatch {
  const match = session.rounds
    .flatMap((round) => round.matches)
    .find((candidate) => candidate.id === matchId);
  if (!match) throw new LimitedSessionNotFoundError();
  return match;
}

function validateLimitedResult(
  match: StoredLimitedMatch,
  result: LimitedResultInput,
): void {
  if (!match.playerBId || result.outcome === 'BYE') {
    throw new InvalidEventInputError('A played match cannot be reported as a bye.');
  }
  if (
    !Number.isInteger(result.playerAGameWins) ||
    !Number.isInteger(result.playerBGameWins) ||
    result.playerAGameWins < 0 ||
    result.playerBGameWins < 0
  ) {
    throw new InvalidEventInputError('Limited game wins must be non-negative integers.');
  }
  const winsNeeded = match.bestOf === 1 ? 1 : 2;
  if (
    result.playerAGameWins > winsNeeded ||
    result.playerBGameWins > winsNeeded ||
    result.playerAGameWins + result.playerBGameWins > match.bestOf
  ) {
    throw new InvalidEventInputError('Limited game wins exceed the match structure.');
  }
  if (
    (result.outcome === 'PLAYER_A_WIN' &&
      (result.playerAGameWins !== winsNeeded ||
        result.playerAGameWins <= result.playerBGameWins)) ||
    (result.outcome === 'PLAYER_B_WIN' &&
      (result.playerBGameWins !== winsNeeded ||
        result.playerBGameWins <= result.playerAGameWins)) ||
    (result.outcome === 'DRAW' &&
      result.playerAGameWins !== result.playerBGameWins) ||
    (result.outcome === 'DOUBLE_LOSS' &&
      (result.playerAGameWins !== 0 || result.playerBGameWins !== 0))
  ) {
    throw new InvalidEventInputError('Limited result and game wins disagree.');
  }
}

function limitedModeLabel(mode: LimitedMode): string {
  return mode === 'BOOSTER_DRAFT'
    ? 'Booster Draft'
    : mode === 'PICK_TWO_DRAFT'
      ? 'Pick-Two Draft'
      : 'Sealed';
}

function averageLimitedMetric(
  values: number[],
): { average: number; count: number } | null {
  return values.length === 0
    ? null
    : {
        average:
          values.reduce((sum, value) => sum + value, 0) / values.length,
        count: values.length,
      };
}

function summarizeLimitedMetric(
  values: number[],
): { average: number; p95: number; max: number } | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const p95Index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * 0.95) - 1,
  );
  return {
    average: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p95: sorted[p95Index] ?? 0,
    max: sorted.at(-1) ?? 0,
  };
}

function toPublicEvent(
  event: StoredEvent,
  pack: ChallengePack = OFFICIAL_COMMANDER_CHALLENGES,
): PublicEvent {
  return {
    id: event.id,
    name: event.name,
    joinCode: event.joinCode,
    status: event.status,
    gameMode: event.gameMode,
    rulesFormat: event.rulesFormat,
    allowThreePods: event.allowThreePods,
    allowFivePods: event.allowFivePods,
    preferredPodSize: event.preferredPodSize,
    ...(event.tournamentFormat
      ? {
          tournamentFormat: event.tournamentFormat,
          tournament: event.tournamentState
            ? normalizeTournamentState(event.tournamentState)
            : undefined,
        }
      : {}),
    limitedModeConfigs: event.limitedModeConfigs,
    lifetimeHours: Math.max(
      1,
      Math.round(
        (event.expiresAt.getTime() - event.createdAt.getTime()) / (60 * 60 * 1000),
      ),
    ),
    expiresAt: event.expiresAt.toISOString(),
    challengePackId: event.challengePackId,
    challengePackVersion: event.challengePackVersion,
    challengePack: pack,
  };
}

function toPublicParticipant(
  row: StoredParticipant,
  assignment?: StoredAssignment,
  decks: StoredDeck[] = [],
  challengeCompletions: PublicChallengeCompletion[] = [],
): PublicParticipant {
  return {
    id: row.id,
    displayName: row.displayName,
    status: row.status,
    isBot: row.isBot,
    tableLabel: assignment?.tableLabel,
    readyAt: row.readyAt?.toISOString(),
    limitedQueueMode: row.limitedQueueMode ?? undefined,
    limitedQueuedAt: row.limitedQueuedAt?.toISOString(),
    decks: decks.map((deck) => ({
      id: deck.id,
      name: deck.name ?? undefined,
      poolId: deck.poolId,
      preference: deck.preference,
      commanders: deck.commanders,
    })),
    assignedPoolId: assignment?.poolId,
    assignedDeckName: assignment?.deckName,
    assignedCommanders: assignment?.commanders ?? [],
    trackerUsed: assignment?.trackerUsed ?? undefined,
    flexCredits: row.flexCredits ?? 0,
    challengePoints: challengeCompletions.reduce(
      (sum, completion) => sum + completion.points,
      0,
    ),
    challengeCompletions,
    revealedTreacheryIdentity:
      assignment?.treacheryUnveiledAt &&
      assignment.treacheryIdentityId !== undefined
        ? publicTreacheryIdentity(assignment.treacheryIdentityId)
        : undefined,
  };
}

function requireTreacheryIdentity(id: number) {
  const identity = treacheryIdentityById(id);
  if (!identity) {
    throw new Error(`Unknown Treachery identity #${String(id)}.`);
  }
  return identity;
}

function publicTreacheryIdentity(id: number) {
  const { name, role, image } = requireTreacheryIdentity(id);
  return { id, name, role, image };
}

function toPublicTable(
  row: StoredTable,
  seatedNames: string[],
  podStatus?: 'formed' | 'playing',
  poolId?: string,
  trackerUsed?: boolean,
): PublicTable {
  return {
    id: row.id,
    label: row.label,
    sortOrder: row.sortOrder,
    status: row.status,
    seatedNames,
    podStatus,
    trackerUsed,
    poolId,
  };
}

function podStatusForTable(
  tableId: string,
  assignments: StoredAssignment[],
): 'formed' | 'playing' | undefined {
  return assignments.find((row) => row.tableId === tableId)?.podStatus;
}

function assignmentMap(
  assignments: StoredAssignment[],
): Map<string, StoredAssignment> {
  return new Map(assignments.map((row) => [row.participantId, row]));
}

function decksMap(decks: StoredDeck[]): Map<string, StoredDeck[]> {
  const byParticipant = new Map<string, StoredDeck[]>();
  for (const deck of decks) {
    const list = byParticipant.get(deck.participantId) ?? [];
    list.push(deck);
    byParticipant.set(deck.participantId, list);
  }
  return byParticipant;
}

function poolIdForTable(
  tableId: string,
  assignments: StoredAssignment[],
): string | undefined {
  return assignments.find((row) => row.tableId === tableId)?.poolId;
}

function trackerUsedForTable(
  tableId: string,
  assignments: StoredAssignment[],
): boolean | undefined {
  return assignments.find((row) => row.tableId === tableId)?.trackerUsed ?? undefined;
}

function majorityPreferredPool(
  decks: StoredDeck[],
  readyHumanIds: Set<string>,
): string | undefined {
  const counts = new Map<string, number>();
  for (const deck of decks) {
    if (deck.preference !== 'preferred' || !readyHumanIds.has(deck.participantId)) {
      continue;
    }
    counts.set(deck.poolId, (counts.get(deck.poolId) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [poolId, count] of counts) {
    if (count > bestCount) {
      best = poolId;
      bestCount = count;
    }
  }
  return best;
}

function seatedNamesForTable(
  tableId: string,
  assignments: StoredAssignment[],
  people: StoredParticipant[],
): string[] {
  const names = new Map(people.map((row) => [row.id, row.displayName]));
  return assignments
    .filter((row) => row.tableId === tableId)
    .map((row) => names.get(row.participantId))
    .filter((name): name is string => Boolean(name));
}

function compareReadyOrder(
  left: StoredParticipant,
  right: StoredParticipant,
): number {
  const leftReady = left.readyAt?.getTime() ?? left.createdAt.getTime();
  const rightReady = right.readyAt?.getTime() ?? right.createdAt.getTime();
  if (leftReady !== rightReady) {
    return leftReady - rightReady;
  }
  return left.createdAt.getTime() - right.createdAt.getTime();
}

function resolveTableLabels(
  input: AddTablesInput,
  existingCount: number,
): string[] {
  if (input.labels && input.labels.length > 0) {
    return input.labels.map(assertTableLabel);
  }
  const count = assertTableCount(input.count ?? 0);
  return Array.from(
    { length: count },
    (_, index) => `Table ${existingCount + index + 1}`,
  );
}

function privatePackId(eventId: string): string {
  return `evt-${eventId.replaceAll('-', '').slice(0, 16)}`;
}

function latestSharedGame(
  games: StoredCompletedGame[],
  reporterId: string,
  targetId: string,
): StoredCompletedGame | undefined {
  return games.find(
    (game) =>
      game.memberIds.includes(reporterId) && game.memberIds.includes(targetId),
  );
}

function clampRating(value: number): PodRating {
  if (value <= 1) {
    return 1;
  }
  if (value === 2) {
    return 2;
  }
  if (value === 3) {
    return 3;
  }
  return 4;
}

function parseTournamentFormat(
  value: unknown,
): TournamentFormat | undefined {
  if (value === 'single-elimination' || value === 'swiss') {
    return value;
  }
  return undefined;
}

function parseTournamentOptions(value: unknown): TournamentOptions {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const raw = value as Record<string, unknown>;
  const options: TournamentOptions = {};
  if (typeof raw.matchSize === 'number') {
    options.matchSize = raw.matchSize;
  }
  if (raw.defaultBestOf === 1 || raw.defaultBestOf === 3 || raw.defaultBestOf === 5) {
    options.defaultBestOf = raw.defaultBestOf;
  }
  if (raw.finalBestOf === 1 || raw.finalBestOf === 3 || raw.finalBestOf === 5) {
    options.finalBestOf = raw.finalBestOf;
  }
  if (typeof raw.swissRounds === 'number') {
    options.swissRounds = raw.swissRounds;
  }
  return options;
}
