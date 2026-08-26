import {
  challengeInPack,
  cloneOfficialPack,
  emptyPrivatePack,
  OFFICIAL_COMMANDER_CHALLENGES,
  parseChallengePack,
  assignTreacheryRoles,
  assignTreacheryIdentities,
  treacheryIdentityById,
  treacheryDistribution,
  EventStatus,
  ParticipantStatus,
  PhysicalTableStatus,
  type ChallengePack,
  type EventMetrics,
  type GameMode,
  type PodRating,
  type ProductEventName,
  type PublicEvent,
  type PublicParticipant,
  type PublicPod,
  type PublicTable,
  type PublicChallengeCompletion,
  type TreacheryRoleAssignment,
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
  TableNotFoundError,
  PodNotFoundError,
  type EventStore,
  type StoredAssignment,
  type StoredCompletedGame,
  type StoredDeck,
  type StoredEvent,
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

export type CreateEventInput = {
  name: string;
  hostPin: string;
  tableCount: number;
  gameMode?: GameMode;
  allowThreePods?: boolean;
  allowFivePods?: boolean;
  preferredPodSize?: number;
  lifetimeHours?: number;
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
    const gameMode: GameMode =
      input.gameMode === 'treachery' ||
      input.gameMode === 'two-headed-giant' ||
      input.gameMode === 'archenemy-commander'
        ? input.gameMode
        : 'commander';
    const preferredPodSize = assertPreferredPodSize(
      gameMode,
      input.preferredPodSize,
    );
    const lifetimeHours = assertLifetimeHours(input.lifetimeHours);
    const createdAt = this.now();
    const expiresAt = new Date(
      createdAt.getTime() + lifetimeHours * 60 * 60 * 1000,
    );
    const allowFivePods =
      gameMode === 'treachery'
        ? preferredPodSize >= 5
        : gameMode === 'commander' && Boolean(input.allowFivePods);
    const labels = resolveTableLabels({ count: input.tableCount }, 0);
    const hostCredentialHash = await hashHostPin(hostPin);

    let stored: StoredEvent | undefined;
    for (let attempt = 0; attempt < JOIN_CODE_ATTEMPTS; attempt += 1) {
      try {
        stored = await this.store.insertEvent({
          name,
          joinCode: generateJoinCode(),
          hostCredentialHash,
          gameMode,
          allowThreePods:
            gameMode === 'commander' && input.allowThreePods !== false,
          allowFivePods,
          preferredPodSize,
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
    if (stored.status !== EventStatus.Open) {
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
    });
    await this.track(stored.id, 'left_event');
    return this.present(updated);
  }

  async getSnapshot(joinCode: string): Promise<{
    event: PublicEvent;
    participants: PublicParticipant[];
    tables: PublicTable[];
  }> {
    const [event, participants, tables] = await Promise.all([
      this.getEvent(joinCode),
      this.listParticipants(joinCode),
      this.listTables(joinCode),
    ]);
    return { event, participants, tables };
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
    try {
      await this.store.completePod(pod.id, {
        winnerParticipantId: input.winnerParticipantId,
        durationSeconds,
      });
    } catch (error) {
      if (!(error instanceof PodNotFoundError)) {
        throw error;
      }
    }
    await this.track(stored.id, 'game_finished');
    await this.track(stored.id, 'requeued');
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
      stored.gameMode === 'treachery'
        ? preferredPodSize >= 5
        : stored.gameMode === 'commander'
          ? patch.allowFivePods === undefined
            ? stored.allowFivePods
            : Boolean(patch.allowFivePods)
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
        stored.gameMode === 'treachery'
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
    const [people, tables, games, completions] = await Promise.all([
      this.store.listParticipants(stored.id),
      this.store.listTables(stored.id),
      this.store.listCompletedGames(stored.id),
      this.store.listChallengeCompletions(stored.id),
    ]);
    return computeEventMetrics({
      participants: people,
      tables,
      games,
      challengeCompletions: completions,
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
      (row) => row.status === ParticipantStatus.Ready,
    ).length;
    const matchOptions = eventMatchOptions(stored);
    const seatsNeeded =
      freeTables.length * Math.max(...(matchOptions.allowedSizes ?? [4]));
    const botsToAdd = Math.max(0, seatsNeeded - readyCount);
    const taken = new Set(
      people.map((row) => row.displayName.toLowerCase()),
    );

    const readyHumans = people.filter(
      (row) => row.status === ParticipantStatus.Ready && !row.isBot,
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

    const pods = await this.runMatch(stored.id);
    return { pods, botsAdded: botsToAdd };
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
      .filter((row) => row.status === ParticipantStatus.Ready)
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

  private async requireByJoinCode(joinCode: string): Promise<StoredEvent> {
    const stored = await this.store.findEventByJoinCode(joinCode);
    if (!stored || stored.expiresAt.getTime() <= this.now().getTime()) {
      throw new EventNotFoundError();
    }
    return stored;
  }
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
    allowThreePods: event.allowThreePods,
    allowFivePods: event.allowFivePods,
    preferredPodSize: event.preferredPodSize,
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
