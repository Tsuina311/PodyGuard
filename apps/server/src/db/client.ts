import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config.js';
import * as schema from './schema.js';

type Db = ReturnType<typeof drizzle<typeof schema>>;

let queryClient: ReturnType<typeof postgres> | undefined;
let dbInstance: Db | undefined;

function getQueryClient() {
  if (!queryClient) {
    queryClient = postgres(config.databaseUrl, {
      max: 10,
      connect_timeout: 10,
    });
  }
  return queryClient;
}

export function getDb(): Db {
  if (!dbInstance) {
    dbInstance = drizzle(getQueryClient(), { schema });
  }
  return dbInstance;
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const client = getQueryClient();
    await client`select 1`;
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  if (queryClient) {
    await queryClient.end({ timeout: 5 });
    queryClient = undefined;
    dbInstance = undefined;
  }
}
