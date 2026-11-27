import { and, eq, gt, isNull, lte } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { linkTransfers } from '../db/schema.js';

export type StoredLinkTransfer = typeof linkTransfers.$inferSelect;
export interface LinkTransferStore {
  create(row: StoredLinkTransfer, now: Date): Promise<void>;
  get(id: string): Promise<StoredLinkTransfer | undefined>;
  accept(id: string, sendTokenHash: string, destination: string, now: Date): Promise<boolean>;
}

export class MemoryLinkTransferStore implements LinkTransferStore {
  private rows = new Map<string, StoredLinkTransfer>();
  async create(row: StoredLinkTransfer, now: Date) {
    for (const [id, value] of this.rows) if (value.expiresAt <= now) this.rows.delete(id);
    this.rows.set(row.id, { ...row });
  }
  async get(id: string) { const row = this.rows.get(id); return row ? { ...row } : undefined; }
  async accept(id: string, sendTokenHash: string, destination: string, now: Date) {
    const row = this.rows.get(id);
    if (!row || row.sendTokenHash !== sendTokenHash || row.expiresAt <= now || row.destination !== null) return false;
    row.destination = destination;
    return true;
  }
}

export class PostgresLinkTransferStore implements LinkTransferStore {
  async create(row: StoredLinkTransfer, now: Date) {
    await getDb().delete(linkTransfers).where(lte(linkTransfers.expiresAt, now));
    await getDb().insert(linkTransfers).values(row);
  }
  async get(id: string) { return (await getDb().select().from(linkTransfers).where(eq(linkTransfers.id, id)).limit(1))[0]; }
  async accept(id: string, sendTokenHash: string, destination: string, now: Date) {
    // One conditional write arbitrates concurrent senders across all instances.
    const rows = await getDb().update(linkTransfers).set({ destination }).where(and(
      eq(linkTransfers.id, id), eq(linkTransfers.sendTokenHash, sendTokenHash),
      gt(linkTransfers.expiresAt, now), isNull(linkTransfers.destination),
    )).returning({ id: linkTransfers.id });
    return rows.length === 1;
  }
}
