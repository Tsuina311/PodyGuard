import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { isJoinCodeFormat, normalizeJoinCode, parseEventTrackerHistory, publicEventTrackerState, type EventTrackerSnapshot, type EventTrackerHistory, type EventMonitorState, type PublicTable } from '@podyguard/shared';
import { EventNotFoundError } from '../events/event-store.js';
import type { EventTrackerStore, TrackerRow } from './store.js';

function trackerContextKey(eventId: string, table: PublicTable) {
  return `${eventId}:${table.id}:${table.playingStartedAt}:${table.gameId}`;
}

export async function eventTrackerContext(app: FastifyInstance, code: string, authorization?: string) {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  const { participant, event } = await app.events.getMe(code, token);
  if (participant.status !== 'playing') throw new Error('Not playing');
  const snapshot = await app.events.getSnapshot(code);
  const table = snapshot.tables.find(row => row.label === participant.tableLabel);
  if (!table?.playingStartedAt || !table.gameId) throw new Error('No current game');
  return { key: trackerContextKey(event.id, table), gameId: table.gameId, event, participant,
    ids: snapshot.participants.filter(p => p.tableLabel === table.label && p.status === 'playing').map(p => p.id) };
}
function present(row: TrackerRow, ownerId?: string, deviceId?: string): EventTrackerSnapshot {
  const owned = row.ownerId === ownerId && row.deviceId === deviceId;
  return { id: row.id, gameId: row.gameId, readToken: row.readToken, ownerId: row.ownerId, ownerName: row.ownerName,
    generation: row.generation, revision: row.revision, updatedAt: row.updatedAt, owned, monitorShared: row.monitorShared,
    ...(row.transfer && Date.now() - row.transfer.requestedAt < 30_000 ? { transfer: { id: row.transfer.id, name: row.transfer.name } } : {}),
    state: publicEventTrackerState(row.history.present), ...(owned ? { history: row.history } : {}) };
}
function sameRoster(history: EventTrackerHistory, ids: string[]) {
  const expected = [...ids].sort().join(':');
  return [history.present, ...history.past].every(state =>
    (state.players as Array<{ id: string }>).map(p => p.id).sort().join(':') === expected &&
    state.gameMode === history.present.gameMode && state.rulesFormat === history.present.rulesFormat);
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const device = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);

