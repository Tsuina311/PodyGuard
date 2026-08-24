import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import {
  events,
  deckOptions,
  matchHistory,
  matchHistoryMembers,
  participants,
  physicalTables,
  podMembers,
  pods,
} from '../db/schema.js';
import {
  EventNotFoundError,
  JoinCodeConflictError,
  PodNotFoundError,
  TableNotFoundError,
  type EventStore,
  type NewStoredDeck,
  type NewStoredEvent,
  type NewStoredParticipant,
  type NewStoredPod,
  type NewStoredTable,
  type StoredAssignment,
  type StoredDeck,
  type StoredEvent,
  type StoredParticipant,
  type StoredPod,
  type StoredTable,
} from './event-store.js';

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  );
}

export class PostgresEventStore implements EventStore {
  async insertEvent(input: NewStoredEvent): Promise<StoredEvent> {
    try {
      const [row] = await getDb()
        .insert(events)
        .values({
          name: input.name,
          publicJoinCode: input.joinCode,
          hostCredentialHash: input.hostCredentialHash,
          allowThreePods: input.allowThreePods !== false,
          allowFivePods: Boolean(input.allowFivePods),
        })
        .returning();
      if (!row) {
        throw new Error('Event insert returned no row.');
      }
      return mapEvent(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new JoinCodeConflictError();
      }
      throw error;
    }
  }

  async findEventByJoinCode(joinCode: string): Promise<StoredEvent | undefined> {
    const [row] = await getDb()
      .select()
      .from(events)
      .where(eq(events.publicJoinCode, joinCode))
      .limit(1);
    return row ? mapEvent(row) : undefined;
  }

  async findEventById(id: string): Promise<StoredEvent | undefined> {
    const [row] = await getDb()
      .select()
      .from(events)
      .where(eq(events.id, id))
      .limit(1);
    return row ? mapEvent(row) : undefined;
  }

  async insertParticipant(
    input: NewStoredParticipant,
  ): Promise<StoredParticipant> {
    const [row] = await getDb()
      .insert(participants)
      .values({
        eventId: input.eventId,
        displayName: input.displayName,
        isBot: input.isBot ?? false,
        status: input.status ?? 'joined',
        readyAt: input.readyAt ?? null,
      })
      .returning();
    if (!row) {
      throw new Error('Participant insert returned no row.');
    }
    return mapParticipant(row);
  }

  async findParticipantById(id: string): Promise<StoredParticipant | undefined> {
    const [row] = await getDb()
      .select()
      .from(participants)
      .where(eq(participants.id, id))
      .limit(1);
    return row ? mapParticipant(row) : undefined;
  }

  async listParticipants(eventId: string): Promise<StoredParticipant[]> {
    const rows = await getDb()
      .select()
      .from(participants)
      .where(eq(participants.eventId, eventId))
      .orderBy(asc(participants.createdAt));
    return rows.map(mapParticipant);
  }

  async updateParticipant(
    id: string,
    patch: {
      status: StoredParticipant['status'];
      readyAt: Date | null;
      flexCredits?: number;
    },
  ): Promise<StoredParticipant> {
    const [row] = await getDb()
      .update(participants)
      .set({
        status: patch.status,
        readyAt: patch.readyAt,
        ...(patch.flexCredits === undefined
          ? {}
          : { flexCredits: patch.flexCredits }),
        updatedAt: new Date(),
      })
      .where(eq(participants.id, id))
      .returning();
    if (!row) {
      throw new Error('Participant not found.');
    }
    return mapParticipant(row);
  }

  async insertTable(input: NewStoredTable): Promise<StoredTable> {
    const [row] = await getDb()
      .insert(physicalTables)
      .values({
        eventId: input.eventId,
        label: input.label,
        sortOrder: input.sortOrder,
      })
      .returning();
    if (!row) {
      throw new Error('Table insert returned no row.');
    }
    return mapTable(row);
  }

  async listTables(eventId: string): Promise<StoredTable[]> {
    const rows = await getDb()
      .select()
      .from(physicalTables)
      .where(eq(physicalTables.eventId, eventId))
      .orderBy(asc(physicalTables.sortOrder), asc(physicalTables.createdAt));
    return rows.map(mapTable);
  }

  async findTableById(id: string): Promise<StoredTable | undefined> {
    const [row] = await getDb()
      .select()
      .from(physicalTables)
      .where(eq(physicalTables.id, id))
      .limit(1);
    return row ? mapTable(row) : undefined;
  }

