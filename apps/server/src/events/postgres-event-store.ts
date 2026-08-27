import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import {
  events,
  deckOptions,
  challengeCompletions,
  challengePackVersions,
  matchHistory,
  matchHistoryMembers,
  participants,
  physicalTables,
  podMembers,
  pods,
  productEvents,
} from '../db/schema.js';
import type { ChallengePack, ProductEventName } from '@podyguard/shared';
import { parseChallengePack } from '@podyguard/shared';
import {
  EventNotFoundError,
  JoinCodeConflictError,
  PodNotFoundError,
  TableNotFoundError,
  type EventStore,
  type CompletePodInput,
  type NewStoredDeck,
  type NewStoredChallengeCompletion,
  type NewStoredEvent,
  type NewStoredParticipant,
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
          gameMode: input.gameMode ?? 'commander',
          rulesFormat: input.rulesFormat ?? 'commander',
          allowThreePods: input.allowThreePods !== false,
          allowFivePods: Boolean(input.allowFivePods),
          preferredPodSize: input.preferredPodSize ?? 4,
          expiresAt:
            input.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
          ...(input.createdAt ? { createdAt: input.createdAt } : {}),
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

      const participantIds = input.seats.map((seat) => seat.participantId);
      if (participantIds.length > 0) {
        const alreadySeated = await tx
          .select({ participantId: podMembers.participantId })
          .from(podMembers)
          .innerJoin(pods, eq(podMembers.podId, pods.id))
          .where(
            and(
              eq(pods.eventId, input.eventId),
              inArray(pods.status, ['formed', 'playing']),
              inArray(podMembers.participantId, participantIds),
            ),
          );
        if (alreadySeated.length > 0) {
          throw new Error('Participant is already seated in a pod.');
        }
      }
      const people =
        participantIds.length > 0
          ? await tx
              .select()
              .from(participants)
              .where(inArray(participants.id, participantIds))
          : [];
      const peopleById = new Map(people.map((row) => [row.id, row]));
      const now = Date.now();

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
            const person = peopleById.get(seat.participantId);
            const readyAt = person?.readyAt?.getTime();
            return {
              podId: pod.id,
              participantId: seat.participantId,
              assignedPoolId: seat.assignedPoolId,
              assignedDeckId: deck?.id ?? null,
              assignedDeckName: deck?.name ?? null,
              treacheryRole: seat.treacheryRole ?? null,
              treacheryIdentityId: seat.treacheryIdentityId ?? null,
              treacheryUnveiledAt:
                seat.treacheryRole === 'leader' ? new Date() : null,
              waitSeconds: readyAt
                ? Math.max(0, Math.round((now - readyAt) / 1000))
                : 0,
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

      return {
        id: pod.id,
        eventId: input.eventId,
        tableId: table.id,
        tableLabel: table.label,
        playerNames: participantIds.map(
          (id) => peopleById.get(id)?.displayName ?? 'Unknown',
        ),
        status: 'formed',
        poolId: input.poolId,
        memberIds: participantIds,
        trackerUsed: null,
        createdAt: pod.createdAt,
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
        trackerUsed: pods.trackerUsed,
        poolId: podMembers.assignedPoolId,
        deckName: podMembers.assignedDeckName,
        commanders: deckOptions.commanders,
        treacheryRole: podMembers.treacheryRole,
        treacheryIdentityId: podMembers.treacheryIdentityId,
        treacheryUnveiledAt: podMembers.treacheryUnveiledAt,
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
      trackerUsed: row.trackerUsed,
      poolId: row.poolId ?? undefined,
      deckName: row.deckName ?? undefined,
      commanders: row.commanders ?? [],
      treacheryRole: row.treacheryRole ?? undefined,
      treacheryIdentityId: row.treacheryIdentityId ?? undefined,
      treacheryUnveiledAt: row.treacheryUnveiledAt ?? undefined,
    }));
  }

  async findActiveTreacheryAssignment(
    eventId: string,
    participantId: string,
  ): Promise<StoredTreacheryAssignment | undefined> {
    const [row] = await getDb()
      .select({
        podId: pods.id,
        participantId: podMembers.participantId,
        role: podMembers.treacheryRole,
        identityId: podMembers.treacheryIdentityId,
        unveiledAt: podMembers.treacheryUnveiledAt,
        podStatus: pods.status,
      })
      .from(podMembers)
      .innerJoin(pods, eq(podMembers.podId, pods.id))
      .where(
        and(
          eq(pods.eventId, eventId),
          eq(podMembers.participantId, participantId),
          inArray(pods.status, ['formed', 'playing']),
        ),
      )
      .limit(1);
    if (!row?.role || row.identityId === null) {
      return undefined;
    }
    return {
      podId: row.podId,
      participantId: row.participantId,
      role: row.role,
      identityId: row.identityId,
      unveiledAt: row.unveiledAt ?? undefined,
      podStatus: row.podStatus === 'playing' ? 'playing' : 'formed',
    };
  }

  async unveilTreacheryIdentity(
    podId: string,
    participantId: string,
  ): Promise<StoredTreacheryAssignment> {
    const [podRow] = await getDb()
      .select({ eventId: pods.eventId, status: pods.status })
      .from(pods)
      .where(eq(pods.id, podId))
      .limit(1);
    if (
      !podRow ||
      (podRow.status !== 'formed' && podRow.status !== 'playing')
    ) {
      throw new PodNotFoundError();
    }
    const active = await this.findActiveTreacheryAssignment(
      podRow.eventId,
      participantId,
    );
    if (!active || active.podId !== podId) {
      throw new PodNotFoundError();
    }
    const [member] = await getDb()
      .update(podMembers)
      .set({ treacheryUnveiledAt: new Date() })
      .where(
        and(
          eq(podMembers.podId, podId),
          eq(podMembers.participantId, participantId),
        ),
      )
      .returning();
    if (!member?.treacheryRole || member.treacheryIdentityId === null) {
      throw new PodNotFoundError();
    }
    return {
      podId,
      participantId,
      role: member.treacheryRole,
      identityId: member.treacheryIdentityId,
      unveiledAt: member.treacheryUnveiledAt ?? undefined,
      podStatus: podRow.status,
    };
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

  async listChallengeCompletions(
    eventId: string,
  ): Promise<StoredChallengeCompletion[]> {
    const rows = await getDb()
      .select()
      .from(challengeCompletions)
      .where(eq(challengeCompletions.eventId, eventId))
      .orderBy(asc(challengeCompletions.completedAt));
    return rows.map(mapChallengeCompletion);
  }

  async insertChallengeCompletion(
    input: NewStoredChallengeCompletion,
  ): Promise<{ completion: StoredChallengeCompletion; created: boolean }> {
    const [inserted] = await getDb()
      .insert(challengeCompletions)
      .values(input)
      .onConflictDoNothing()
      .returning();
    if (inserted) {
      return {
        completion: mapChallengeCompletion(inserted),
        created: true,
      };
    }
    const [existing] = await getDb()
      .select()
      .from(challengeCompletions)
      .where(
        and(
          eq(challengeCompletions.eventId, input.eventId),
          eq(challengeCompletions.participantId, input.participantId),
          eq(challengeCompletions.challengeId, input.challengeId),
          eq(challengeCompletions.scopeKey, input.scopeKey),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new Error('Challenge completion conflict returned no row.');
    }
    return {
      completion: mapChallengeCompletion(existing),
      created: false,
    };
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

  async setPodTrackerUsed(
    podId: string,
    trackerUsed: boolean,
  ): Promise<StoredPod> {
    const [updated] = await getDb()
      .update(pods)
      .set({ trackerUsed, updatedAt: new Date() })
      .where(
        and(eq(pods.id, podId), inArray(pods.status, ['formed', 'playing'])),
      )
      .returning();
    if (!updated) {
      throw new PodNotFoundError();
    }
    return loadStoredPod(updated);
  }

  async completePod(
    podId: string,
    result: CompletePodInput = {},
  ): Promise<StoredPod> {
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
      if (members.length > 0) {
        await tx
          .update(participants)
          .set({
            status: 'ready',
            readyAt: now,
            updatedAt: now,
          })
          .where(
            inArray(
              participants.id,
              members.map((row) => row.id),
            ),
          );
      }
      await tx
        .update(physicalTables)
        .set({
          status: 'free',
          updatedAt: now,
        })
        .where(eq(physicalTables.id, pod.tableId));
      const [updated] = await tx
        .update(pods)
        .set({
          status: 'completed',
          winnerParticipantId: result.winnerParticipantId ?? null,
          durationSeconds: result.durationSeconds ?? null,
          completedAt: now,
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
        memberIds: members.map((row) => row.id),
        trackerUsed: updated.trackerUsed,
        winnerParticipantId: updated.winnerParticipantId,
        durationSeconds: updated.durationSeconds,
        completedAt: updated.completedAt,
        createdAt: updated.createdAt,
        rating: updated.rating,
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
        trackerUsed: updated.trackerUsed,
      };
    });
  }

  async listCompletedGames(eventId: string): Promise<StoredCompletedGame[]> {
    const rows = await getDb()
      .select({
        pod: pods,
        participantId: podMembers.participantId,
        waitSeconds: podMembers.waitSeconds,
        assignedPoolId: podMembers.assignedPoolId,
      })
      .from(pods)
      .leftJoin(podMembers, eq(podMembers.podId, pods.id))
      .where(and(eq(pods.eventId, eventId), eq(pods.status, 'completed')))
      .orderBy(desc(pods.completedAt), desc(pods.createdAt));
    const byId = new Map<string, StoredCompletedGame>();
    for (const row of rows) {
      const current = byId.get(row.pod.id) ?? {
        id: row.pod.id,
        eventId: row.pod.eventId,
        poolId: row.pod.poolId,
        memberIds: [],
        trackerUsed: row.pod.trackerUsed,
        winnerParticipantId: row.pod.winnerParticipantId,
        durationSeconds: row.pod.durationSeconds,
        completedAt: row.pod.completedAt,
        createdAt: row.pod.createdAt,
        rating: row.pod.rating,
        seats: [],
      };
      if (row.participantId) {
        current.memberIds.push(row.participantId);
        current.seats.push({
          participantId: row.participantId,
          waitSeconds: row.waitSeconds ?? 0,
          assignedPoolId: row.assignedPoolId ?? row.pod.poolId,
        });
      }
      byId.set(row.pod.id, current);
    }
    return [...byId.values()];
  }

  async setPodRating(
    podId: string,
    rating: number,
  ): Promise<StoredCompletedGame> {
    const [updated] = await getDb()
      .update(pods)
      .set({ rating, updatedAt: new Date() })
      .where(
        and(eq(pods.id, podId), eq(pods.status, 'completed')),
      )
      .returning();
    if (!updated) {
      throw new PodNotFoundError();
    }
    const games = await this.listCompletedGames(updated.eventId);
    const game = games.find((row) => row.id === updated.id);
    if (!game) {
      throw new PodNotFoundError();
    }
    return game;
  }

  async findChallengePack(
    eventId: string,
    packId: string,
    version: number,
  ): Promise<ChallengePack | undefined> {
    const [row] = await getDb()
      .select()
      .from(challengePackVersions)
      .where(
        and(
          eq(challengePackVersions.eventId, eventId),
          eq(challengePackVersions.packId, packId),
          eq(challengePackVersions.version, version),
        ),
      )
      .limit(1);
    if (!row) {
      return undefined;
    }
    try {
      return parseChallengePack(row.pack);
    } catch {
      return undefined;
    }
  }

  async insertChallengePackVersion(
    eventId: string,
    pack: ChallengePack,
  ): Promise<ChallengePack> {
    await getDb().insert(challengePackVersions).values({
      eventId,
      packId: pack.id,
      version: pack.version,
      pack,
    });
    return pack;
  }

  async insertProductEvent(
    eventId: string,
    name: ProductEventName,
  ): Promise<void> {
    await getDb().insert(productEvents).values({ eventId, name });
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
    const [row] = await getDb()
      .update(events)
      .set({
        ...(patch.allowThreePods === undefined
          ? {}
          : { allowThreePods: patch.allowThreePods }),
        ...(patch.allowFivePods === undefined
          ? {}
          : { allowFivePods: patch.allowFivePods }),
        ...(patch.preferredPodSize === undefined
          ? {}
          : { preferredPodSize: patch.preferredPodSize }),
        ...(patch.expiresAt === undefined
          ? {}
          : { expiresAt: patch.expiresAt }),
        ...(patch.challengePackId === undefined
          ? {}
          : { challengePackId: patch.challengePackId }),
        ...(patch.challengePackVersion === undefined
          ? {}
          : { challengePackVersion: patch.challengePackVersion }),
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
    trackerUsed: pod.trackerUsed,
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
    gameMode: row.gameMode,
    rulesFormat: row.rulesFormat,
    hostCredentialHash: row.hostCredentialHash,
    allowThreePods: row.allowThreePods,
    allowFivePods: row.allowFivePods,
    preferredPodSize: row.preferredPodSize,
    expiresAt: row.expiresAt,
    challengePackId: row.challengePackId,
    challengePackVersion: row.challengePackVersion,
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

function mapChallengeCompletion(
  row: typeof challengeCompletions.$inferSelect,
): StoredChallengeCompletion {
  return {
    id: row.id,
    eventId: row.eventId,
    participantId: row.participantId,
    podId: row.podId,
    challengeId: row.challengeId,
    scopeKey: row.scopeKey,
    points: row.points,
    completedAt: row.completedAt.toISOString(),
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
