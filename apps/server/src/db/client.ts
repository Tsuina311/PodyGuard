import { AsyncLocalStorage } from 'node:async_hooks';
import { setDefaultResultOrder } from 'node:dns';
import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { config } from '../config.js';
import * as schema from './schema.js';

/**
 * Many networks (including this one) allow HTTPS :443 but block Postgres :5432.
 * Neon’s serverless driver talks WebSocket over 443, so health and queries work
 * when a raw TCP connection to the compute host times out.
 */
setDefaultResultOrder('ipv4first');
neonConfig.webSocketConstructor = WebSocket;

type Db = ReturnType<typeof drizzle<typeof schema>>;

let pool: Pool | undefined;
let dbInstance: Db | undefined;
const transactionContext = new AsyncLocalStorage<Db>();

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      connectionTimeoutMillis: 30_000,
    });
  }
  return pool;
}

export function getDb(): Db {
  const transaction = transactionContext.getStore();
  if (transaction) return transaction;
  if (!dbInstance) {
    dbInstance = drizzle({ client: getPool(), schema });
  }
  return dbInstance;
}

/** Run existing stores on one connection, including nested store transactions.
 * AsyncLocalStorage isolates concurrent requests and restores the normal DB on
 * exit. Drizzle transactions support the query/transaction operations used by
 * our stores; the adapter stays internal to this database boundary. */
export async function withDbTransaction<T>(work: () => Promise<T>): Promise<T> {
  return getDb().transaction((tx) =>
    transactionContext.run(tx as unknown as Db, work),
  );
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await getPool().query('select 1');
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    dbInstance = undefined;
  }
}
