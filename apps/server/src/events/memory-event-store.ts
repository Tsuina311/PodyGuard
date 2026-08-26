import { randomUUID } from 'node:crypto';
import type { ChallengePack, ProductEventName } from '@podyguard/shared';
import {
  JoinCodeConflictError,
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
  type StoredAssignment,
  type StoredCompletedGame,
  type StoredDeck,
  type StoredChallengeCompletion,
  type StoredEvent,
  type StoredParticipant,
  type StoredPod,
  type StoredTable,
  type StoredTreacheryAssignment,
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
      hostCredentialHash: input.hostCredentialHash,
      allowThreePods: input.allowThreePods !== false,
      allowFivePods: Boolean(input.allowFivePods),
      preferredPodSize: input.preferredPodSize ?? 4,
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
      participant.status = 'ready';
      participant.readyAt = new Date();
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
      allowThreePods?: boolean;
      allowFivePods?: boolean;
      preferredPodSize?: number;
      expiresAt?: Date;
      challengePackId?: string;
      challengePackVersion?: number;
    },
  ): Promise<StoredEvent> {
    const event = this.events.get(id);
    if (!event) {
      throw new Error('Event not found.');
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
    return event;
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