  async updateTableStatus(
    id: string,
    status: StoredTable['status'],
  ): Promise<StoredTable> {
    const [row] = await getDb()
      .update(physicalTables)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(physicalTables.id, id))
      .returning();
    if (!row) {
      throw new TableNotFoundError();
    }
    return mapTable(row);
  }

  async createPod(input: NewStoredPod): Promise<StoredPod> {
    const db = getDb();
    return db.transaction(async (tx) => {
      const [table] = await tx
        .select()
        .from(physicalTables)
        .where(eq(physicalTables.id, input.tableId))
        .limit(1);
      if (!table || table.eventId !== input.eventId) {
        throw new TableNotFoundError();
      }

      const [pod] = await tx
        .insert(pods)
        .values({
          eventId: input.eventId,
          tableId: input.tableId,
          poolId: input.poolId,
        })
        .returning();
      if (!pod) {
        throw new Error('Pod insert returned no row.');
      }

      const participantIds = input.seats.map((seat) => seat.participantId);
      const deckIds = input.seats
        .map((seat) => seat.deckId)
        .filter((id) => isUuid(id));
      const deckRows =
        deckIds.length > 0
          ? await tx
              .select()
              .from(deckOptions)
              .where(inArray(deckOptions.id, deckIds))
          : [];
      const decksById = new Map(deckRows.map((row) => [row.id, row]));

      if (input.seats.length > 0) {
        await tx.insert(podMembers).values(
          input.seats.map((seat) => {
            const deck = decksById.get(seat.deckId);
            return {
              podId: pod.id,
              participantId: seat.participantId,
              assignedPoolId: seat.assignedPoolId,
              assignedDeckId: deck?.id ?? null,
              assignedDeckName: deck?.name ?? null,
            };
          }),
        );
        await tx
          .update(participants)
          .set({
            status: 'matched',
            updatedAt: new Date(),
          })
          .where(inArray(participants.id, participantIds));
      }

      await tx
        .update(physicalTables)
        .set({
          status: 'occupied',
          updatedAt: new Date(),
        })
        .where(eq(physicalTables.id, input.tableId));

      const members = await tx
        .select()
        .from(participants)
        .where(inArray(participants.id, participantIds));
      const byId = new Map(members.map((row) => [row.id, row.displayName]));

      return {
        id: pod.id,
        eventId: input.eventId,
        tableId: table.id,
        tableLabel: table.label,
        playerNames: participantIds.map((id) => byId.get(id) ?? 'Unknown'),
        status: 'formed',
        poolId: input.poolId,
        memberIds: participantIds,
      };
    });
  }

  async listAssignments(eventId: string): Promise<StoredAssignment[]> {
    const rows = await getDb()
      .select({
        podId: pods.id,
        participantId: podMembers.participantId,
        tableId: physicalTables.id,
        tableLabel: physicalTables.label,
        podStatus: pods.status,
        poolId: podMembers.assignedPoolId,
        deckName: podMembers.assignedDeckName,
        commanders: deckOptions.commanders,
      })
      .from(podMembers)
      .innerJoin(pods, eq(podMembers.podId, pods.id))
      .innerJoin(physicalTables, eq(pods.tableId, physicalTables.id))
      .leftJoin(deckOptions, eq(podMembers.assignedDeckId, deckOptions.id))
      .where(
        and(eq(pods.eventId, eventId), inArray(pods.status, ['formed', 'playing'])),
      );
    return rows.map((row) => ({
      podId: row.podId,
      participantId: row.participantId,
      tableId: row.tableId,
      tableLabel: row.tableLabel,
      podStatus: row.podStatus === 'playing' ? 'playing' : 'formed',
      poolId: row.poolId ?? undefined,
      deckName: row.deckName ?? undefined,
      commanders: row.commanders ?? [],
    }));
  }

  async listDecks(eventId: string): Promise<StoredDeck[]> {
    const rows = await getDb()
      .select({
        id: deckOptions.id,
        participantId: deckOptions.participantId,
        name: deckOptions.name,
        poolId: deckOptions.poolId,
        preference: deckOptions.preference,
        commanders: deckOptions.commanders,
      })
      .from(deckOptions)
      .innerJoin(participants, eq(deckOptions.participantId, participants.id))
      .where(eq(participants.eventId, eventId))
      .orderBy(asc(deckOptions.createdAt));
    return rows.map((row) => ({
      id: row.id,
      participantId: row.participantId,
      name: row.name,
      poolId: row.poolId,
      preference: row.preference === 'accepted' ? 'accepted' : 'preferred',
      commanders: row.commanders ?? [],
    }));
  }

  async replaceDecks(
    participantId: string,
    decks: NewStoredDeck[],
  ): Promise<StoredDeck[]> {
    const db = getDb();
    return db.transaction(async (tx) => {
      await tx.delete(deckOptions).where(eq(deckOptions.participantId, participantId));
      if (decks.length === 0) {
        return [];
      }
      const rows = await tx
        .insert(deckOptions)
        .values(
          decks.map((row) => ({
            participantId: row.participantId,
            name: row.name,
            poolId: row.poolId,
            preference: row.preference,
            commanders: row.commanders,
          })),
        )
        .returning();
      return rows.map((row) => ({
        id: row.id,
        participantId: row.participantId,
        name: row.name,
        poolId: row.poolId,
        preference: row.preference === 'accepted' ? 'accepted' : 'preferred',
        commanders: row.commanders ?? [],
      }));
    });
  }

  async listMatchHistory(eventId: string): Promise<string[][]> {
    const groups = await getDb()
      .select()
      .from(matchHistory)
      .where(eq(matchHistory.eventId, eventId))
      .orderBy(asc(matchHistory.createdAt));
    if (groups.length === 0) {
      return [];
    }
    const members = await getDb()
      .select()
      .from(matchHistoryMembers)
      .where(
        inArray(
          matchHistoryMembers.matchHistoryId,
          groups.map((row) => row.id),
        ),
      );
    const byGroup = new Map<string, string[]>();
    for (const member of members) {
      const list = byGroup.get(member.matchHistoryId) ?? [];
      list.push(member.participantId);
      byGroup.set(member.matchHistoryId, list);
    }
    return groups.map((row) => byGroup.get(row.id) ?? []);
  }

  async findActivePodByTableId(
    eventId: string,
    tableId: string,
  ): Promise<StoredPod | undefined> {
    const [pod] = await getDb()
      .select()
      .from(pods)
      .where(
        and(
          eq(pods.eventId, eventId),
          eq(pods.tableId, tableId),
          inArray(pods.status, ['formed', 'playing']),
        ),
      )
      .limit(1);
    if (!pod) {
      return undefined;
    }
    return loadStoredPod(pod);
  }

  async startPod(podId: string): Promise<StoredPod> {
    const db = getDb();
    const updated = await db.transaction(async (tx) => {
      const [pod] = await tx
        .select()
        .from(pods)
        .where(eq(pods.id, podId))
        .limit(1);
      if (!pod || (pod.status !== 'formed' && pod.status !== 'playing')) {
        throw new PodNotFoundError();
      }
      const [next] = await tx
        .update(pods)
        .set({
          status: 'playing',
          updatedAt: new Date(),
        })
        .where(eq(pods.id, pod.id))
        .returning();
      if (!next) {
        throw new PodNotFoundError();
      }
      const members = await tx
        .select({ participantId: podMembers.participantId })
        .from(podMembers)
        .where(eq(podMembers.podId, pod.id));
      const ids = members.map((row) => row.participantId);
      if (ids.length > 0) {
        await tx
          .update(participants)
          .set({
            status: 'playing',
            updatedAt: new Date(),
          })
          .where(inArray(participants.id, ids));
      }
      return next;
    });
    return loadStoredPod(updated);
  }

  async completePod(podId: string): Promise<StoredPod> {
    const db = getDb();
    return db.transaction(async (tx) => {
      const [pod] = await tx
        .select()
        .from(pods)
        .where(eq(pods.id, podId))
        .limit(1);
      if (!pod || (pod.status !== 'formed' && pod.status !== 'playing')) {
        throw new PodNotFoundError();
      }
      const members = await tx
        .select({
          id: participants.id,
          isBot: participants.isBot,
        })
        .from(podMembers)
        .innerJoin(participants, eq(podMembers.participantId, participants.id))
        .where(eq(podMembers.podId, pod.id));
      const humans = members.filter((row) => !row.isBot).map((row) => row.id);
      const bots = members.filter((row) => row.isBot).map((row) => row.id);
      const now = new Date();
      if (members.length > 0) {
        const [historyRow] = await tx
          .insert(matchHistory)
          .values({ eventId: pod.eventId })
          .returning();
        if (historyRow) {
          await tx.insert(matchHistoryMembers).values(
            members.map((row) => ({
              matchHistoryId: historyRow.id,
              participantId: row.id,
            })),
          );
        }
      }
      if (humans.length > 0) {
        await tx
          .update(participants)
          .set({
            status: 'joined',
            readyAt: null,
            updatedAt: now,
          })
          .where(inArray(participants.id, humans));
      }
      if (bots.length > 0) {
        await tx
          .update(participants)
          .set({
            status: 'ready',
            readyAt: now,
            updatedAt: now,
          })
          .where(inArray(participants.id, bots));
      }
      await tx
        .update(physicalTables)
        .set({
          status: 'free',
          updatedAt: now,
        })
        .where(eq(physicalTables.id, pod.tableId));
      await tx.delete(podMembers).where(eq(podMembers.podId, pod.id));
      const [updated] = await tx
        .update(pods)
        .set({
          status: 'completed',
          updatedAt: now,
        })
        .where(eq(pods.id, pod.id))
        .returning();
      if (!updated) {
        throw new PodNotFoundError();
      }
      return {
        id: updated.id,
        eventId: updated.eventId,
        tableId: updated.tableId,
        tableLabel: '',
        playerNames: [],
        status: 'completed',
        poolId: updated.poolId,
        memberIds: [],
      };
    });
  }

  async cancelPod(podId: string): Promise<StoredPod> {
    const db = getDb();
    return db.transaction(async (tx) => {
      const [pod] = await tx.select().from(pods).where(eq(pods.id, podId)).limit(1);
      if (!pod || (pod.status !== 'formed' && pod.status !== 'playing')) {
        throw new PodNotFoundError();
      }
      const members = await tx
        .select({ id: participants.id })
        .from(podMembers)
        .innerJoin(participants, eq(podMembers.participantId, participants.id))
        .where(eq(podMembers.podId, pod.id));
      const ids = members.map((row) => row.id);
      const now = new Date();
      if (ids.length > 0) {
        await tx
          .update(participants)
          .set({
            status: 'ready',
            readyAt: now,
            updatedAt: now,
          })
          .where(inArray(participants.id, ids));
      }
      await tx
        .update(physicalTables)
        .set({
          status: 'free',
          updatedAt: now,
        })
        .where(eq(physicalTables.id, pod.tableId));
      await tx.delete(podMembers).where(eq(podMembers.podId, pod.id));
      const [updated] = await tx
        .update(pods)
        .set({
          status: 'cancelled',
          updatedAt: now,
        })
        .where(eq(pods.id, pod.id))
        .returning();
      if (!updated) {
        throw new PodNotFoundError();
      }
      return {
        id: updated.id,
        eventId: updated.eventId,
        tableId: updated.tableId,
        tableLabel: '',
        playerNames: [],
        status: 'cancelled',
        poolId: updated.poolId,
        memberIds: [],
      };
    });
  }

  async updateEvent(
    id: string,
    patch: { allowThreePods?: boolean; allowFivePods?: boolean },
  ): Promise<StoredEvent> {
    const [row] = await getDb()
      .update(events)
      .set({
        ...(patch.allowThreePods === undefined
          ? {}
          : { allowThreePods: patch.allowThreePods }),
        ...(patch.allowFivePods === undefined
          ? {}
          : { allowFivePods: patch.allowFivePods }),
        updatedAt: new Date(),
      })
      .where(eq(events.id, id))
      .returning();
    if (!row) {
      throw new EventNotFoundError();
    }
    return mapEvent(row);
  }
}

