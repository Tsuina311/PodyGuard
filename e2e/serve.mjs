#!/usr/bin/env node
/**
 * Single-process e2e stack: memory EventService + built web shell.
 * No DATABASE_URL required — same pattern as server unit tests.
 *
 *   yarn e2e:serve
 */
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../apps/server/src/app.ts';
import { EventService } from '../apps/server/src/events/event-service.ts';
import { MemoryEventStore } from '../apps/server/src/events/memory-event-store.ts';
import { createIdentityBoundary } from '../apps/server/src/identity/index.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = resolve(root, 'apps/web/dist');
const port = Number(process.env.E2E_PORT ?? 4173);
const host = process.env.E2E_HOST ?? '127.0.0.1';

if (!existsSync(resolve(webRoot, 'index.html'))) {
  console.error(
    `Missing ${webRoot}/index.html — run "yarn workspace @podyguard/web build" first.`,
  );
  process.exit(1);
}

process.env.NODE_ENV = 'production';
process.env.PARTICIPANT_SESSION_SECRET ??= 'e2e-participant-secret';

const identity = createIdentityBoundary({
  participantSessionSecret: process.env.PARTICIPANT_SESSION_SECRET,
});
const events = new EventService(new MemoryEventStore(), identity, {
  isDev: true,
});
const app = await buildApp({
  identity,
  events,
  logger: false,
  serveWeb: true,
  webRoot,
  // Memory store — no Postgres. Still report healthy so the prod shell's
  // "Waking the tables" screen (which probes /health) can dismiss.
  checkDatabase: async () => true,
});

await app.listen({ port, host });
console.log(`e2e stack ready at http://${host}:${String(port)}`);
