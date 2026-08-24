import { setDefaultResultOrder } from 'node:dns';
import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
loadEnv({ path: resolve(serverRoot, '.env') });

setDefaultResultOrder('ipv4first');
neonConfig.webSocketConstructor = WebSocket;

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error(`DATABASE_URL is not set.

Migrations apply against your remote managed PostgreSQL database.

  1. Copy apps/server/.env.example to apps/server/.env
  2. Set DATABASE_URL to your development database connection string
  3. Run: yarn db:migrate

Use a separate production DATABASE_URL in production. Never commit .env files.`);
    process.exit(1);
  }
  return databaseUrl;
}

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString: requireDatabaseUrl(),
    max: 1,
    connectionTimeoutMillis: 30_000,
  });
  const db = drizzle({ client: pool });

  console.log('Running migrations against managed PostgreSQL...');
  await migrate(db, { migrationsFolder: resolve(serverRoot, 'drizzle') });
  console.log('Migrations complete.');

  await pool.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
