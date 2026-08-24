import { randomUUID } from 'node:crypto';
import {
  JoinCodeConflictError,
  PodNotFoundError,
  TableNotFoundError,
  type EventStore,
  type NewStoredEvent,
  type NewStoredParticipant,
  type NewStoredDeck,
  type NewStoredPod,
  type NewStoredTable,
  type StoredAssignment,
  type StoredDeck,
  type StoredEvent,
  type StoredParticipant,
  type StoredPod,
  type StoredTable,
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

  async insertEvent(input: NewStoredEvent): Promise<StoredEvent> {
    if (this.byJoinCode.has(input.joinCode)) {
      throw new JoinCodeConflictError();
    }
    const event: StoredEvent = {
      id: randomUUID(),
      name: input.name,
      joinCode: input.joinCode,
      status: 'open',
      hostCredentialHash: input.hostCredentialHash,
      allowThreePods: input.allowThreePods !== false,
      allowFivePods: Boolean(input.allowFivePods),
      createdAt: new Date(),
    };
    this.events.set(event.id, event);
    this.byJoinCode.set(event.joinCode, event.id);
    this.participants.set(event.id, []);
    this.tables.set(event.id, []);
    this.pods.set(event.id, []);
    this.assignments.set(event.id, []);
    this.history.set(event.id, []);
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
    for (const seat of input.seats) {
      const participant = await this.findParticipantById(seat.participantId);
      if (!participant || participant.eventId !== input.eventId) {
        throw new Error('Participant not found.');
      }
      participant.status = 'matched';
      names.push(participant.displayName);
      memberIds.push(participant.id);
    }
    table.status = 'occupied';
    const pod: StoredPod = {
      id: randomUUID(),
      eventId: input.eventId,
      tableId: table.id,
      tableLabel: table.label,
      playerNames: names,
      status: 'formed',
      poolId: input.poolId,
      memberIds,
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
        poolId: seat.assignedPoolId,
        deckName: deck?.name ?? undefined,
        commanders: deck?.commanders ?? [],
      });
    }
    this.assignments.set(input.eventId, assignments);
    return pod;
  }

  async listAssignments(eventId: string): Promise<StoredAssignment[]> {
    return [...(this.assignments.get(eventId) ?? [])];
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

  async completePod(podId: string): Promise<StoredPod> {
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
      if (participant.isBot) {
        participant.status = 'ready';
        participant.readyAt = new Date();
      } else {
        participant.status = 'joined';
        participant.readyAt = null;
      }
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

  async updateEvent(
    id: string,
    patch: { allowThreePods?: boolean; allowFivePods?: boolean },
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
