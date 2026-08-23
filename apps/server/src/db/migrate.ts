import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
loadEnv({ path: resolve(serverRoot, '.env') });

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
  const databaseUrl = requireDatabaseUrl();
  const migrationClient = postgres(databaseUrl, { max: 1 });
  const db = drizzle(migrationClient);

  console.log('Running migrations against managed PostgreSQL...');
  await migrate(db, { migrationsFolder: resolve(serverRoot, 'drizzle') });
  console.log('Migrations complete.');

  await migrationClient.end({ timeout: 5 });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
