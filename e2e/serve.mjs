#!/usr/bin/env node
/**
 * Single-process e2e stack: memory EventService + built web shell.
 * No DATABASE_URL required — same pattern as server unit tests.
 *
 *   yarn e2e:serve
 */
import './environment.ts';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../apps/server/src/app.ts';
import { EventService } from '../apps/server/src/events/event-service.ts';
import { MemoryEventStore } from '../apps/server/src/events/memory-event-store.ts';
import { createIdentityBoundary } from '../apps/server/src/identity/index.ts';
import { seedDemo } from './demo-seed.ts';

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
const demo = await seedDemo(events);
// This server always uses MemoryEventStore and never reads DATABASE_URL.
// The known credential and demo login are deliberately exclusive to this entrypoint.
process.env.ADMIN_ACCESS_TOKEN = 'local-demo-admin-token-not-for-production';
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

app.get('/test/demo', async (_request, reply) => reply.header('Cache-Control', 'no-store').send(demo));
app.get('/demo', async (_request, reply) => reply.type('text/html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><title>PodyGuard demo</title><body><h1>Isolated PodyGuard demo</h1><p>Fictional players and games. Changes reset when this server restarts.</p><button id="open">Open demo account</button><p><a href="/#/admin">Read-only administration</a></p><p>Local admin token: local-demo-admin-token-not-for-production</p><script>document.getElementById('open').onclick=async()=>{const d=await(await fetch('/test/demo')).json();localStorage.setItem('podyguard.account.session',JSON.stringify({token:d.token,account:d.account}));localStorage.setItem('podyguard.account.preferredPlaygroupId',d.playgroup.id);localStorage.setItem('podyguard-lang','en');location.href='/#/account';};</script></body></html>`));

await app.listen({ port, host });
console.log(`e2e stack ready at http://${host}:${String(port)}`);
