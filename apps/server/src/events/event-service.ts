import {
  EventStatus,
  ParticipantStatus,
  PhysicalTableStatus,
  type PublicEvent,
  type PublicParticipant,
  type PublicPod,
  type PublicTable,
} from '@podyguard/shared';
import {
  InvalidParticipantSessionError,
  type IdentityBoundary,
} from '../identity/index.js';
import { boundedFlex, createMatches, allowedPodSizes } from '@podyguard/matching';
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
  type StoredDeck,
  type StoredEvent,
  type StoredParticipant,
  type StoredTable,
} from './event-store.js';
import {
  assertDecks,
  assertDisplayName,
  assertEventName,
  assertHostPin,
  assertTableCount,
  assertTableLabel,
  hashHostPin,
  InvalidEventInputError,
  verifyHostPin,
  type DeckDraft,
} from './validation.js';

const JOIN_CODE_ATTEMPTS = 8;

export type CreateEventInput = {
  name: string;
  hostPin: string;
  tableCount: number;
  allowThreePods?: boolean;
  allowFivePods?: boolean;
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
    const labels = resolveTableLabels({ count: input.tableCount }, 0);
    const hostCredentialHash = await hashHostPin(hostPin);

    let stored: StoredEvent | undefined;
    for (let attempt = 0; attempt < JOIN_CODE_ATTEMPTS; attempt += 1) {
      try {
        stored = await this.store.insertEvent({
          name,
          joinCode: generateJoinCode(),
          hostCredentialHash,
          allowThreePods: input.allowThreePods !== false,
          allowFivePods: Boolean(input.allowFivePods),
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
    return { event: toPublicEvent(stored), hostToken: token };
  }

  async getEvent(joinCode: string): Promise<PublicEvent> {
    const stored = await this.requireByJoinCode(joinCode);
    return toPublicEvent(stored);
  }

  async listParticipants(joinCode: string): Promise<PublicParticipant[]> {
    const stored = await this.requireByJoinCode(joinCode);
    const [rows, assignments, decks] = await Promise.all([
      this.store.listParticipants(stored.id),
      this.store.listAssignments(stored.id),
      this.store.listDecks(stored.id),
    ]);
    const byParticipant = assignmentMap(assignments);
    const decksByParticipant = decksMap(decks);
    return rows.map((row) =>
      toPublicParticipant(
        row,
        byParticipant.get(row.id),
        decksByParticipant.get(row.id) ?? [],
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
    return {
      event: toPublicEvent(stored),
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
    return { event: toPublicEvent(stored), hostToken: token };
  }

  verifyHostToken(joinCode: string, token: string): Promise<PublicEvent> {
    return this.requireHostToken(joinCode, token);
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
      event: toPublicEvent(stored),
      participant: await this.present(participant, seat),
    };
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
    return this.snapshotTable(stored.id, tableId);
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
    patch: { allowThreePods?: boolean; allowFivePods?: boolean },
  ): Promise<PublicEvent> {
    const stored = await this.requireHostToken(joinCode, hostToken);
    const updated = await this.store.updateEvent(stored.id, {
      allowThreePods:
        patch.allowThreePods === undefined
          ? stored.allowThreePods
          : Boolean(patch.allowThreePods),
      allowFivePods:
        patch.allowFivePods === undefined
          ? stored.allowFivePods
          : Boolean(patch.allowFivePods),
    });
    return toPublicEvent(updated);
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
    const seatsNeeded =
      freeTables.length *
      Math.max(
        ...allowedPodSizes({
          allowThree: stored.allowThreePods,
          allowFive: stored.allowFivePods,
        }),
      );
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
    const sizes = allowedPodSizes({
      allowThree: event.allowThreePods,
      allowFive: event.allowFivePods,
    });
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
      { allowedSizes: sizes, preferredSize: 4 },
    );
    const created: PublicPod[] = [];
    for (const match of result.matches) {
      const pod = await this.store.createPod({
        eventId,
        tableId: match.tableId,
        poolId: match.poolId,
        seats: match.seats.map((seat) => ({
          participantId: seat.participantId,
          deckId: seat.deckId,
          assignedPoolId: seat.poolId,
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
      }
      created.push({
        id: pod.id,
        tableLabel: pod.tableLabel,
        playerNames: pod.playerNames,
        status: pod.status,
        poolId: pod.poolId,
      });
    }
    return created;
  }

  private async present(
    participant: StoredParticipant,
    assignment?: StoredAssignment,
  ): Promise<PublicParticipant> {
    const decks = (await this.store.listDecks(participant.eventId)).filter(
      (row) => row.participantId === participant.id,
    );
    return toPublicParticipant(participant, assignment, decks);
  }

  private async requireHostToken(
    joinCode: string,
    token: string,
  ): Promise<PublicEvent> {
    const stored = await this.requireByJoinCode(joinCode);
    const session = this.identity.hostEventSessions.verify(token);
    if (session.eventId !== stored.id) {
      throw new InvalidHostPinError();
    }
    return toPublicEvent(stored);
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
      ),
    );
  }

  private async requireByJoinCode(joinCode: string): Promise<StoredEvent> {
    const stored = await this.store.findEventByJoinCode(joinCode);
    if (!stored) {
      throw new EventNotFoundError();
    }
    return stored;
  }
}

function toPublicEvent(event: StoredEvent): PublicEvent {
  return {
    id: event.id,
    name: event.name,
    joinCode: event.joinCode,
    status: event.status,
    allowThreePods: event.allowThreePods,
    allowFivePods: event.allowFivePods,
  };
}

function toPublicParticipant(
  row: StoredParticipant,
  assignment?: StoredAssignment,
  decks: StoredDeck[] = [],
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
    flexCredits: row.flexCredits ?? 0,
  };
}

function toPublicTable(
  row: StoredTable,
  seatedNames: string[],
  podStatus?: 'formed' | 'playing',
  poolId?: string,
): PublicTable {
  return {
    id: row.id,
    label: row.label,
    sortOrder: row.sortOrder,
    status: row.status,
    seatedNames,
    podStatus,
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
