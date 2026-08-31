import { randomUUID } from 'node:crypto';
import type { ChallengePack, ProductEventName } from '@podyguard/shared';
import {
  JoinCodeConflictError,
  LimitedPersistenceConflictError,
  PodNotFoundError,
  TableNotFoundError,
  type EventStore,
  type CompletePodInput,
  type NewStoredEvent,
  type NewStoredParticipant,
  type NewStoredDeck,
  type NewStoredChallengeCompletion,
  type NewStoredPod,
  type NewStoredTable,
  type NewStoredLimitedSession,
  type NewStoredLimitedRound,
  type LimitedRoundPatch,
  type LimitedSessionPhasePatch,
  type FinalizeLimitedMatchResultInput,
  type StoredAssignment,
  type StoredCompletedGame,
  type StoredDeck,
  type StoredChallengeCompletion,
  type StoredEvent,
  type StoredParticipant,
  type StoredPod,
  type StoredTable,
  type StoredTreacheryAssignment,
  type StoredLimitedSession,
  type StoredLimitedRound,
  type StoredLimitedMatch,
  type StoredLimitedParticipant,
  type StoredLimitedResultAudit,
} from './event-store.js';

export class MemoryEventStore implements EventStore {
  private readonly events = new Map<string, StoredEvent>();
  private readonly byJoinCode = new Map<string, string>();
  private readonly participants = new Map<string, StoredParticipant[]>();
  private readonly tables = new Map<string, StoredTable[]>();
  private readonly pods = new Map<string, StoredPod[]>();
  private readonly assignments = new Map<string, StoredAssignment[]>();
  private readonly decks = new Map<string, StoredDeck[]>();
  private readonly history = new Map<string, string[][]>();
  private readonly challengeCompletions = new Map<
    string,
    StoredChallengeCompletion[]
  >();
  private readonly packVersions = new Map<string, ChallengePack[]>();
  private readonly productEvents = new Map<
    string,
    Array<{ name: ProductEventName }>
  >();
  private readonly limitedSessions = new Map<string, StoredLimitedSession>();
  private readonly limitedResultAudits = new Map<
    string,
    StoredLimitedResultAudit[]
  >();
  private readonly tableReservations = new Map<
    string,
    { eventId: string; ownerType: 'LIMITED_SESSION' | 'LIMITED_MATCH'; ownerId: string }
  >();

  async insertEvent(input: NewStoredEvent): Promise<StoredEvent> {
    if (this.byJoinCode.has(input.joinCode)) {
      throw new JoinCodeConflictError();
    }
    const event: StoredEvent = {
      id: randomUUID(),
      name: input.name,
      joinCode: input.joinCode,
      status: 'open',
      gameMode: input.gameMode ?? 'commander',
      rulesFormat: input.rulesFormat ?? 'commander',
      hostCredentialHash: input.hostCredentialHash,
      allowThreePods: input.allowThreePods !== false,
      allowFivePods: Boolean(input.allowFivePods),
      preferredPodSize: input.preferredPodSize ?? 4,
      tournamentFormat: input.tournamentFormat ?? null,
      tournamentState: input.tournamentState ?? null,
      limitedModeConfigs: input.limitedModeConfigs ?? [],
      expiresAt: input.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      challengePackId: 'classic-commander-v1',
      challengePackVersion: 1,
      createdAt: input.createdAt ?? new Date(),
    };
    this.events.set(event.id, event);
    this.byJoinCode.set(event.joinCode, event.id);
    this.participants.set(event.id, []);
    this.tables.set(event.id, []);
    this.pods.set(event.id, []);
    this.assignments.set(event.id, []);
    this.history.set(event.id, []);
    this.challengeCompletions.set(event.id, []);
    this.packVersions.set(event.id, []);
    this.productEvents.set(event.id, []);
    return event;
  }

  async findEventByJoinCode(joinCode: string): Promise<StoredEvent | undefined> {
    const id = this.byJoinCode.get(joinCode);
    return id ? this.events.get(id) : undefined;
  }

  async findEventById(id: string): Promise<StoredEvent | undefined> {
    return this.events.get(id);
  }

  async insertParticipant(
    input: NewStoredParticipant,
  ): Promise<StoredParticipant> {
    const participant: StoredParticipant = {
      id: randomUUID(),
      eventId: input.eventId,
      displayName: input.displayName,
      isBot: input.isBot ?? false,
      status: input.status ?? 'joined',
      readyAt: input.readyAt ?? null,
      limitedQueueMode: null,
      limitedQueuedAt: null,
      flexCredits: 0,
      createdAt: new Date(),
    };
    const list = this.participants.get(input.eventId) ?? [];
    list.push(participant);
    this.participants.set(input.eventId, list);
    return participant;
  }

