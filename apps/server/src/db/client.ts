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
  if (!dbInstance) {
    dbInstance = drizzle({ client: getPool(), schema });
  }
  return dbInstance;
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