export const eventTrackerRoutes: FastifyPluginAsync<{ store: EventTrackerStore }> = async (app, { store }) => {
  app.addHook('onRequest', async (_req, reply) => { reply.header('Cache-Control', 'no-store'); reply.header('Referrer-Policy', 'no-referrer'); });
  app.get<{ Params: { joinCode: string }; Querystring: { device?: string; gameId?: string } }>('/events/:joinCode/tracker', async (req, reply) => {
    try {
      const context = await eventTrackerContext(app, req.params.joinCode, req.headers.authorization);
      if (req.query.gameId && req.query.gameId !== context.gameId) return reply.code(409).send({ error: { message: 'This game has changed. Reopen the event.' } });
      const row = await store.get(context.key);
      return { tracker: row ? present(row, context.participant.id, req.query.device) : null };
    } catch { return reply.code(403).send({ error: { message: 'Only players in this game can open its tracker.' } }); }
  });
  app.get<{ Params: { joinCode: string }; Querystring: { gameId?: string }; Reply: EventMonitorState | { error: { message: string } } }>(
    '/events/:joinCode/monitor',
    { config: { rateLimit: { max: 240, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const code = normalizeJoinCode(req.params.joinCode);
      const unavailable = () => reply.code(404).send({ error: { message: 'This event display is unavailable.' } });
      if (!isJoinCodeFormat(code)) return unavailable();
      try {
        const event = await app.events.getEvent(code);
        if (event.status === 'closed') return unavailable();
        const tables = (await app.events.listTables(code))
          .filter(table => table.podStatus === 'playing' && table.playingStartedAt && table.gameId);
        const contexts = tables.map(table => trackerContextKey(event.id, table));
        const published = new Set(await store.publishedContexts(contexts));
        const listed = tables.filter((_, index) => published.has(contexts[index]!));
        const selected = listed.find(table => table.gameId === req.query.gameId);
        const row = selected ? await store.get(trackerContextKey(event.id, selected)) : undefined;
        return {
          games: listed.map(table => ({ gameId: table.gameId!, tableLabel: table.label })),
          selected: row?.monitorShared ? {
            ownerName: row.ownerName, updatedAt: row.updatedAt, state: publicEventTrackerState(row.history.present),
          } : null,
        };
      } catch (error) {
        if (error instanceof EventNotFoundError) return unavailable();
        throw error;
      }
    },
  );
  for (const operation of ['claim', 'update', 'transfer', 'handoff', 'cancel-transfer', 'heartbeat', 'finish', 'monitor'] as const) {
    app.post<{ Params: { joinCode: string } }>(`/events/:joinCode/tracker/${operation}`, {
      bodyLimit: 2_097_152,
      config: { rateLimit: { max: operation === 'update' ? 900 : 120, timeWindow: '1 minute' } },
    }, async (req, reply) => {
      const body = (req.body ?? {}) as { id?: unknown; gameId?: unknown; device?: unknown; generation?: unknown; revision?: unknown; history?: unknown; transferId?: unknown; winnerParticipantId?: unknown; durationSeconds?: unknown; monitorShared?: unknown };
      if (!device(body.device)) return reply.code(400).send({ error: { message: 'Invalid tracker device.' } });
      let context: Awaited<ReturnType<typeof eventTrackerContext>>;
      try { context = await eventTrackerContext(app, req.params.joinCode, req.headers.authorization); }
      catch { return reply.code(403).send({ error: { message: 'Only players in this game can control its tracker.' } }); }
      if (body.gameId !== context.gameId) return reply.code(409).send({ error: { message: 'This game has changed. Reopen the event.' } });
      const result = await store.exclusive(context.key, async () => {
        // The host may have ended/reused the table while this request waited.
        try {
          if ((await eventTrackerContext(app, req.params.joinCode, req.headers.authorization)).key !== context.key)
            return reply.code(409).send({ error: { message: 'This game has changed.' } });
        } catch { return reply.code(403).send({ error: { message: 'This game is no longer active.' } }); }
        let row = await store.get(context.key);
        const owns = () => row?.ownerId === context.participant.id && row?.deviceId === body.device;
        if (!row) {
          if (operation !== 'claim') return reply.code(409).send({ error: { message: 'Open the current tracker before transferring control.' } });
          const history = parseEventTrackerHistory(body.history);
          if (!history || !sameRoster(history, context.ids) || history.present.gameMode !== context.event.gameMode || history.present.rulesFormat !== context.event.rulesFormat)
            return reply.code(400).send({ error: { message: 'The tracker must match this game and its players.' } });
          row = { context: context.key, id: randomUUID(), gameId: context.gameId, eventId: context.event.id, readToken: randomBytes(32).toString('hex'),
            ownerId: context.participant.id, ownerName: context.participant.displayName, deviceId: body.device as string,
            generation: 1, revision: 0, monitorShared: false, updatedAt: Date.now(), history, transfer: null };
          await store.put(row);
        } else if (operation === 'transfer') {
          if (body.id !== row.id || body.generation !== row.generation) return reply.code(409).send({ error: { message: 'Control has already moved. Refresh before trying again.' } });
          if (row.transfer && Date.now() - row.transfer.requestedAt < 30_000 && (row.transfer.ownerId !== context.participant.id || row.transfer.deviceId !== body.device))
            return reply.code(409).send({ error: { message: 'Another device is already waiting for control.' } });
          // A request never revokes an offline controller. Only its live acknowledgement can.
          row = { ...row, transfer: { id: row.transfer && Date.now() - row.transfer.requestedAt < 30_000 ? row.transfer.id : randomUUID(), ownerId: context.participant.id,
            name: context.participant.displayName, deviceId: body.device as string, requestedAt: Date.now() } };
          await store.put(row);
        } else if (operation === 'update' || operation === 'heartbeat' || operation === 'finish' || operation === 'handoff' || operation === 'cancel-transfer' || operation === 'monitor') {
          if (body.id !== row.id || !owns() || body.generation !== row.generation) return reply.code(403).send({ error: { message: 'This game is now controlled on another device.' } });
          if (operation === 'monitor') {
            if (typeof body.monitorShared !== 'boolean') {
              return reply.code(400).send({ error: { message: 'Choose whether to show this game on the monitor.' } });
            }
            row = { ...row, monitorShared: body.monitorShared };
          }
          if (operation === 'cancel-transfer') {
            row = { ...row, transfer: null };
            await store.put(row);
            return { tracker: present(row, context.participant.id, body.device as string) };
          }
          if (operation === 'finish') {
            if (typeof body.winnerParticipantId !== 'string' || row.history.present.winnerId !== body.winnerParticipantId)
              return reply.code(409).send({ error: { message: 'Save the winning state before finishing this game.' } });
            return { participant: await app.events.reportGameResult(req.params.joinCode, req.headers.authorization!.slice(7), {
              winnerParticipantId: body.winnerParticipantId,
              expectedGameId: context.gameId,
              durationSeconds: typeof body.durationSeconds === 'number' ? body.durationSeconds : undefined,
            }) };
          }
          if (operation === 'update' || operation === 'handoff') {
            if (body.revision !== row.revision) return reply.code(409).send({ error: { message: 'A newer tracker update is already saved.' } });
            const history = parseEventTrackerHistory(body.history);
            const ids = (row.history.present.players as Array<{ id: string }>).map(p => p.id);
            if (!history || !sameRoster(history, ids) || history.present.gameMode !== context.event.gameMode || history.present.rulesFormat !== context.event.rulesFormat)
              return reply.code(400).send({ error: { message: 'Invalid tracker update.' } });
            row = { ...row, history, revision: row.revision + 1 };
            if (operation === 'handoff') {
              const pending = row.transfer;
              if (!pending || pending.id !== body.transferId || Date.now() - pending.requestedAt >= 30_000)
                return reply.code(409).send({ error: { message: 'The transfer request has expired.' } });
              if (!context.ids.includes(pending.ownerId)) return reply.code(409).send({ error: { message: 'That player has left the game.' } });
              row = { ...row, ownerId: pending.ownerId, ownerName: pending.name, deviceId: pending.deviceId,
                generation: row.generation + 1, transfer: null };
            }
          }
          row = { ...row, updatedAt: Date.now() };
          await store.put(row);
        }
        return { tracker: present(row, context.participant.id, body.device as string) };
      });
      if (operation === 'finish' && reply.statusCode < 400) await app.live.publish(req.params.joinCode);
      return result;
    });
  }
  app.get<{ Params: { id: string } }>('/event-trackers/:id/view', async (req, reply) => {
    if (!uuid.test(req.params.id)) return reply.code(404).send({ error: { message: 'This tracker link is unavailable.' } });
    const row = await store.getById(req.params.id);
    const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    if (!row || !/^[a-f0-9]{64}$/.test(token) || !timingSafeEqual(Buffer.from(token), Buffer.from(row.readToken)) || Date.now() - row.updatedAt > 24 * 3600_000)
      return reply.code(404).send({ error: { message: 'This tracker link is unavailable.' } });
    const state = publicEventTrackerState(row.history.present);
    return { state, ownerName: row.ownerName, revision: row.revision, updatedAt: row.updatedAt };
  });
};