async function loadStoredPod(
  pod: typeof pods.$inferSelect,
): Promise<StoredPod> {
  const [table] = await getDb()
    .select()
    .from(physicalTables)
    .where(eq(physicalTables.id, pod.tableId))
    .limit(1);
  const members = await getDb()
    .select({
      id: participants.id,
      displayName: participants.displayName,
    })
    .from(podMembers)
    .innerJoin(participants, eq(podMembers.participantId, participants.id))
    .where(eq(podMembers.podId, pod.id));
  return {
    id: pod.id,
    eventId: pod.eventId,
    tableId: pod.tableId,
    tableLabel: table?.label ?? '',
    playerNames: members.map((row) => row.displayName),
    status: pod.status === 'playing' ? 'playing' : 'formed',
    poolId: pod.poolId,
    memberIds: members.map((row) => row.id),
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function mapEvent(row: typeof events.$inferSelect): StoredEvent {
  return {
    id: row.id,
    name: row.name,
    joinCode: row.publicJoinCode,
    status: row.status,
    hostCredentialHash: row.hostCredentialHash,
    allowThreePods: row.allowThreePods,
    allowFivePods: row.allowFivePods,
    createdAt: row.createdAt,
  };
}

function mapParticipant(
  row: typeof participants.$inferSelect,
): StoredParticipant {
  return {
    id: row.id,
    eventId: row.eventId,
    displayName: row.displayName,
    isBot: row.isBot,
    status: row.status,
    readyAt: row.readyAt ?? null,
    flexCredits: row.flexCredits,
    createdAt: row.createdAt,
  };
}

function mapTable(row: typeof physicalTables.$inferSelect): StoredTable {
  return {
    id: row.id,
    eventId: row.eventId,
    label: row.label,
    sortOrder: row.sortOrder,
    status: row.status,
    createdAt: row.createdAt,
  };
}
