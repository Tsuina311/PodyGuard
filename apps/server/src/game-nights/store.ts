import { randomUUID } from 'node:crypto';
import { eq, desc, sql } from 'drizzle-orm';
import type { GameNight, GameNightInput, NightRsvp } from '@podyguard/shared';
import { getDb, withDbTransaction } from '../db/client.js';
import { gameNights, gameNightRsvps } from '../db/schema.js';

export interface GameNightStore {
  list(playgroupId: string): Promise<GameNight[]>;
  get(id: string): Promise<GameNight | undefined>;
  create(playgroupId: string, input: GameNightInput): Promise<GameNight>;
  update(
    id: string,
    patch: Partial<Pick<GameNight, 'cancelled' | 'eventJoinCode'>>,
  ): Promise<GameNight>;
  rsvps(id: string): Promise<NightRsvp[]>;
  rsvp(id: string, tokenHash: string, response: NightRsvp): Promise<void>;
  exclusive<T>(id: string, work: () => Promise<T>): Promise<T>;
}
export class MemoryGameNightStore implements GameNightStore {
  private nights = new Map<string, GameNight>();
  private answers = new Map<string, Map<string, NightRsvp>>();
  private locks = new Map<string, Promise<unknown>>();
  async list(playgroupId: string) {
    return [...this.nights.values()]
      .filter((n) => n.playgroupId === playgroupId)
      .reverse();
  }
  async get(id: string) {
    return this.nights.get(id);
  }
  async create(playgroupId: string, input: GameNightInput) {
    const night: GameNight = {
      ...input,
      id: randomUUID(),
      playgroupId,
      cancelled: false,
      eventJoinCode: null,
      createdAt: new Date().toISOString(),
    };
    this.nights.set(night.id, night);
    return night;
  }
  async update(
    id: string,
    patch: Partial<Pick<GameNight, 'cancelled' | 'eventJoinCode'>>,
  ) {
    const night = this.nights.get(id);
    if (!night) throw new Error('Game night not found.');
    const next = { ...night, ...patch };
    this.nights.set(id, next);
    return next;
  }
  async rsvps(id: string) {
    return [...(this.answers.get(id)?.values() ?? [])];
  }
  async rsvp(id: string, tokenHash: string, response: NightRsvp) {
    const answers = this.answers.get(id) ?? new Map<string, NightRsvp>();
    answers.set(tokenHash, response);
    this.answers.set(id, answers);
  }
  async exclusive<T>(id: string, work: () => Promise<T>): Promise<T> {
    const before = this.locks.get(id) ?? Promise.resolve();
    const task = before.catch(() => {}).then(work);
    this.locks.set(id, task);
    try {
      return await task;
    } finally {
      if (this.locks.get(id) === task) this.locks.delete(id);
    }
  }
}
function present(row: typeof gameNights.$inferSelect): GameNight {
  return {
    ...row,
    startsAt: row.startsAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
export class PostgresGameNightStore implements GameNightStore {
  async list(playgroupId: string) {
    return (
      await getDb()
        .select()
        .from(gameNights)
        .where(eq(gameNights.playgroupId, playgroupId))
        .orderBy(desc(gameNights.createdAt))
    ).map(present);
  }
  async get(id: string) {
    const [row] = await getDb()
      .select()
      .from(gameNights)
      .where(eq(gameNights.id, id));
    return row ? present(row) : undefined;
  }
  async create(playgroupId: string, input: GameNightInput) {
    const [row] = await getDb()
      .insert(gameNights)
      .values({ ...input, playgroupId, startsAt: new Date(input.startsAt) })
      .returning();
    return present(row!);
  }
  async update(
    id: string,
    patch: Partial<Pick<GameNight, 'cancelled' | 'eventJoinCode'>>,
  ) {
    const [row] = await getDb()
      .update(gameNights)
      .set(patch)
      .where(eq(gameNights.id, id))
      .returning();
    return present(row!);
  }
  async rsvps(id: string) {
    return getDb()
      .select({
        displayName: gameNightRsvps.displayName,
        response: gameNightRsvps.response,
      })
      .from(gameNightRsvps)
      .where(eq(gameNightRsvps.nightId, id));
  }
  async rsvp(id: string, tokenHash: string, response: NightRsvp) {
    await getDb()
      .insert(gameNightRsvps)
      .values({ nightId: id, tokenHash, ...response })
      .onConflictDoUpdate({
        target: [gameNightRsvps.nightId, gameNightRsvps.tokenHash],
        set: response,
      });
  }
  async exclusive<T>(id: string, work: () => Promise<T>): Promise<T> {
    // All store calls inside work use this transaction's connection. This
    // keeps event creation and linking atomic and avoids pool self-deadlocks.
    return withDbTransaction(async () => {
      const lock = await getDb().execute(
        sql`select pg_try_advisory_xact_lock(hashtextextended(${id}, 0)) as acquired`,
      );
      if (lock.rows[0]?.acquired !== true) throw new GameNightBusyError();
      return work();
    });
  }
}

export class GameNightBusyError extends Error {
  constructor() {
    super('This game night is being updated. Please try again.');
  }
}
