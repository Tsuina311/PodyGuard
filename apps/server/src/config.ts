import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: resolve(serverRoot, '.env') });

const SETUP_MESSAGE = `DATABASE_URL is not set.

PodyGuard uses a remote managed PostgreSQL database.

Setup:
  1. Create a development database with your managed Postgres provider
     (separate from production).
  2. Copy apps/server/.env.example to apps/server/.env
  3. Set DATABASE_URL to your development connection string
  4. Run: yarn db:migrate
  5. Run: yarn dev:server

Never commit .env files. Credentials stay in local environment variables only.
Do not use local PostgreSQL or Docker for this project.`;

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error(SETUP_MESSAGE);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const participantSessionSecret = process.env.PARTICIPANT_SESSION_SECRET?.trim();

if (nodeEnv === 'production' && !participantSessionSecret) {
  throw new Error(
    'PARTICIPANT_SESSION_SECRET is required in production. Generate a long random value and keep it stable between deploys.',
  );
}

export const config = {
  nodeEnv,
  host: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: requireDatabaseUrl(),
  isDev: nodeEnv !== 'production',
  /** HMAC key for event-scoped host and participant tokens. */
  participantSessionSecret,
} as const;
