import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import {
  events,
  deckOptions,
  challengeCompletions,
  challengePackVersions,
  matchHistory,
  matchHistoryMembers,
  limitedSessions,
  limitedSessionParticipants,
  draftSeats,
  limitedRounds,
  limitedMatches,
  limitedMatchParticipants,
  limitedResultAudits,
  tableReservations,
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
  LimitedPersistenceConflictError,
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
          tournamentFormat: input.tournamentFormat ?? null,
          tournamentState: input.tournamentState ?? null,
          limitedModeConfigs: input.limitedModeConfigs ?? [],
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
      limitedQueueMode?: StoredParticipant['limitedQueueMode'];
      limitedQueuedAt?: Date | null;
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
        ...(patch.limitedQueueMode === undefined
          ? {}
          : { limitedQueueMode: patch.limitedQueueMode }),
        ...(patch.limitedQueuedAt === undefined
          ? {}
          : { limitedQueuedAt: patch.limitedQueuedAt }),
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
        .limit(1)
        .for('update');
      if (!table || table.eventId !== input.eventId) {
        throw new TableNotFoundError();
      }
      if (table.status !== 'free') {
        throw new LimitedPersistenceConflictError(
          'The requested physical table is not available.',
        );
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
          tournamentMatchId: input.tournamentMatchId ?? null,
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
        tournamentMatchId: pod.tournamentMatchId,
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
            status: result.requeue === false ? 'joined' : 'ready',
            readyAt: result.requeue === false ? null : now,
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
        tournamentMatchId: updated.tournamentMatchId,
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
    const [row] = await getDb()
      .update(events)
      .set({
        ...(patch.status === undefined ? {} : { status: patch.status }),
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
        ...(patch.tournamentState === undefined
          ? {}
          : { tournamentState: patch.tournamentState }),
        updatedAt: new Date(),
      })
      .where(eq(events.id, id))
      .returning();
    if (!row) {
      throw new EventNotFoundError();
    }
    return mapEvent(row);
  }

  async createLimitedSession(
    input: NewStoredLimitedSession,
  ): Promise<StoredLimitedSession> {
    let sessionId: string;
    try {
      sessionId = await getDb().transaction(async (tx) => {
        const participantIds = input.participants.map(
          (row) => row.participantId,
        );
        assertUniqueLimited(participantIds, 'Limited session participant');
        assertUniqueLimited(
          input.participants
            .map((row) => row.draftSeat)
            .filter((seat): seat is number => seat !== undefined),
          'Limited draft seat',
        );
        const draftTableIds = input.draftTableIds ?? [];
        assertUniqueLimited(draftTableIds, 'Limited draft table');
        const people = participantIds.length
          ? await tx
              .select({ id: participants.id })
              .from(participants)
              .where(
                and(
                  eq(participants.eventId, input.eventId),
                  inArray(participants.id, participantIds),
                ),
              )
          : [];
        if (people.length !== participantIds.length) {
          throw new Error('Limited participant does not belong to the event.');
        }
        const tables = draftTableIds.length
          ? await tx
              .select({
                id: physicalTables.id,
                status: physicalTables.status,
              })
              .from(physicalTables)
              .where(
                and(
                  eq(physicalTables.eventId, input.eventId),
                  inArray(physicalTables.id, draftTableIds),
                ),
              )
              .for('update')
          : [];
        if (tables.length !== draftTableIds.length) throw new TableNotFoundError();
        if (tables.some((table) => table.status !== 'free')) {
          throw new LimitedPersistenceConflictError(
            'A requested physical table is not available.',
          );
        }
        const [session] = await tx
          .insert(limitedSessions)
          .values({
            eventId: input.eventId,
            mode: input.mode,
            label: input.label,
            matchStructure: input.matchStructure,
            pairingPolicy: input.pairingPolicy,
            preferredCohortSize: input.preferredCohortSize ?? null,
            minCohortSize: input.minCohortSize,
            maxCohortSize: input.maxCohortSize ?? null,
            allowUndersizedLaunch: input.allowUndersizedLaunch ?? false,
            totalRounds: input.totalRounds,
            draftTableIds,
            ...(input.createdAt ? { createdAt: input.createdAt } : {}),
          })
          .returning({ id: limitedSessions.id });
        if (!session) throw new Error('Limited session insert returned no row.');
        if (input.participants.length) {
          const assignedAt = input.createdAt ?? new Date();
          await tx.insert(limitedSessionParticipants).values(
            input.participants.map((row) => ({
              sessionId: session.id,
              participantId: row.participantId,
              status: row.status ?? 'ASSIGNED',
              draftSeat: row.draftSeat ?? null,
              joinedAt: row.queuedAt ?? assignedAt,
              assignedAt,
            })),
          );
          const seats = input.participants.filter(
            (row): row is typeof row & { draftSeat: number } =>
              row.draftSeat !== undefined,
          );
          if (seats.length) {
            await tx.insert(draftSeats).values(
              seats.map((row) => ({
                sessionId: session.id,
                participantId: row.participantId,
                seat: row.draftSeat,
              })),
            );
          }
        }
        if (draftTableIds.length) {
          await tx.insert(tableReservations).values(
            draftTableIds.map((tableId) => ({
              eventId: input.eventId,
              tableId,
              ownerType: 'LIMITED_SESSION',
              ownerId: session.id,
              purpose: 'DRAFT',
            })),
          );
          await tx
            .update(physicalTables)
            .set({ status: 'occupied', updatedAt: new Date() })
            .where(inArray(physicalTables.id, draftTableIds));
        }
        if (participantIds.length) {
          await tx
            .update(participants)
            .set({
              status: 'matched',
              readyAt: null,
              limitedQueueMode: null,
              limitedQueuedAt: null,
              updatedAt: new Date(),
            })
            .where(inArray(participants.id, participantIds));
        }
        return session.id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new LimitedPersistenceConflictError(
          'Limited membership, seat, round, or table reservation conflicts.',
        );
      }
      throw error;
    }
    const stored = await loadLimitedSession(sessionId);
    if (!stored) throw new Error('Limited session disappeared after creation.');
    return stored;
  }

  async findLimitedSessionById(
    id: string,
  ): Promise<StoredLimitedSession | undefined> {
    return loadLimitedSession(id);
  }

  async listLimitedSessions(eventId: string): Promise<StoredLimitedSession[]> {
    const rows = await getDb()
      .select({ id: limitedSessions.id })
      .from(limitedSessions)
      .where(eq(limitedSessions.eventId, eventId))
      .orderBy(asc(limitedSessions.createdAt));
    return Promise.all(rows.map((row) => loadLimitedSessionRequired(row.id)));
  }

  async replaceLimitedSessionRoster(
    id: string,
    input: Array<{ participantId: string; draftSeat?: number }>,
  ): Promise<StoredLimitedSession> {
    try {
      await getDb().transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(limitedSessions)
          .where(eq(limitedSessions.id, id))
          .limit(1)
          .for('update');
        if (!session) throw new Error('Limited session not found.');
        if (session.status !== 'FORMING') {
          throw new LimitedPersistenceConflictError(
            'Only a forming Limited session can change its roster.',
          );
        }
        const participantIds = input.map((row) => row.participantId);
        assertUniqueLimited(participantIds, 'Limited session participant');
        assertUniqueLimited(
          input
            .map((row) => row.draftSeat)
            .filter((seat): seat is number => seat !== undefined),
          'Limited draft seat',
        );
        const people = participantIds.length
          ? await tx
              .select({ id: participants.id })
              .from(participants)
              .where(
                and(
                  eq(participants.eventId, session.eventId),
                  inArray(participants.id, participantIds),
                ),
              )
          : [];
        if (people.length !== participantIds.length) {
          throw new Error('Limited participant does not belong to the event.');
        }
        const previous = await tx
          .select()
          .from(limitedSessionParticipants)
          .where(eq(limitedSessionParticipants.sessionId, id));
        const nextIds = new Set(participantIds);
        const removed = previous.filter(
          (row) => !nextIds.has(row.participantId),
        );
        await tx
          .delete(limitedSessionParticipants)
          .where(eq(limitedSessionParticipants.sessionId, id));
        await tx.delete(draftSeats).where(eq(draftSeats.sessionId, id));
        const now = new Date();
        if (removed.length) {
          await tx
            .update(participants)
            .set({
              status: 'joined',
              readyAt: null,
              limitedQueueMode: session.mode,
              limitedQueuedAt: now,
              updatedAt: now,
            })
            .where(
              inArray(
                participants.id,
                removed.map((row) => row.participantId),
              ),
            );
        }
        if (input.length) {
          const previousById = new Map(
            previous.map((row) => [row.participantId, row]),
          );
          await tx.insert(limitedSessionParticipants).values(
            input.map((row) => ({
              sessionId: id,
              participantId: row.participantId,
              status: 'ASSIGNED' as const,
              draftSeat: row.draftSeat ?? null,
              joinedAt: previousById.get(row.participantId)?.joinedAt ?? now,
              assignedAt: now,
            })),
          );
          const seats = input.filter(
            (row): row is typeof row & { draftSeat: number } =>
              row.draftSeat !== undefined,
          );
          if (seats.length) {
            await tx.insert(draftSeats).values(
              seats.map((row) => ({
                sessionId: id,
                participantId: row.participantId,
                seat: row.draftSeat,
              })),
            );
          }
          await tx
            .update(participants)
            .set({
              status: 'matched',
              readyAt: null,
              limitedQueueMode: null,
              limitedQueuedAt: null,
              updatedAt: now,
            })
            .where(inArray(participants.id, participantIds));
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new LimitedPersistenceConflictError(
          'Limited membership or draft seat conflicts.',
        );
      }
      throw error;
    }
    return loadLimitedSessionRequired(id);
  }

  async replaceLimitedDraftTables(
    id: string,
    tableIds: string[],
  ): Promise<StoredLimitedSession> {
    assertUniqueLimited(tableIds, 'Limited draft table');
    try {
      await getDb().transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(limitedSessions)
          .where(eq(limitedSessions.id, id))
          .limit(1)
          .for('update');
        if (!session) throw new Error('Limited session not found.');
        if (session.status !== 'FORMING') {
          throw new LimitedPersistenceConflictError(
            'Only a forming Limited session can change draft tables.',
          );
        }
        const previous = await tx
          .select({ tableId: tableReservations.tableId })
          .from(tableReservations)
          .where(
            and(
              eq(tableReservations.ownerType, 'LIMITED_SESSION'),
              eq(tableReservations.ownerId, id),
              isNull(tableReservations.releasedAt),
            ),
          );
        const previousIds = new Set(previous.map((row) => row.tableId));
        const lockIds = [...new Set([...previousIds, ...tableIds])];
        const tableRows = lockIds.length
          ? await tx
              .select({
                id: physicalTables.id,
                eventId: physicalTables.eventId,
                status: physicalTables.status,
              })
              .from(physicalTables)
              .where(inArray(physicalTables.id, lockIds))
              .for('update')
          : [];
        const requested = tableRows.filter((table) =>
          tableIds.includes(table.id),
        );
        if (
          requested.length !== tableIds.length ||
          requested.some((table) => table.eventId !== session.eventId)
        ) {
          throw new TableNotFoundError();
        }
        if (
          requested.some(
            (table) =>
              table.status !== 'free' && !previousIds.has(table.id),
          )
        ) {
          throw new LimitedPersistenceConflictError(
            'A requested physical table is not available.',
          );
        }
        const conflictingReservations = tableIds.length
          ? await tx
              .select({ tableId: tableReservations.tableId })
              .from(tableReservations)
              .where(
                and(
                  inArray(tableReservations.tableId, tableIds),
                  isNull(tableReservations.releasedAt),
                ),
              )
          : [];
        if (
          conflictingReservations.some(
            (reservation) => !previousIds.has(reservation.tableId),
          )
        ) {
          throw new LimitedPersistenceConflictError(
            'A requested physical table is already reserved.',
          );
        }
        const now = new Date();
        await tx
          .update(tableReservations)
          .set({ releasedAt: now })
          .where(
            and(
              eq(tableReservations.ownerType, 'LIMITED_SESSION'),
              eq(tableReservations.ownerId, id),
              isNull(tableReservations.releasedAt),
            ),
          );
        if (previousIds.size) {
          await tx
            .update(physicalTables)
            .set({ status: 'free', updatedAt: now })
            .where(inArray(physicalTables.id, [...previousIds]));
        }
        if (tableIds.length) {
          await tx.insert(tableReservations).values(
            tableIds.map((tableId) => ({
              eventId: session.eventId,
              tableId,
              ownerType: 'LIMITED_SESSION',
              ownerId: id,
              purpose: 'DRAFT',
            })),
          );
          await tx
            .update(physicalTables)
            .set({ status: 'occupied', updatedAt: now })
            .where(inArray(physicalTables.id, tableIds));
        }
        await tx
          .update(limitedSessions)
          .set({ draftTableIds: tableIds, updatedAt: now })
          .where(eq(limitedSessions.id, id));
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new LimitedPersistenceConflictError(
          'A requested physical table is already reserved.',
        );
      }
      throw error;
    }
    return loadLimitedSessionRequired(id);
  }

  async updateLimitedSessionPhase(
    id: string,
    patch: LimitedSessionPhasePatch,
  ): Promise<StoredLimitedSession> {
    await getDb().transaction(async (tx) => {
      const timer = patch.timer;
      const [updated] = await tx
        .update(limitedSessions)
        .set({
          status: patch.status,
          ...(!('timer' in patch)
            ? {}
            : timer
              ? {
                  timerPhase: timer.phase,
                  timerStatus: timer.status,
                  timerDurationSeconds: timer.durationSeconds,
                  timerStartedAt: new Date(timer.startedAt),
                  timerTargetAt: new Date(timer.targetAt),
                  timerPausedAt: timer.pausedAt
                    ? new Date(timer.pausedAt)
                    : null,
                  timerRemainingSecondsWhenPaused:
                    timer.remainingSecondsWhenPaused ?? null,
                }
              : {
                  timerPhase: null,
                  timerStatus: null,
                  timerDurationSeconds: null,
                  timerStartedAt: null,
                  timerTargetAt: null,
                  timerPausedAt: null,
                  timerRemainingSecondsWhenPaused: null,
                }),
          ...(!('currentRound' in patch)
            ? {}
            : { currentRound: patch.currentRound ?? null }),
          ...(patch.startedAt === undefined
            ? {}
            : { startedAt: patch.startedAt }),
          ...(!('completedAt' in patch)
            ? {}
            : { completedAt: patch.completedAt ?? null }),
          updatedAt: new Date(),
        })
        .where(eq(limitedSessions.id, id))
        .returning({
          id: limitedSessions.id,
          eventId: limitedSessions.eventId,
        });
      if (!updated) throw new Error('Limited session not found.');
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
        await tx
          .update(limitedSessionParticipants)
          .set({ status: participantStatus, updatedAt: new Date() })
          .where(
            and(
              eq(limitedSessionParticipants.sessionId, id),
              inArray(limitedSessionParticipants.status, [
                'QUEUED',
                'ASSIGNED',
                'DRAFTING',
                'DECKBUILDING',
                'WAITING_FOR_ROUND',
                'PLAYING',
              ]),
            ),
          );
      }
      if (!['SEATING', 'DRAFTING', 'DECKBUILDING'].includes(patch.status)) {
        const reservations = await tx
          .select({ tableId: tableReservations.tableId })
          .from(tableReservations)
          .where(
            and(
              eq(tableReservations.ownerType, 'LIMITED_SESSION'),
              eq(tableReservations.ownerId, id),
              isNull(tableReservations.releasedAt),
            ),
          );
        await tx
          .update(tableReservations)
          .set({ releasedAt: new Date() })
          .where(
            and(
              eq(tableReservations.ownerType, 'LIMITED_SESSION'),
              eq(tableReservations.ownerId, id),
              isNull(tableReservations.releasedAt),
            ),
          );
        if (reservations.length) {
          await tx
            .update(physicalTables)
            .set({ status: 'free', updatedAt: new Date() })
            .where(
              inArray(
                physicalTables.id,
                reservations.map((row) => row.tableId),
              ),
            );
        }
      }
    });
    return loadLimitedSessionRequired(id);
  }

  async createLimitedRound(
    input: NewStoredLimitedRound,
  ): Promise<StoredLimitedRound> {
    let roundId: string;
    try {
      roundId = await getDb().transaction(async (tx) => {
        const [session] = await tx
          .select()
          .from(limitedSessions)
          .where(eq(limitedSessions.id, input.sessionId))
          .limit(1);
        if (!session) throw new Error('Limited session not found.');
        assertUniqueLimited(
          input.matches.map((match) => match.position),
          'Limited match position',
        );
        const participantIds = input.matches.flatMap((match) => [
          match.playerAId,
          ...(match.playerBId ? [match.playerBId] : []),
        ]);
        assertUniqueLimited(participantIds, 'Limited round participant');
        const memberRows = participantIds.length
          ? await tx
              .select({
                participantId: limitedSessionParticipants.participantId,
                status: limitedSessionParticipants.status,
              })
              .from(limitedSessionParticipants)
              .where(
                and(
                  eq(limitedSessionParticipants.sessionId, session.id),
                  inArray(
                    limitedSessionParticipants.participantId,
                    participantIds,
                  ),
                ),
              )
          : [];
        if (
          memberRows.length !== participantIds.length ||
          memberRows.some((row) => row.status === 'DROPPED')
        ) {
          throw new Error(
            'Limited match participant is not active in the session.',
          );
        }
        const tableIds = input.matches
          .map((match) => match.tableId)
          .filter((id): id is string => id !== undefined);
        assertUniqueLimited(tableIds, 'Limited match table');
        const tableRows = tableIds.length
          ? await tx
              .select({
                id: physicalTables.id,
                status: physicalTables.status,
              })
              .from(physicalTables)
              .where(
                and(
                  eq(physicalTables.eventId, session.eventId),
                  inArray(physicalTables.id, tableIds),
                ),
              )
              .for('update')
          : [];
        if (tableRows.length !== tableIds.length) throw new TableNotFoundError();
        const activeReservations = tableIds.length
          ? await tx
              .select({
                tableId: tableReservations.tableId,
                ownerType: tableReservations.ownerType,
                ownerId: tableReservations.ownerId,
              })
              .from(tableReservations)
              .where(
                and(
                  inArray(tableReservations.tableId, tableIds),
                  isNull(tableReservations.releasedAt),
                ),
              )
          : [];
        const ownDraftTableIds = new Set(
          activeReservations
            .filter(
              (reservation) =>
                reservation.ownerType === 'LIMITED_SESSION' &&
                reservation.ownerId === session.id,
            )
            .map((reservation) => reservation.tableId),
        );
        if (
          tableRows.some(
            (table) =>
              table.status !== 'free' && !ownDraftTableIds.has(table.id),
          )
        ) {
          throw new LimitedPersistenceConflictError(
            'A requested physical table is not available.',
          );
        }
        if (
          activeReservations.some(
            (reservation) =>
              reservation.ownerType !== 'LIMITED_SESSION' ||
              reservation.ownerId !== session.id,
          )
        ) {
          throw new LimitedPersistenceConflictError(
            'A requested physical table is already reserved.',
          );
        }
        if (ownDraftTableIds.size) {
          await tx
            .update(tableReservations)
            .set({ releasedAt: new Date() })
            .where(
              and(
                eq(tableReservations.ownerType, 'LIMITED_SESSION'),
                eq(tableReservations.ownerId, session.id),
                isNull(tableReservations.releasedAt),
              ),
            );
        }

        const previousRounds = await tx
          .select({ id: limitedRounds.id })
          .from(limitedRounds)
          .where(eq(limitedRounds.sessionId, session.id));
        if (previousRounds.length) {
          const previousMatches = await tx
            .select({ id: limitedMatches.id })
            .from(limitedMatches)
            .where(
              inArray(
                limitedMatches.roundId,
                previousRounds.map((row) => row.id),
              ),
            );
          if (previousMatches.length) {
            const previousReservations = await tx
              .select({ tableId: tableReservations.tableId })
              .from(tableReservations)
              .where(
                and(
                  eq(tableReservations.ownerType, 'LIMITED_MATCH'),
                  inArray(
                    tableReservations.ownerId,
                    previousMatches.map((row) => row.id),
                  ),
                  isNull(tableReservations.releasedAt),
                ),
              );
            await tx
              .update(tableReservations)
              .set({ releasedAt: new Date() })
              .where(
                and(
                  eq(tableReservations.ownerType, 'LIMITED_MATCH'),
                  inArray(
                    tableReservations.ownerId,
                    previousMatches.map((row) => row.id),
                  ),
                  isNull(tableReservations.releasedAt),
                ),
              );
            if (previousReservations.length) {
              await tx
                .update(physicalTables)
                .set({ status: 'free', updatedAt: new Date() })
                .where(
                  inArray(
                    physicalTables.id,
                    previousReservations.map((row) => row.tableId),
                  ),
                );
            }
          }
        }

        const createdAt = input.startedAt ?? new Date();
        const [round] = await tx
          .insert(limitedRounds)
          .values({
            sessionId: session.id,
            number: input.number,
            status: input.status ?? 'PENDING',
            createdAt,
            startedAt: input.startedAt ?? null,
          })
          .returning({ id: limitedRounds.id });
        if (!round) throw new Error('Limited round insert returned no row.');
        for (const matchInput of input.matches) {
          if (matchInput.playerAId === matchInput.playerBId) {
            throw new Error('Limited participant cannot play themselves.');
          }
          if (!matchInput.playerBId && matchInput.outcome !== 'BYE') {
            throw new Error('A one-player Limited match must be a bye.');
          }
          const [match] = await tx
            .insert(limitedMatches)
            .values({
              roundId: round.id,
              position: matchInput.position,
              status:
                matchInput.status ??
                (matchInput.outcome ? 'COMPLETED' : 'PENDING'),
              bestOf: matchInput.bestOf,
              outcome: matchInput.outcome ?? null,
              playerAGameWins: matchInput.playerAGameWins ?? null,
              playerBGameWins: matchInput.playerBGameWins ?? null,
              reportedAt:
                matchInput.reportedAt ??
                (matchInput.outcome ? createdAt : null),
            })
            .returning({ id: limitedMatches.id });
          if (!match) throw new Error('Limited match insert returned no row.');
          await tx.insert(limitedMatchParticipants).values([
            {
              roundId: round.id,
              matchId: match.id,
              participantId: matchInput.playerAId,
              slot: 'A',
            },
            ...(matchInput.playerBId
              ? [
                  {
                    roundId: round.id,
                    matchId: match.id,
                    participantId: matchInput.playerBId,
                    slot: 'B',
                  },
                ]
              : []),
          ]);
          if (matchInput.outcome) {
            await tx.insert(limitedResultAudits).values({
              matchId: match.id,
              outcome: matchInput.outcome,
              playerAGameWins: matchInput.playerAGameWins ?? 0,
              playerBGameWins: matchInput.playerBGameWins ?? 0,
            });
          }
          if (matchInput.tableId) {
            await tx.insert(tableReservations).values({
              eventId: session.eventId,
              tableId: matchInput.tableId,
              ownerType: 'LIMITED_MATCH',
              ownerId: match.id,
              purpose: 'MATCH',
            });
            await tx
              .update(physicalTables)
              .set({ status: 'occupied', updatedAt: new Date() })
              .where(eq(physicalTables.id, matchInput.tableId));
          }
        }
        await tx
          .update(limitedSessions)
          .set({ currentRound: input.number, updatedAt: new Date() })
          .where(eq(limitedSessions.id, session.id));
        return round.id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new LimitedPersistenceConflictError(
          'Limited membership, seat, round, participant, or table reservation conflicts.',
        );
      }
      throw error;
    }
    return loadLimitedRoundRequired(roundId);
  }

  async updateLimitedRound(
    id: string,
    patch: LimitedRoundPatch,
  ): Promise<StoredLimitedRound> {
    await getDb().transaction(async (tx) => {
      const [round] = await tx
        .update(limitedRounds)
        .set({
          status: patch.status,
          ...(patch.startedAt === undefined
            ? {}
            : { startedAt: patch.startedAt }),
          ...(!('completedAt' in patch)
            ? {}
            : { completedAt: patch.completedAt ?? null }),
        })
        .where(eq(limitedRounds.id, id))
        .returning({ id: limitedRounds.id });
      if (!round) throw new Error('Limited round not found.');
      if (patch.status === 'COMPLETED') {
        const matches = await tx
          .select({ id: limitedMatches.id })
          .from(limitedMatches)
          .where(eq(limitedMatches.roundId, id));
        if (matches.length) {
          const reservations = await tx
            .select({ tableId: tableReservations.tableId })
            .from(tableReservations)
            .where(
              and(
                eq(tableReservations.ownerType, 'LIMITED_MATCH'),
                inArray(
                  tableReservations.ownerId,
                  matches.map((match) => match.id),
                ),
                isNull(tableReservations.releasedAt),
              ),
            );
          await tx
            .update(tableReservations)
            .set({ releasedAt: patch.completedAt ?? new Date() })
            .where(
              and(
                eq(tableReservations.ownerType, 'LIMITED_MATCH'),
                inArray(
                  tableReservations.ownerId,
                  matches.map((match) => match.id),
                ),
                isNull(tableReservations.releasedAt),
              ),
            );
          if (reservations.length) {
            await tx
              .update(physicalTables)
              .set({ status: 'free', updatedAt: new Date() })
              .where(
                inArray(
                  physicalTables.id,
                  reservations.map((row) => row.tableId),
                ),
              );
          }
        }
      }
    });
    return loadLimitedRoundRequired(id);
  }

  async finalizeLimitedMatchResult(
    input: FinalizeLimitedMatchResultInput,
  ): Promise<{
    match: StoredLimitedMatch;
    audit: StoredLimitedResultAudit;
    corrected: boolean;
  }> {
    const result = await getDb().transaction(async (tx) => {
      const [match] = await tx
        .select()
        .from(limitedMatches)
        .where(eq(limitedMatches.id, input.matchId))
        .limit(1)
        .for('update');
      if (!match) throw new Error('Limited match not found.');
      const players = await tx
        .select({ slot: limitedMatchParticipants.slot })
        .from(limitedMatchParticipants)
        .where(eq(limitedMatchParticipants.matchId, match.id));
      const hasPlayerB = players.some((row) => row.slot === 'B');
      if ((input.outcome === 'BYE') === hasPlayerB) {
        throw new Error('Limited result does not match the pairing.');
      }
      const corrected = match.outcome !== null;
      if (corrected && !input.correctionReason?.trim()) {
        throw new Error('A correction reason is required to change a result.');
      }
      const [audit] = await tx
        .insert(limitedResultAudits)
        .values({
          matchId: match.id,
          previousOutcome: match.outcome,
          previousPlayerAGameWins: match.playerAGameWins,
          previousPlayerBGameWins: match.playerBGameWins,
          outcome: input.outcome,
          playerAGameWins: input.playerAGameWins,
          playerBGameWins: input.playerBGameWins,
          correctionReason: input.correctionReason ?? null,
          correctedByParticipantId: input.correctedByParticipantId ?? null,
          ...(input.reportedAt ? { createdAt: input.reportedAt } : {}),
        })
        .returning();
      if (!audit) throw new Error('Limited result audit insert returned no row.');
      await tx
        .update(limitedMatches)
        .set({
          status: 'COMPLETED',
          outcome: input.outcome,
          playerAGameWins: input.playerAGameWins,
          playerBGameWins: input.playerBGameWins,
          reportedAt: input.reportedAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(limitedMatches.id, match.id));
      const reservations = await tx
        .select({ tableId: tableReservations.tableId })
        .from(tableReservations)
        .where(
          and(
            eq(tableReservations.ownerType, 'LIMITED_MATCH'),
            eq(tableReservations.ownerId, match.id),
            isNull(tableReservations.releasedAt),
          ),
        );
      await tx
        .update(tableReservations)
        .set({ releasedAt: input.reportedAt ?? new Date() })
        .where(
          and(
            eq(tableReservations.ownerType, 'LIMITED_MATCH'),
            eq(tableReservations.ownerId, match.id),
            isNull(tableReservations.releasedAt),
          ),
        );
      if (reservations.length) {
        await tx
          .update(physicalTables)
          .set({ status: 'free', updatedAt: new Date() })
          .where(
            inArray(
              physicalTables.id,
              reservations.map((row) => row.tableId),
            ),
          );
      }
      return { corrected, audit: mapLimitedAudit(audit) };
    });
    return {
      match: await loadLimitedMatchRequired(input.matchId),
      audit: result.audit,
      corrected: result.corrected,
    };
  }

  async listLimitedResultAudits(
    eventId: string,
  ): Promise<StoredLimitedResultAudit[]> {
    const rows = await getDb()
      .select({ audit: limitedResultAudits })
      .from(limitedResultAudits)
      .innerJoin(
        limitedMatches,
        eq(limitedResultAudits.matchId, limitedMatches.id),
      )
      .innerJoin(limitedRounds, eq(limitedMatches.roundId, limitedRounds.id))
      .innerJoin(
        limitedSessions,
        eq(limitedRounds.sessionId, limitedSessions.id),
      )
      .where(eq(limitedSessions.eventId, eventId))
      .orderBy(asc(limitedResultAudits.createdAt));
    return rows.map((row) => mapLimitedAudit(row.audit));
  }

  async dropLimitedParticipant(
    sessionId: string,
    participantId: string,
    droppedAt = new Date(),
  ): Promise<StoredLimitedParticipant> {
    const [row] = await getDb()
      .update(limitedSessionParticipants)
      .set({ status: 'DROPPED', droppedAt, updatedAt: droppedAt })
      .where(
        and(
          eq(limitedSessionParticipants.sessionId, sessionId),
          eq(limitedSessionParticipants.participantId, participantId),
        ),
      )
      .returning();
    if (!row) throw new Error('Limited participant not found.');
    await getDb()
      .update(participants)
      .set({ status: 'joined', updatedAt: droppedAt })
      .where(eq(participants.id, participantId));
    const [person] = await getDb()
      .select({ displayName: participants.displayName })
      .from(participants)
      .where(eq(participants.id, participantId))
      .limit(1);
    return mapLimitedParticipant(row, person?.displayName ?? '');
  }

  async finishLimitedSession(
    id: string,
    status: 'COMPLETED' | 'CANCELLED',
    completedAt = new Date(),
  ): Promise<StoredLimitedSession> {
    await getDb().transaction(async (tx) => {
      const [session] = await tx
        .update(limitedSessions)
        .set({
          status,
          completedAt,
          timerPhase: null,
          timerStatus: null,
          timerDurationSeconds: null,
          timerStartedAt: null,
          timerTargetAt: null,
          timerPausedAt: null,
          timerRemainingSecondsWhenPaused: null,
          updatedAt: completedAt,
        })
        .where(eq(limitedSessions.id, id))
        .returning({ id: limitedSessions.id });
      if (!session) throw new Error('Limited session not found.');
      await tx
        .update(limitedSessionParticipants)
        .set({ status: 'COMPLETED', updatedAt: completedAt })
        .where(
          and(
            eq(limitedSessionParticipants.sessionId, id),
            // Do not erase the durable fact that somebody dropped.
            inArray(limitedSessionParticipants.status, [
              'QUEUED',
              'ASSIGNED',
              'DRAFTING',
              'DECKBUILDING',
              'WAITING_FOR_ROUND',
              'PLAYING',
              'COMPLETED',
            ]),
          ),
        );
      const rounds = await tx
        .select({ id: limitedRounds.id })
        .from(limitedRounds)
        .where(eq(limitedRounds.sessionId, id));
      const matches = rounds.length
        ? await tx
            .select({ id: limitedMatches.id })
            .from(limitedMatches)
            .where(
              inArray(
                limitedMatches.roundId,
                rounds.map((row) => row.id),
              ),
            )
        : [];
      const participantRows = await tx
        .select({ participantId: limitedSessionParticipants.participantId })
        .from(limitedSessionParticipants)
        .where(eq(limitedSessionParticipants.sessionId, id));
      if (participantRows.length) {
        await tx
          .update(participants)
          .set({
            status: 'joined',
            readyAt: null,
            limitedQueueMode: null,
            limitedQueuedAt: null,
            updatedAt: completedAt,
          })
          .where(
            inArray(
              participants.id,
              participantRows.map((row) => row.participantId),
            ),
          );
      }
      const activeReservations = await tx
        .select({ tableId: tableReservations.tableId })
        .from(tableReservations)
        .where(
          and(
            matches.length
              ? or(
                  and(
                    eq(tableReservations.ownerType, 'LIMITED_SESSION'),
                    eq(tableReservations.ownerId, id),
                  ),
                  and(
                    eq(tableReservations.ownerType, 'LIMITED_MATCH'),
                    inArray(
                      tableReservations.ownerId,
                      matches.map((row) => row.id),
                    ),
                  ),
                )
              : and(
                  eq(tableReservations.ownerType, 'LIMITED_SESSION'),
                  eq(tableReservations.ownerId, id),
                ),
            isNull(tableReservations.releasedAt),
          ),
        );
      await tx
        .update(tableReservations)
        .set({ releasedAt: completedAt })
        .where(
          and(
            eq(tableReservations.ownerType, 'LIMITED_SESSION'),
            eq(tableReservations.ownerId, id),
            isNull(tableReservations.releasedAt),
          ),
        );
      if (matches.length) {
        await tx
          .update(tableReservations)
          .set({ releasedAt: completedAt })
          .where(
            and(
              eq(tableReservations.ownerType, 'LIMITED_MATCH'),
              inArray(
                tableReservations.ownerId,
                matches.map((row) => row.id),
              ),
              isNull(tableReservations.releasedAt),
            ),
          );
      }
      if (activeReservations.length) {
        await tx
          .update(physicalTables)
          .set({ status: 'free', updatedAt: completedAt })
          .where(
            inArray(
              physicalTables.id,
              activeReservations.map((row) => row.tableId),
            ),
          );
      }
    });
    return loadLimitedSessionRequired(id);
  }
}

async function loadLimitedSessionRequired(
  id: string,
): Promise<StoredLimitedSession> {
  const session = await loadLimitedSession(id);
  if (!session) throw new Error('Limited session not found.');
  return session;
}

async function loadLimitedSession(
  id: string,
): Promise<StoredLimitedSession | undefined> {
  const [row] = await getDb()
    .select()
    .from(limitedSessions)
    .where(eq(limitedSessions.id, id))
    .limit(1);
  if (!row) return undefined;
  const memberRows = await getDb()
    .select({
      member: limitedSessionParticipants,
      displayName: participants.displayName,
    })
    .from(limitedSessionParticipants)
    .innerJoin(
      participants,
      eq(limitedSessionParticipants.participantId, participants.id),
    )
    .where(eq(limitedSessionParticipants.sessionId, id))
    .orderBy(
      asc(limitedSessionParticipants.draftSeat),
      asc(limitedSessionParticipants.joinedAt),
    );
  const roundRows = await getDb()
    .select({ id: limitedRounds.id })
    .from(limitedRounds)
    .where(eq(limitedRounds.sessionId, id))
    .orderBy(asc(limitedRounds.number));
  const timer =
    row.timerPhase &&
    row.timerStatus &&
    row.timerDurationSeconds !== null &&
    row.timerStartedAt &&
    row.timerTargetAt
      ? {
          phase: row.timerPhase,
          status: row.timerStatus,
          durationSeconds: row.timerDurationSeconds,
          startedAt: row.timerStartedAt.toISOString(),
          targetAt: row.timerTargetAt.toISOString(),
          ...(row.timerPausedAt
            ? { pausedAt: row.timerPausedAt.toISOString() }
            : {}),
          ...(row.timerRemainingSecondsWhenPaused === null
            ? {}
            : {
                remainingSecondsWhenPaused:
                  row.timerRemainingSecondsWhenPaused,
              }),
        }
      : null;
  return {
    id: row.id,
    eventId: row.eventId,
    mode: row.mode,
    status: row.status,
    label: row.label,
    participants: memberRows.map(({ member, displayName }) =>
      mapLimitedParticipant(member, displayName),
    ),
    rounds: await Promise.all(
      roundRows.map((round) => loadLimitedRoundRequired(round.id)),
    ),
    matchStructure: row.matchStructure === 'BO1' ? 'BO1' : 'BO3',
    pairingPolicy:
      row.pairingPolicy === 'PICK_TWO_FOUR_PLAYER'
        ? 'PICK_TWO_FOUR_PLAYER'
        : 'SWISS',
    preferredCohortSize: row.preferredCohortSize,
    minCohortSize: row.minCohortSize,
    maxCohortSize: row.maxCohortSize,
    allowUndersizedLaunch: row.allowUndersizedLaunch,
    currentRound: row.currentRound,
    totalRounds: row.totalRounds,
    draftTableIds: row.draftTableIds,
    timer,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

function mapLimitedParticipant(
  row: typeof limitedSessionParticipants.$inferSelect,
  displayName: string,
): StoredLimitedParticipant {
  return {
    participantId: row.participantId,
    displayName,
    status: row.status,
    draftSeat: row.draftSeat,
    joinedAt: row.joinedAt,
    assignedAt: row.assignedAt,
    droppedAt: row.droppedAt,
  };
}

async function loadLimitedRoundRequired(
  id: string,
): Promise<StoredLimitedRound> {
  const [row] = await getDb()
    .select()
    .from(limitedRounds)
    .where(eq(limitedRounds.id, id))
    .limit(1);
  if (!row) throw new Error('Limited round not found.');
  const matchRows = await getDb()
    .select({ id: limitedMatches.id })
    .from(limitedMatches)
    .where(eq(limitedMatches.roundId, id))
    .orderBy(asc(limitedMatches.position));
  return {
    id: row.id,
    sessionId: row.sessionId,
    number: row.number,
    status: row.status,
    matches: await Promise.all(
      matchRows.map((match) => loadLimitedMatchRequired(match.id)),
    ),
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

async function loadLimitedMatchRequired(
  id: string,
): Promise<StoredLimitedMatch> {
  const [row] = await getDb()
    .select({
      match: limitedMatches,
      roundNumber: limitedRounds.number,
    })
    .from(limitedMatches)
    .innerJoin(limitedRounds, eq(limitedMatches.roundId, limitedRounds.id))
    .where(eq(limitedMatches.id, id))
    .limit(1);
  if (!row) throw new Error('Limited match not found.');
  const playerRows = await getDb()
    .select({
      participantId: limitedMatchParticipants.participantId,
      slot: limitedMatchParticipants.slot,
    })
    .from(limitedMatchParticipants)
    .where(eq(limitedMatchParticipants.matchId, id));
  const [reservation] = await getDb()
    .select({
      tableId: tableReservations.tableId,
      tableLabel: physicalTables.label,
    })
    .from(tableReservations)
    .innerJoin(
      physicalTables,
      eq(tableReservations.tableId, physicalTables.id),
    )
    .where(
      and(
        eq(tableReservations.ownerType, 'LIMITED_MATCH'),
        eq(tableReservations.ownerId, id),
      ),
    )
    .orderBy(desc(tableReservations.createdAt))
    .limit(1);
  const playerA = playerRows.find((player) => player.slot === 'A');
  const playerB = playerRows.find((player) => player.slot === 'B');
  if (!playerA) throw new Error('Limited match has no player A.');
  return {
    id: row.match.id,
    roundId: row.match.roundId,
    roundNumber: row.roundNumber,
    position: row.match.position,
    playerAId: playerA.participantId,
    playerBId: playerB?.participantId ?? null,
    tableId: reservation?.tableId ?? null,
    tableLabel: reservation?.tableLabel ?? null,
    status: row.match.status,
    bestOf: row.match.bestOf === 1 ? 1 : 3,
    outcome: row.match.outcome,
    playerAGameWins: row.match.playerAGameWins,
    playerBGameWins: row.match.playerBGameWins,
    reportedAt: row.match.reportedAt,
  };
}

function mapLimitedAudit(
  row: typeof limitedResultAudits.$inferSelect,
): StoredLimitedResultAudit {
  return {
    id: row.id,
    matchId: row.matchId,
    previousOutcome: row.previousOutcome,
    previousPlayerAGameWins: row.previousPlayerAGameWins,
    previousPlayerBGameWins: row.previousPlayerBGameWins,
    outcome: row.outcome,
    playerAGameWins: row.playerAGameWins,
    playerBGameWins: row.playerBGameWins,
    correctionReason: row.correctionReason,
    correctedByParticipantId: row.correctedByParticipantId,
    createdAt: row.createdAt,
  };
}

function assertUniqueLimited<T>(values: readonly T[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new LimitedPersistenceConflictError(`${label} must be unique.`);
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
    tournamentMatchId: pod.tournamentMatchId,
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
    tournamentFormat: row.tournamentFormat as StoredEvent['tournamentFormat'],
    tournamentState: row.tournamentState as StoredEvent['tournamentState'],
    limitedModeConfigs: row.limitedModeConfigs,
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
    limitedQueueMode: row.limitedQueueMode ?? null,
    limitedQueuedAt: row.limitedQueuedAt ?? null,
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