  async findParticipantById(id: string): Promise<StoredParticipant | undefined> {
    for (const list of this.participants.values()) {
      const found = list.find((row) => row.id === id);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  async listParticipants(eventId: string): Promise<StoredParticipant[]> {
    return [...(this.participants.get(eventId) ?? [])];
  }

  async updateParticipant(
    id: string,
    patch: {
      status: StoredParticipant['status'];
      readyAt: Date | null;
      flexCredits?: number;
      limitedQueueMode?: StoredParticipant['limitedQueueMode'];
      limitedQueuedAt?: Date | null;
    },
  ): Promise<StoredParticipant> {
    const existing = await this.findParticipantById(id);
    if (!existing) {
      throw new Error('Participant not found.');
    }
    existing.status = patch.status;
    existing.readyAt = patch.readyAt;
    if (patch.flexCredits !== undefined) {
      existing.flexCredits = patch.flexCredits;
    }
    if (patch.limitedQueueMode !== undefined) {
      existing.limitedQueueMode = patch.limitedQueueMode;
    }
    if (patch.limitedQueuedAt !== undefined) {
      existing.limitedQueuedAt = patch.limitedQueuedAt;
    }
    return existing;
  }

  async insertTable(input: NewStoredTable): Promise<StoredTable> {
    const table: StoredTable = {
      id: randomUUID(),
      eventId: input.eventId,
      label: input.label,
      sortOrder: input.sortOrder,
      status: 'free',
      createdAt: new Date(),
    };
    const list = this.tables.get(input.eventId) ?? [];
    list.push(table);
    this.tables.set(input.eventId, list);
    return table;
  }

  async listTables(eventId: string): Promise<StoredTable[]> {
    return [...(this.tables.get(eventId) ?? [])].sort(
      (left, right) => left.sortOrder - right.sortOrder,
    );
  }

  async findTableById(id: string): Promise<StoredTable | undefined> {
    for (const list of this.tables.values()) {
      const found = list.find((row) => row.id === id);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  async updateTableStatus(
    id: string,
    status: StoredTable['status'],
  ): Promise<StoredTable> {
    const table = await this.findTableById(id);
    if (!table) {
      throw new TableNotFoundError();
    }
    table.status = status;
    return table;
  }

  async createPod(input: NewStoredPod): Promise<StoredPod> {
    const table = await this.findTableById(input.tableId);
    if (!table || table.eventId !== input.eventId) {
      throw new TableNotFoundError();
    }
    if (table.status !== 'free' || this.tableReservations.has(table.id)) {
      throw new LimitedPersistenceConflictError(
        'The requested physical table is not available.',
      );
    }
    const names: string[] = [];
    const memberIds: string[] = [];
    const now = Date.now();
    const seats = [];
    for (const seat of input.seats) {
      const participant = await this.findParticipantById(seat.participantId);
      if (!participant || participant.eventId !== input.eventId) {
        throw new Error('Participant not found.');
      }
      const assigned = (this.assignments.get(input.eventId) ?? []).some(
        (row) => row.participantId === seat.participantId,
      );
      if (assigned) {
        throw new Error('Participant is already seated in a pod.');
      }
      participant.status = 'matched';
      names.push(participant.displayName);
      memberIds.push(participant.id);
      seats.push({
        participantId: participant.id,
        waitSeconds: participant.readyAt
          ? Math.max(0, Math.round((now - participant.readyAt.getTime()) / 1000))
          : 0,
        assignedPoolId: seat.assignedPoolId,
      });
    }
    table.status = 'occupied';
    const createdAt = new Date();
    const pod: StoredPod = {
      id: randomUUID(),
      eventId: input.eventId,
      tableId: table.id,
      tableLabel: table.label,
      playerNames: names,
      status: 'formed',
      poolId: input.poolId,
      memberIds,
      trackerUsed: null,
      tournamentMatchId: input.tournamentMatchId ?? null,
      createdAt,
      winnerParticipantId: null,
      durationSeconds: null,
      completedAt: null,
      rating: null,
      seats,
    };
    const pods = this.pods.get(input.eventId) ?? [];
    pods.push(pod);
    this.pods.set(input.eventId, pods);
    const assignments = this.assignments.get(input.eventId) ?? [];
    for (const seat of input.seats) {
      const deck = this.findDeck(seat.deckId);
      assignments.push({
        podId: pod.id,
        participantId: seat.participantId,
        tableId: table.id,
        tableLabel: table.label,
        podStatus: 'formed',
        trackerUsed: null,
        poolId: seat.assignedPoolId,
        deckName: deck?.name ?? undefined,
        commanders: deck?.commanders ?? [],
        treacheryRole: seat.treacheryRole,
        treacheryIdentityId: seat.treacheryIdentityId,
        treacheryUnveiledAt:
          seat.treacheryRole === 'leader' ? new Date() : undefined,
      });
    }
    this.assignments.set(input.eventId, assignments);
    return pod;
  }

  async listAssignments(eventId: string): Promise<StoredAssignment[]> {
    return [...(this.assignments.get(eventId) ?? [])];
  }

  async findActiveTreacheryAssignment(
    eventId: string,
    participantId: string,
  ): Promise<StoredTreacheryAssignment | undefined> {
    const assignment = (this.assignments.get(eventId) ?? []).find(
      (row) => row.participantId === participantId && row.treacheryRole,
    );
    if (
      !assignment?.treacheryRole ||
      assignment.treacheryIdentityId === undefined
    ) {
      return undefined;
    }
    return {
      podId: assignment.podId,
      participantId,
      role: assignment.treacheryRole,
      identityId: assignment.treacheryIdentityId,
      unveiledAt: assignment.treacheryUnveiledAt,
      podStatus: assignment.podStatus,
    };
  }

  async unveilTreacheryIdentity(
    podId: string,
    participantId: string,
  ): Promise<StoredTreacheryAssignment> {
    const assignment = [...this.assignments.values()]
      .flat()
      .find(
        (row) =>
          row.podId === podId &&
          row.participantId === participantId &&
          row.treacheryRole &&
          row.treacheryIdentityId !== undefined,
      );
    if (
      !assignment?.treacheryRole ||
      assignment.treacheryIdentityId === undefined
    ) {
      throw new PodNotFoundError();
    }
    assignment.treacheryUnveiledAt ??= new Date();
    return {
      podId,
      participantId,
      role: assignment.treacheryRole,
      identityId: assignment.treacheryIdentityId,
      unveiledAt: assignment.treacheryUnveiledAt,
      podStatus: assignment.podStatus,
    };
  }

  async listDecks(eventId: string): Promise<StoredDeck[]> {
    const people = this.participants.get(eventId) ?? [];
    return people.flatMap((row) => this.decks.get(row.id) ?? []);
  }

  async replaceDecks(
    participantId: string,
    decks: NewStoredDeck[],
  ): Promise<StoredDeck[]> {
    const stored = decks.map((row) => ({
      id: randomUUID(),
      participantId: row.participantId,
      name: row.name,
      poolId: row.poolId,
      preference: row.preference,
      commanders: row.commanders,
    }));
    this.decks.set(participantId, stored);
    return stored;
  }

  async listMatchHistory(eventId: string): Promise<string[][]> {
    return [...(this.history.get(eventId) ?? [])].map((group) => [...group]);
  }

  async listChallengeCompletions(
    eventId: string,
  ): Promise<StoredChallengeCompletion[]> {
    return [...(this.challengeCompletions.get(eventId) ?? [])];
  }

  async insertChallengeCompletion(
    input: NewStoredChallengeCompletion,
  ): Promise<{ completion: StoredChallengeCompletion; created: boolean }> {
    const rows = this.challengeCompletions.get(input.eventId) ?? [];
    const existing = rows.find(
      (row) =>
        row.participantId === input.participantId &&
        row.challengeId === input.challengeId &&
        row.scopeKey === input.scopeKey,
    );
    if (existing) {
      return { completion: existing, created: false };
    }
    const completion: StoredChallengeCompletion = {
      ...input,
      id: randomUUID(),
      completedAt: new Date().toISOString(),
    };
    rows.push(completion);
    this.challengeCompletions.set(input.eventId, rows);
    return { completion, created: true };
  }

  async findActivePodByTableId(
    eventId: string,
    tableId: string,
  ): Promise<StoredPod | undefined> {
    return (this.pods.get(eventId) ?? []).find(
      (pod) =>
        pod.tableId === tableId &&
        (pod.status === 'formed' || pod.status === 'playing'),
    );
  }

  async startPod(podId: string): Promise<StoredPod> {
    const pod = this.findPod(podId);
    if (!pod || (pod.status !== 'formed' && pod.status !== 'playing')) {
      throw new PodNotFoundError();
    }
    pod.status = 'playing';
    for (const assignment of this.assignments.get(pod.eventId) ?? []) {
      if (assignment.podId !== pod.id) {
        continue;
      }
      assignment.podStatus = 'playing';
      const participant = await this.findParticipantById(assignment.participantId);
      if (participant) {
        participant.status = 'playing';
      }
    }
    return pod;
  }

  async setPodTrackerUsed(
    podId: string,
    trackerUsed: boolean,
  ): Promise<StoredPod> {
    const pod = this.findPod(podId);
    if (!pod || (pod.status !== 'formed' && pod.status !== 'playing')) {
      throw new PodNotFoundError();
    }
    pod.trackerUsed = trackerUsed;
    for (const assignment of this.assignments.get(pod.eventId) ?? []) {
      if (assignment.podId === pod.id) {
        assignment.trackerUsed = trackerUsed;
      }
    }
    return pod;
  }

  async completePod(
    podId: string,
    result: CompletePodInput = {},
  ): Promise<StoredPod> {
    const pod = this.findPod(podId);
    if (!pod || (pod.status !== 'formed' && pod.status !== 'playing')) {
      throw new PodNotFoundError();
    }
    const assignments = this.assignments.get(pod.eventId) ?? [];
    const memberIds = assignments
      .filter((row) => row.podId === pod.id)
      .map((row) => row.participantId);
    const groups = this.history.get(pod.eventId) ?? [];
    groups.push(memberIds);
    this.history.set(pod.eventId, groups);
    for (const assignment of assignments.filter((row) => row.podId === pod.id)) {
      const participant = await this.findParticipantById(assignment.participantId);
      if (!participant) {
        continue;
      }
      participant.status = result.requeue === false ? 'joined' : 'ready';
      participant.readyAt = result.requeue === false ? null : new Date();
    }
    this.assignments.set(
      pod.eventId,
      assignments.filter((row) => row.podId !== pod.id),
    );
    const table = await this.findTableById(pod.tableId);
    if (table) {
      table.status = 'free';
    }
    pod.status = 'completed';
    pod.playerNames = [];
    pod.winnerParticipantId = result.winnerParticipantId ?? null;
    pod.durationSeconds = result.durationSeconds ?? null;
    pod.completedAt = new Date();
    return pod;
  }

  async cancelPod(podId: string): Promise<StoredPod> {
    const pod = this.findPod(podId);
    if (!pod || (pod.status !== 'formed' && pod.status !== 'playing')) {
      throw new PodNotFoundError();
    }
    const assignments = this.assignments.get(pod.eventId) ?? [];
    const now = new Date();
    for (const assignment of assignments.filter((row) => row.podId === pod.id)) {
      const participant = await this.findParticipantById(assignment.participantId);
      if (!participant) {
        continue;
      }
      participant.status = 'ready';
      participant.readyAt = now;
    }
    this.assignments.set(
      pod.eventId,
      assignments.filter((row) => row.podId !== pod.id),
    );
    const table = await this.findTableById(pod.tableId);
    if (table) {
      table.status = 'free';
    }
    pod.status = 'cancelled';
    pod.playerNames = [];
    return pod;
  }

  async listCompletedGames(eventId: string): Promise<StoredCompletedGame[]> {
    return (this.pods.get(eventId) ?? [])
      .filter((pod) => pod.status === 'completed')
      .sort(
        (left, right) =>
          (right.completedAt?.getTime() ?? 0) - (left.completedAt?.getTime() ?? 0),
      )
      .map((pod) => toCompletedGame(pod));
  }

  async setPodRating(
    podId: string,
    rating: number,
  ): Promise<StoredCompletedGame> {
    const pod = this.findPod(podId);
    if (!pod || pod.status !== 'completed') {
      throw new PodNotFoundError();
    }
    if (pod.rating != null) {
      return toCompletedGame(pod);
    }
    pod.rating = rating;
    return toCompletedGame(pod);
  }

  async findChallengePack(
    eventId: string,
    packId: string,
    version: number,
  ): Promise<ChallengePack | undefined> {
    return (this.packVersions.get(eventId) ?? []).find(
      (pack) => pack.id === packId && pack.version === version,
    );
  }

  async insertChallengePackVersion(
    eventId: string,
    pack: ChallengePack,
  ): Promise<ChallengePack> {
    const rows = this.packVersions.get(eventId) ?? [];
    rows.push(pack);
    this.packVersions.set(eventId, rows);
    return pack;
  }

  async insertProductEvent(
    eventId: string,
    name: ProductEventName,
  ): Promise<void> {
    const rows = this.productEvents.get(eventId) ?? [];
    rows.push({ name });
    this.productEvents.set(eventId, rows);
  }

  async updateEvent(
    id: string,
    patch: {
      status?: StoredEvent['status'];
      allowThreePods?: boolean;
      allowFivePods?: boolean;
      preferredPodSize?: number;
      expiresAt?: Date;
      challengePackId?: string;
      challengePackVersion?: number;
      tournamentState?: StoredEvent['tournamentState'];
    },
  ): Promise<StoredEvent> {
    const event = this.events.get(id);
    if (!event) {
      throw new Error('Event not found.');
    }
    if (patch.status !== undefined) {
      event.status = patch.status;
    }
    if (patch.allowThreePods !== undefined) {
      event.allowThreePods = patch.allowThreePods;
    }
    if (patch.allowFivePods !== undefined) {
      event.allowFivePods = patch.allowFivePods;
    }
    if (patch.preferredPodSize !== undefined) {
      event.preferredPodSize = patch.preferredPodSize;
    }
    if (patch.expiresAt !== undefined) {
      event.expiresAt = patch.expiresAt;
    }
    if (patch.challengePackId !== undefined) {
      event.challengePackId = patch.challengePackId;
    }
    if (patch.challengePackVersion !== undefined) {
      event.challengePackVersion = patch.challengePackVersion;
    }
    if (patch.tournamentState !== undefined) {
      event.tournamentState = patch.tournamentState;
    }
    return event;
  }

  async createLimitedSession(
    input: NewStoredLimitedSession,
  ): Promise<StoredLimitedSession> {
    if (!this.events.has(input.eventId)) {
      throw new Error('Event not found.');
    }
    const participantIds = input.participants.map((row) => row.participantId);
    assertUnique(participantIds, 'Limited session participant');
    if (
      [...this.limitedSessions.values()].some(
        (session) =>
          !['COMPLETED', 'CANCELLED'].includes(session.status) &&
          session.participants.some(
            (participant) =>
              participant.status !== 'DROPPED' &&
              participantIds.includes(participant.participantId),
          ),
      )
    ) {
      throw new LimitedPersistenceConflictError(
        'A participant is already assigned to active Limited play.',
      );
    }
    const seats = input.participants
      .map((row) => row.draftSeat)
      .filter((seat): seat is number => seat !== undefined);
    assertUnique(seats, 'Limited draft seat');
    const draftTableIds = input.draftTableIds ?? [];
    assertUnique(draftTableIds, 'Limited draft table');
    for (const participantId of participantIds) {
      const participant = await this.findParticipantById(participantId);
      if (!participant || participant.eventId !== input.eventId) {
        throw new Error('Limited participant does not belong to the event.');
      }
    }
    for (const tableId of draftTableIds) {
      const table = await this.findTableById(tableId);
      if (!table || table.eventId !== input.eventId) {
        throw new TableNotFoundError();
      }
      if (table.status !== 'free') {
        throw new LimitedPersistenceConflictError(
          'A requested physical table is not available.',
        );
      }
      if (this.tableReservations.has(tableId)) {
        throw new LimitedPersistenceConflictError(
          'A requested physical table is already reserved.',
        );
      }
    }
    const id = randomUUID();
    const createdAt = input.createdAt ?? new Date();
    const session: StoredLimitedSession = {
      id,
      eventId: input.eventId,
      mode: input.mode,
      status: 'FORMING',
      label: input.label,
      participants: input.participants.map((row) => {
        const participant = (this.participants.get(input.eventId) ?? []).find(
          (person) => person.id === row.participantId,
        )!;
        return {
          participantId: row.participantId,
          displayName: participant.displayName,
          status: row.status ?? 'ASSIGNED',
          draftSeat: row.draftSeat ?? null,
          joinedAt: row.queuedAt ?? createdAt,
          assignedAt: createdAt,
          droppedAt: null,
        };
      }),
      rounds: [],
      matchStructure: input.matchStructure,
      pairingPolicy: input.pairingPolicy,
      preferredCohortSize: input.preferredCohortSize ?? null,
      minCohortSize: input.minCohortSize,
      maxCohortSize: input.maxCohortSize ?? null,
      allowUndersizedLaunch: input.allowUndersizedLaunch ?? false,
      currentRound: null,
      totalRounds: input.totalRounds,
      draftTableIds: [...draftTableIds],
      timer: null,
      createdAt,
      startedAt: null,
      completedAt: null,
    };
    this.limitedSessions.set(id, session);
    for (const tableId of draftTableIds) {
      this.tableReservations.set(tableId, {
        eventId: input.eventId,
        ownerType: 'LIMITED_SESSION',
        ownerId: id,
      });
      const table = await this.findTableById(tableId);
      if (table) table.status = 'occupied';
    }
    for (const participantId of participantIds) {
      const participant = await this.findParticipantById(participantId);
      if (participant) {
        participant.status = 'matched';
        participant.readyAt = null;
        participant.limitedQueueMode = null;
        participant.limitedQueuedAt = null;
      }
    }
    return session;
  }

  async findLimitedSessionById(
    id: string,
  ): Promise<StoredLimitedSession | undefined> {
    return this.limitedSessions.get(id);
  }

  async listLimitedSessions(eventId: string): Promise<StoredLimitedSession[]> {
    return [...this.limitedSessions.values()]
      .filter((session) => session.eventId === eventId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  async replaceLimitedSessionRoster(
    id: string,
    input: Array<{ participantId: string; draftSeat?: number }>,
  ): Promise<StoredLimitedSession> {
    const session = this.requireLimitedSession(id);
    if (session.status !== 'FORMING') {
      throw new LimitedPersistenceConflictError(
        'Only a forming Limited session can change its roster.',
      );
    }
    const participantIds = input.map((row) => row.participantId);
    assertUnique(participantIds, 'Limited session participant');
    assertUnique(
      input
        .map((row) => row.draftSeat)
        .filter((seat): seat is number => seat !== undefined),
      'Limited draft seat',
    );
    const people = await Promise.all(
      participantIds.map((participantId) => this.findParticipantById(participantId)),
    );
    if (
      people.some(
        (participant) => !participant || participant.eventId !== session.eventId,
      )
    ) {
      throw new Error('Limited participant does not belong to the event.');
    }
    if (
      [...this.limitedSessions.values()].some(
        (other) =>
          other.id !== id &&
          !['COMPLETED', 'CANCELLED'].includes(other.status) &&
          other.participants.some(
            (participant) =>
              participant.status !== 'DROPPED' &&
              participantIds.includes(participant.participantId),
          ),
      )
    ) {
      throw new LimitedPersistenceConflictError(
        'A participant is already assigned to active Limited play.',
      );
    }
    const previous = new Map(
      session.participants.map((participant) => [
        participant.participantId,
        participant,
      ]),
    );
    const nextIds = new Set(participantIds);
    const now = new Date();
    for (const participant of session.participants) {
      if (nextIds.has(participant.participantId)) continue;
      const person = await this.findParticipantById(participant.participantId);
      if (person) {
        person.status = 'joined';
        person.limitedQueueMode = session.mode;
        person.limitedQueuedAt = now;
      }
    }
    session.participants = input.map((row, index) => {
      const person = people[index]!;
      const existing = previous.get(row.participantId);
      person.status = 'matched';
      person.readyAt = null;
      person.limitedQueueMode = null;
      person.limitedQueuedAt = null;
      return {
        participantId: row.participantId,
        displayName: person.displayName,
        status: 'ASSIGNED',
        draftSeat: row.draftSeat ?? null,
        joinedAt: existing?.joinedAt ?? now,
        assignedAt: now,
        droppedAt: null,
      };
    });
    return session;
  }

  async replaceLimitedDraftTables(
    id: string,
    tableIds: string[],
  ): Promise<StoredLimitedSession> {
    const session = this.requireLimitedSession(id);
    if (session.status !== 'FORMING') {
      throw new LimitedPersistenceConflictError(
        'Only a forming Limited session can change draft tables.',
      );
    }
    assertUnique(tableIds, 'Limited draft table');
    for (const tableId of tableIds) {
      const table = await this.findTableById(tableId);
      const reservation = this.tableReservations.get(tableId);
      const isOwnReservation =
        reservation?.ownerType === 'LIMITED_SESSION' &&
        reservation.ownerId === id;
      if (!table || table.eventId !== session.eventId) {
        throw new TableNotFoundError();
      }
      if (
        (table.status !== 'free' && !isOwnReservation) ||
        (reservation && !isOwnReservation)
      ) {
        throw new LimitedPersistenceConflictError(
          'A requested physical table is not available.',
        );
      }
    }
    this.releaseMemoryReservations(
      (reservation) =>
        reservation.ownerType === 'LIMITED_SESSION' &&
        reservation.ownerId === id,
    );
    session.draftTableIds = [...tableIds];
    for (const tableId of tableIds) {
      this.tableReservations.set(tableId, {
        eventId: session.eventId,
        ownerType: 'LIMITED_SESSION',
        ownerId: id,
      });
      const table = await this.findTableById(tableId);
      if (table) table.status = 'occupied';
    }
    return session;
  }

  async updateLimitedSessionPhase(
    id: string,
    patch: LimitedSessionPhasePatch,
  ): Promise<StoredLimitedSession> {
    const session = this.requireLimitedSession(id);
    session.status = patch.status;
    if ('timer' in patch) session.timer = patch.timer ?? null;
    if ('currentRound' in patch) session.currentRound = patch.currentRound ?? null;
    if (patch.startedAt !== undefined) session.startedAt = patch.startedAt;
    if ('completedAt' in patch) session.completedAt = patch.completedAt ?? null;
    const participantStatus =
      patch.status === 'DRAFTING'
        ? 'DRAFTING'
        : patch.status === 'DECKBUILDING'
          ? 'DECKBUILDING'
          : patch.status === 'ROUND_ACTIVE'
            ? 'PLAYING'
            : patch.status === 'BETWEEN_ROUNDS'
              ? 'WAITING_FOR_ROUND'
              : patch.status === 'SEATING'
                ? 'ASSIGNED'
                : null;
    if (participantStatus) {
      for (const participant of session.participants) {
        if (participant.status !== 'DROPPED') {
          participant.status = participantStatus;
        }
      }
    }
    if (!['SEATING', 'DRAFTING', 'DECKBUILDING'].includes(patch.status)) {
      this.releaseMemoryReservations(
        (reservation) =>
          reservation.ownerType === 'LIMITED_SESSION' &&
          reservation.ownerId === id,
      );
    }
    return session;
  }

  async createLimitedRound(
    input: NewStoredLimitedRound,
  ): Promise<StoredLimitedRound> {
    const session = this.requireLimitedSession(input.sessionId);
    if (session.rounds.some((round) => round.number === input.number)) {
      throw new LimitedPersistenceConflictError(
        'That Limited round number already exists.',
      );
    }
    assertUnique(
      input.matches.map((match) => match.position),
      'Limited match position',
    );
    const activeMembers = new Set(
      session.participants
        .filter((row) => row.status !== 'DROPPED')
        .map((row) => row.participantId),
    );
    const roundParticipants: string[] = [];
    const tableIds: string[] = [];
    for (const match of input.matches) {
      roundParticipants.push(match.playerAId);
      if (match.playerBId) roundParticipants.push(match.playerBId);
      if (!activeMembers.has(match.playerAId) ||
          (match.playerBId && !activeMembers.has(match.playerBId))) {
        throw new Error('Limited match participant is not active in the session.');
      }
      if (match.playerAId === match.playerBId) {
        throw new Error('Limited participant cannot play themselves.');
      }
      if (!match.playerBId && match.outcome !== 'BYE') {
        throw new Error('A one-player Limited match must be a bye.');
      }
      if (match.tableId) tableIds.push(match.tableId);
    }
    assertUnique(roundParticipants, 'Limited round participant');
    assertUnique(tableIds, 'Limited match table');
    const previousMatchIds = new Set(
      session.rounds.flatMap((round) => round.matches.map((match) => match.id)),
    );
    for (const tableId of tableIds) {
      const table = await this.findTableById(tableId);
      if (!table || table.eventId !== session.eventId) throw new TableNotFoundError();
      const reservation = this.tableReservations.get(tableId);
      const isOwnDraftReservation =
        reservation?.ownerType === 'LIMITED_SESSION' &&
        reservation.ownerId === session.id;
      if (table.status !== 'free' && !isOwnDraftReservation) {
        throw new LimitedPersistenceConflictError(
          'A requested physical table is not available.',
        );
      }
      if (
        reservation &&
        !(
          isOwnDraftReservation ||
          reservation.ownerType === 'LIMITED_MATCH' &&
          previousMatchIds.has(reservation.ownerId)
        )
      ) {
        throw new LimitedPersistenceConflictError(
          'A requested physical table is already reserved.',
        );
      }
    }
    this.releaseMemoryReservations((reservation) => {
      if (
        reservation.ownerType === 'LIMITED_SESSION' &&
        reservation.ownerId === session.id
      ) {
        return true;
      }
      if (reservation.ownerType !== 'LIMITED_MATCH') return false;
      return previousMatchIds.has(reservation.ownerId);
    });
    const roundId = randomUUID();
    const now = input.startedAt ?? new Date();
    const matches: StoredLimitedMatch[] = input.matches.map((match) => ({
      id: randomUUID(),
      roundId,
      roundNumber: input.number,
      position: match.position,
      playerAId: match.playerAId,
      playerBId: match.playerBId ?? null,
      tableId: match.tableId ?? null,
      tableLabel: match.tableId
        ? (this.tables.get(session.eventId) ?? []).find(
            (table) => table.id === match.tableId,
          )?.label ?? null
        : null,
      status: match.status ?? (match.outcome ? 'COMPLETED' : 'PENDING'),
      bestOf: match.bestOf,
      outcome: match.outcome ?? null,
      playerAGameWins: match.playerAGameWins ?? null,
      playerBGameWins: match.playerBGameWins ?? null,
      reportedAt: match.reportedAt ?? (match.outcome ? now : null),
    }));
    const round: StoredLimitedRound = {
      id: roundId,
      sessionId: session.id,
      number: input.number,
      status: input.status ?? 'PENDING',
      matches,
      createdAt: now,
      startedAt: input.startedAt ?? null,
      completedAt: null,
    };
    session.rounds.push(round);
    session.currentRound = input.number;
    for (const match of matches) {
      if (match.outcome) {
        this.limitedResultAudits.set(match.id, [
          {
            id: randomUUID(),
            matchId: match.id,
            previousOutcome: null,
            previousPlayerAGameWins: null,
            previousPlayerBGameWins: null,
            outcome: match.outcome,
            playerAGameWins: match.playerAGameWins ?? 0,
            playerBGameWins: match.playerBGameWins ?? 0,
            correctionReason: null,
            correctedByParticipantId: null,
            createdAt: match.reportedAt ?? now,
          },
        ]);
      }
      if (match.tableId) {
        this.tableReservations.set(match.tableId, {
          eventId: session.eventId,
          ownerType: 'LIMITED_MATCH',
          ownerId: match.id,
        });
        const table = await this.findTableById(match.tableId);
        if (table) table.status = 'occupied';
      }
    }
    return round;
  }

  async updateLimitedRound(
    id: string,
    patch: LimitedRoundPatch,
  ): Promise<StoredLimitedRound> {
    const round = [...this.limitedSessions.values()]
      .flatMap((session) => session.rounds)
      .find((row) => row.id === id);
    if (!round) throw new Error('Limited round not found.');
    round.status = patch.status;
    if (patch.startedAt !== undefined) round.startedAt = patch.startedAt;
    if ('completedAt' in patch) round.completedAt = patch.completedAt ?? null;
    if (patch.status === 'COMPLETED') {
      const matchIds = new Set(round.matches.map((match) => match.id));
      this.releaseMemoryReservations(
        (reservation) =>
          reservation.ownerType === 'LIMITED_MATCH' &&
          matchIds.has(reservation.ownerId),
      );
    }
    return round;
  }

  async finalizeLimitedMatchResult(
    input: FinalizeLimitedMatchResultInput,
  ): Promise<{
    match: StoredLimitedMatch;
    audit: StoredLimitedResultAudit;
    corrected: boolean;
  }> {
    const match = [...this.limitedSessions.values()]
      .flatMap((session) => session.rounds)
      .flatMap((round) => round.matches)
      .find((row) => row.id === input.matchId);
    if (!match) throw new Error('Limited match not found.');
    const corrected = match.outcome !== null;
    if (corrected && !input.correctionReason?.trim()) {
      throw new Error('A correction reason is required to change a result.');
    }
    if (input.outcome === 'BYE' ? match.playerBId !== null : match.playerBId === null) {
      throw new Error('Limited result does not match the pairing.');
    }
    const audit: StoredLimitedResultAudit = {
      id: randomUUID(),
      matchId: match.id,
      previousOutcome: match.outcome,
      previousPlayerAGameWins: match.playerAGameWins,
      previousPlayerBGameWins: match.playerBGameWins,
      outcome: input.outcome,
      playerAGameWins: input.playerAGameWins,
      playerBGameWins: input.playerBGameWins,
      correctionReason: input.correctionReason ?? null,
      correctedByParticipantId: input.correctedByParticipantId ?? null,
      createdAt: input.reportedAt ?? new Date(),
    };
    match.status = 'COMPLETED';
    match.outcome = input.outcome;
    match.playerAGameWins = input.playerAGameWins;
    match.playerBGameWins = input.playerBGameWins;
    match.reportedAt = input.reportedAt ?? audit.createdAt;
    const audits = this.limitedResultAudits.get(match.id) ?? [];
    audits.push(audit);
    this.limitedResultAudits.set(match.id, audits);
    if (match.tableId) {
      this.releaseMemoryReservations(
        (reservation) =>
          reservation.ownerType === 'LIMITED_MATCH' &&
          reservation.ownerId === match.id,
      );
    }
    return { match, audit, corrected };
  }

  async listLimitedResultAudits(
    eventId: string,
  ): Promise<StoredLimitedResultAudit[]> {
    const matchIds = new Set(
      [...this.limitedSessions.values()]
        .filter((session) => session.eventId === eventId)
        .flatMap((session) =>
          session.rounds.flatMap((round) =>
            round.matches.map((match) => match.id),
          ),
        ),
    );
    return [...this.limitedResultAudits.entries()]
      .filter(([matchId]) => matchIds.has(matchId))
      .flatMap(([, audits]) => audits)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  async dropLimitedParticipant(
    sessionId: string,
    participantId: string,
    droppedAt = new Date(),
  ): Promise<StoredLimitedParticipant> {
    const participant = this.requireLimitedSession(sessionId).participants.find(
      (row) => row.participantId === participantId,
    );
    if (!participant) throw new Error('Limited participant not found.');
    participant.status = 'DROPPED';
    participant.droppedAt = droppedAt;
    const globalParticipant = await this.findParticipantById(participantId);
    if (globalParticipant) globalParticipant.status = 'joined';
    return participant;
  }

  async finishLimitedSession(
    id: string,
    status: 'COMPLETED' | 'CANCELLED',
    completedAt = new Date(),
  ): Promise<StoredLimitedSession> {
    const session = this.requireLimitedSession(id);
    session.status = status;
    session.completedAt = completedAt;
    session.timer = null;
    for (const participant of session.participants) {
      if (participant.status !== 'DROPPED') participant.status = 'COMPLETED';
      const globalParticipant = await this.findParticipantById(
        participant.participantId,
      );
      if (globalParticipant) globalParticipant.status = 'joined';
    }
    const matchIds = new Set(
      session.rounds.flatMap((round) => round.matches.map((match) => match.id)),
    );
    this.releaseMemoryReservations(
      (reservation) =>
        (reservation.ownerType === 'LIMITED_SESSION' &&
          reservation.ownerId === id) ||
        (reservation.ownerType === 'LIMITED_MATCH' &&
          matchIds.has(reservation.ownerId)),
    );
    return session;
  }

  private requireLimitedSession(id: string): StoredLimitedSession {
    const session = this.limitedSessions.get(id);
    if (!session) throw new Error('Limited session not found.');
    return session;
  }

  private releaseMemoryReservations(
    predicate: (reservation: {
      eventId: string;
      ownerType: 'LIMITED_SESSION' | 'LIMITED_MATCH';
      ownerId: string;
    }) => boolean,
  ): void {
    for (const [tableId, reservation] of this.tableReservations) {
      if (predicate(reservation)) {
        this.tableReservations.delete(tableId);
        for (const tableList of this.tables.values()) {
          const table = tableList.find((row) => row.id === tableId);
          if (table) table.status = 'free';
        }
      }
    }
  }

  private findPod(podId: string): StoredPod | undefined {
    for (const list of this.pods.values()) {
      const found = list.find((row) => row.id === podId);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  private findDeck(deckId: string): StoredDeck | undefined {
    for (const list of this.decks.values()) {
      const found = list.find((row) => row.id === deckId);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
}

function assertUnique<T>(values: readonly T[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new LimitedPersistenceConflictError(`${label} must be unique.`);
  }
}

function toCompletedGame(pod: StoredPod): StoredCompletedGame {
  return {
    id: pod.id,
    eventId: pod.eventId,
    poolId: pod.poolId ?? 'open',
    memberIds: [...pod.memberIds],
    trackerUsed: pod.trackerUsed,
    winnerParticipantId: pod.winnerParticipantId ?? null,
    durationSeconds: pod.durationSeconds ?? null,
    completedAt: pod.completedAt ?? null,
    createdAt: pod.createdAt ?? new Date(),
    rating: pod.rating ?? null,
    seats: pod.seats ?? pod.memberIds.map((participantId) => ({
      participantId,
      waitSeconds: 0,
      assignedPoolId: pod.poolId ?? 'open',
    })),
  };
}
