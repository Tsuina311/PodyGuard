import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { DisplayConfig } from '@podyguard/shared';
import { getDb } from '../db/client.js';
import { displayAnnouncements, displaySessions } from '../db/schema.js';
import type {
  DisplayStore,
  NewPendingDisplaySession,
  StoredDisplayAnnouncement,
  StoredDisplaySession,
} from './display-store.js';

export class PostgresDisplayStore implements DisplayStore {
  async insertPendingSession(
    input: NewPendingDisplaySession,
  ): Promise<StoredDisplaySession> {
    const db = getDb();
    const [row] = await db
      .insert(displaySessions)
      .values({
        id: input.id,
        eventId: input.eventId,
        pairingCodeHash: input.pairingCodeHash,
        pairingCodeLookup: input.pairingCodeLookup,
        pairingExpiresAt: input.pairingExpiresAt,
        label: input.label,
        status: 'PENDING',
        createdAt: input.createdAt,
      })
      .returning();
    if (!row) {
      throw new Error('Failed to insert display session.');
    }
    return mapSession(row);
  }

  async findSessionById(id: string): Promise<StoredDisplaySession | undefined> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(displaySessions)
      .where(eq(displaySessions.id, id))
      .limit(1);
    return row ? mapSession(row) : undefined;
  }

  async findSessionByPairingLookup(
    lookup: string,
  ): Promise<StoredDisplaySession | undefined> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(displaySessions)
      .where(eq(displaySessions.pairingCodeLookup, lookup))
      .limit(1);
    return row ? mapSession(row) : undefined;
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<StoredDisplaySession | undefined> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(displaySessions)
      .where(eq(displaySessions.tokenHash, tokenHash))
      .limit(1);
    return row ? mapSession(row) : undefined;
  }

  async listSessionsByEventId(eventId: string): Promise<StoredDisplaySession[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(displaySessions)
      .where(eq(displaySessions.eventId, eventId))
      .orderBy(displaySessions.createdAt);
    return rows.map(mapSession);
  }

  async listActiveSessionsByEventId(
    eventId: string,
  ): Promise<StoredDisplaySession[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(displaySessions)
      .where(
        and(
          eq(displaySessions.eventId, eventId),
          eq(displaySessions.status, 'ACTIVE'),
        ),
      );
    return rows.map(mapSession);
  }

  async incrementPairingAttempts(id: string): Promise<StoredDisplaySession> {
    const db = getDb();
    const [row] = await db
      .update(displaySessions)
      .set({
        pairingAttempts: sql`${displaySessions.pairingAttempts} + 1`,
      })
      .where(eq(displaySessions.id, id))
      .returning();
    if (!row) {
      throw new Error('Display session not found.');
    }
    return mapSession(row);
  }

  async approveSession(input: {
    id: string;
    eventId: string;
    tokenHash: string;
    label: string;
    config: DisplayConfig;
    approvedAt: Date;
  }): Promise<StoredDisplaySession> {
    const db = getDb();
    const [row] = await db
      .update(displaySessions)
      .set({
        eventId: input.eventId,
        tokenHash: input.tokenHash,
        label: input.label,
        mode: input.config.mode,
        showPlayerNames: input.config.showPlayerNames,
        showQueues: input.config.showQueues,
        showTimers: input.config.showTimers,
        status: 'ACTIVE',
        approvedAt: input.approvedAt,
        pairingCodeHash: null,
        pairingCodeLookup: null,
        pairingExpiresAt: null,
      })
      .where(eq(displaySessions.id, idOf(input.id)))
      .returning();
    if (!row) {
      throw new Error('Display session not found.');
    }
    return mapSession(row);
  }

  async updateSessionConfig(
    id: string,
    patch: Partial<DisplayConfig> & { label?: string },
  ): Promise<StoredDisplaySession> {
    const db = getDb();
    const [row] = await db
      .update(displaySessions)
      .set({
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        ...(patch.mode !== undefined ? { mode: patch.mode } : {}),
        ...(patch.showPlayerNames !== undefined
          ? { showPlayerNames: patch.showPlayerNames }
          : {}),
        ...(patch.showQueues !== undefined
          ? { showQueues: patch.showQueues }
          : {}),
        ...(patch.showTimers !== undefined
          ? { showTimers: patch.showTimers }
          : {}),
      })
      .where(eq(displaySessions.id, id))
      .returning();
    if (!row) {
      throw new Error('Display session not found.');
    }
    return mapSession(row);
  }

  async revokeSession(id: string, revokedAt: Date): Promise<StoredDisplaySession> {
    const db = getDb();
    const [row] = await db
      .update(displaySessions)
      .set({
        status: 'REVOKED',
        revokedAt,
        tokenHash: null,
        pairingCodeHash: null,
        pairingCodeLookup: null,
      })
      .where(eq(displaySessions.id, id))
      .returning();
    if (!row) {
      throw new Error('Display session not found.');
    }
    return mapSession(row);
  }

  async touchSession(id: string, lastSeenAt: Date): Promise<void> {
    const db = getDb();
    await db
      .update(displaySessions)
      .set({ lastSeenAt })
      .where(eq(displaySessions.id, id));
  }

  async bindPendingToEvent(
    id: string,
    eventId: string,
  ): Promise<StoredDisplaySession> {
    const db = getDb();
    const [row] = await db
      .update(displaySessions)
      .set({ eventId })
      .where(eq(displaySessions.id, id))
      .returning();
    if (!row) {
      throw new Error('Display session not found.');
    }
    return mapSession(row);
  }

  async insertAnnouncement(input: {
    id: string;
    eventId: string;
    message: string;
    createdAt: Date;
    endsAt: Date;
  }): Promise<StoredDisplayAnnouncement> {
    const db = getDb();
    const [row] = await db
      .insert(displayAnnouncements)
      .values(input)
      .returning();
    if (!row) {
      throw new Error('Failed to insert announcement.');
    }
    return mapAnnouncement(row);
  }

  async findActiveAnnouncement(
    eventId: string,
    now: Date,
  ): Promise<StoredDisplayAnnouncement | undefined> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(displayAnnouncements)
      .where(
        and(
          eq(displayAnnouncements.eventId, eventId),
          isNull(displayAnnouncements.cancelledAt),
          gt(displayAnnouncements.endsAt, now),
        ),
      )
      .orderBy(desc(displayAnnouncements.createdAt))
      .limit(1);
    return row ? mapAnnouncement(row) : undefined;
  }

  async cancelAnnouncement(
    id: string,
    eventId: string,
    cancelledAt: Date,
  ): Promise<StoredDisplayAnnouncement | undefined> {
    const db = getDb();
    const [row] = await db
      .update(displayAnnouncements)
      .set({ cancelledAt })
      .where(
        and(
          eq(displayAnnouncements.id, id),
          eq(displayAnnouncements.eventId, eventId),
        ),
      )
      .returning();
    return row ? mapAnnouncement(row) : undefined;
  }

  async listAnnouncements(
    eventId: string,
  ): Promise<StoredDisplayAnnouncement[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(displayAnnouncements)
      .where(eq(displayAnnouncements.eventId, eventId))
      .orderBy(desc(displayAnnouncements.createdAt));
    return rows.map(mapAnnouncement);
  }
}

function idOf(id: string): string {
  return id;
}

function mapSession(
  row: typeof displaySessions.$inferSelect,
): StoredDisplaySession {
  return {
    id: row.id,
    eventId: row.eventId,
    tokenHash: row.tokenHash,
    pairingCodeHash: row.pairingCodeHash,
    pairingCodeLookup: row.pairingCodeLookup,
    pairingExpiresAt: row.pairingExpiresAt,
    pairingAttempts: row.pairingAttempts,
    status: row.status,
    label: row.label,
    mode: row.mode,
    showPlayerNames: row.showPlayerNames,
    showQueues: row.showQueues,
    showTimers: row.showTimers,
    createdAt: row.createdAt,
    approvedAt: row.approvedAt,
    lastSeenAt: row.lastSeenAt,
    revokedAt: row.revokedAt,
  };
}

function mapAnnouncement(
  row: typeof displayAnnouncements.$inferSelect,
): StoredDisplayAnnouncement {
  return {
    id: row.id,
    eventId: row.eventId,
    message: row.message,
    createdAt: row.createdAt,
    endsAt: row.endsAt,
    cancelledAt: row.cancelledAt,
  };
}
