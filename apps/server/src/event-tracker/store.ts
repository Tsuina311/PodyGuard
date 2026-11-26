import { and, eq, inArray, sql } from 'drizzle-orm';
import type { EventTrackerHistory } from '@podyguard/shared';
import { getDb, withDbTransaction } from '../db/client.js';
import { eventTrackers } from '../db/schema.js';

export type TrackerRow = {
  context: string; id: string; gameId: string; eventId: string; readToken: string;
  monitorShared: boolean;
  ownerId: string; ownerName: string; deviceId: string;
  generation: number; revision: number; updatedAt: number; history: EventTrackerHistory;
  transfer: { id: string; ownerId: string; name: string; deviceId: string; requestedAt: number } | null;
};
export interface EventTrackerStore {
  get(context: string): Promise<TrackerRow | undefined>;
  getById(id: string): Promise<TrackerRow | undefined>;
  publishedContexts(contexts: string[]): Promise<string[]>;
  put(row: TrackerRow): Promise<void>;
  exclusive<T>(context: string, work: () => Promise<T>): Promise<T>;
}
export class MemoryEventTrackerStore implements EventTrackerStore {
  private rows = new Map<string, TrackerRow>();
  private locks = new Map<string, Promise<unknown>>();
  async get(context: string) { return structuredClone(this.rows.get(context)); }
  async getById(id: string) { return structuredClone([...this.rows.values()].find(row => row.id === id)); }
  async publishedContexts(contexts: string[]) {
    return contexts.filter(context => this.rows.get(context)?.monitorShared);
  }
  async put(row: TrackerRow) { this.rows.set(row.context, structuredClone(row)); }
  async exclusive<T>(context: string, work: () => Promise<T>): Promise<T> {
    const task = (this.locks.get(context) ?? Promise.resolve()).catch(() => {}).then(work);
    this.locks.set(context, task);
    try { return await task; } finally { if (this.locks.get(context) === task) this.locks.delete(context); }
  }
}
export class PostgresEventTrackerStore implements EventTrackerStore {
  async get(context: string) {
    const [row] = await getDb().select().from(eventTrackers).where(eq(eventTrackers.context, context));
    return row ? { ...row, updatedAt: row.updatedAt.getTime() } : undefined;
  }
  async getById(id: string) {
    const [row] = await getDb().select().from(eventTrackers).where(eq(eventTrackers.id, id));
    return row ? { ...row, updatedAt: row.updatedAt.getTime() } : undefined;
  }
  async publishedContexts(contexts: string[]) {
    if (!contexts.length) return [];
    const rows = await getDb().select({ context: eventTrackers.context }).from(eventTrackers)
      .where(and(eq(eventTrackers.monitorShared, true), inArray(eventTrackers.context, contexts)));
    return rows.map(row => row.context);
  }
  async put(row: TrackerRow) {
    const value = { ...row, updatedAt: new Date(row.updatedAt) };
    await getDb().insert(eventTrackers).values(value).onConflictDoUpdate({ target: eventTrackers.context, set: value });
  }
  async exclusive<T>(context: string, work: () => Promise<T>): Promise<T> {
    return withDbTransaction(async () => {
      await getDb().execute(sql`select pg_advisory_xact_lock(hashtextextended(${context}, 0))`);
      return work();
    });
  }
}
