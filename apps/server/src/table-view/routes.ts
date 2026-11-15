import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { TableViewState } from '@podyguard/shared';
const TTL = 24 * 3600_000;
const secret = () => randomBytes(32).toString('hex');
const matches = (header: string | undefined, token: string) => {
  const supplied = header?.startsWith('Bearer ') ? header.slice(7) : '';
  return (
    /^[a-f0-9]{64}$/.test(supplied) &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
  );
};
function parse(value: unknown): TableViewState | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as TableViewState;
  const text = (s: unknown) =>
    typeof s === 'string' && s.length > 0 && s.length <= 200;
  const number = (n: unknown) =>
    typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e9;
  if (
    !text(v.format) ||
    typeof v.paused !== 'boolean' ||
    !(
      v.startedAt === null ||
      (typeof v.startedAt === 'number' &&
        Number.isFinite(v.startedAt) &&
        v.startedAt >= 0)
    ) ||
    !(v.winnerId === null || text(v.winnerId)) ||
    !Array.isArray(v.players) ||
    v.players.length < 2 ||
    v.players.length > 8
  )
    return null;
  const players: TableViewState['players'] = [];
  for (const p of v.players) {
    if (
      !p ||
      !text(p.id) ||
      !text(p.name) ||
      !number(p.life) ||
      !number(p.poison) ||
      !Array.isArray(p.commanders) ||
      p.commanders.length > 2 ||
      !p.commanders.every((c) => c && text(c.id) && text(c.name)) ||
      !p.commanderDamage ||
      typeof p.commanderDamage !== 'object' ||
      Array.isArray(p.commanderDamage) ||
      Object.keys(p.commanderDamage).length > 16 ||
      !Object.entries(p.commanderDamage).every(
        ([key, n]) => text(key) && number(n),
      )
    )
      return null;
    players.push({
      id: p.id,
      name: p.name,
      life: p.life,
      poison: p.poison,
      commanders: p.commanders.map((c) => ({ id: c.id, name: c.name })),
      commanderDamage: { ...p.commanderDamage },
    });
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) return null;
  return {
    format: v.format,
    startedAt: v.startedAt,
    paused: v.paused,
    winnerId: v.winnerId,
    players,
  };
}
/** Short-lived, capability-protected viewing sessions. One main device writes. */
export const tableViewRoutes: FastifyPluginAsync = async (app) => {
  const shares = new Map<
    string,
    {
      readToken: string;
      writeToken: string;
      state: TableViewState;
      updatedAt: number;
      revision: number;
      context?: string;
    }
  >();
  const prune = () => {
    for (const [id, row] of shares)
      if (Date.now() - row.updatedAt > TTL) shares.delete(id);
  };
  async function eventContext(joinCode: string, authorization?: string) {
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';
    const { participant, event } = await app.events.getMe(joinCode, token);
    if (participant.status !== 'playing') throw new Error('Not playing');
    const snapshot = await app.events.getSnapshot(joinCode);
    const table = snapshot.tables.find(
      (row) => row.label === participant.tableLabel,
    );
    if (!table?.playingStartedAt) throw new Error('No current game');
    return `${event.id}:${table.id}:${table.playingStartedAt}`;
  }
  app.addHook('onRequest', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
  });
  app.get<{ Params: { joinCode: string } }>(
    '/events/:joinCode/table-view',
    async (req, reply) => {
      prune();
      try {
        const context = await eventContext(
          req.params.joinCode,
          req.headers.authorization,
        );
        const found = [...shares.entries()].find(
          ([, row]) => row.context === context,
        );
        return {
          view: found ? { id: found[0], readToken: found[1].readToken } : null,
        };
      } catch {
        return reply
          .code(403)
          .send({
            error: {
              message: 'Only players at this table can find its viewing link.',
            },
          });
      }
    },
  );
  app.post(
    '/tracker-shares',
    {
      bodyLimit: 32_768,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      prune();
      const state = parse(req.body);
      if (!state)
        return reply
          .code(400)
          .send({ error: { message: 'Invalid table state.' } });
      if (shares.size >= 1000)
        return reply.code(503).send({
          error: { message: 'Table sharing is busy. Try again later.' },
        });
      let context: string | undefined;
      const eventCode = (req.body as { eventCode?: unknown }).eventCode;
      if (eventCode !== undefined) {
        if (typeof eventCode !== 'string')
          return reply.code(400).send({ error: { message: 'Invalid event.' } });
        try {
          context = await eventContext(eventCode, req.headers.authorization);
        } catch {
          return reply
            .code(403)
            .send({
              error: {
                message: 'Only a player in this game can share its tracker.',
              },
            });
        }
        if ([...shares.values()].some((row) => row.context === context))
          return reply
            .code(409)
            .send({
              error: {
                message:
                  'This table already has a main tracker. Open its live viewing link instead.',
              },
            });
      }
      const id = secret();
      const readToken = secret();
      const writeToken = secret();
      shares.set(id, {
        readToken,
        writeToken,
        state,
        updatedAt: Date.now(),
        revision: 0,
        context,
      });
      return { id, readToken, writeToken };
    },
  );
  app.get<{ Params: { id: string } }>(
    '/tracker-shares/:id',
    async (req, reply) => {
      prune();
      const row = shares.get(req.params.id);
      if (!row || !matches(req.headers.authorization, row.readToken))
        return reply.code(404).send({
          error: {
            message:
              'This viewing link is unavailable. Ask the main device for its current link.',
          },
        });
      return {
        state: row.state,
        updatedAt: row.updatedAt,
        revision: row.revision,
      };
    },
  );
  app.put<{ Params: { id: string } }>(
    '/tracker-shares/:id',
    {
      bodyLimit: 32_768,
      config: { rateLimit: { max: 900, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      prune();
      const row = shares.get(req.params.id);
      if (!row)
        return reply
          .code(404)
          .send({ error: { message: 'Viewing session expired.' } });
      if (!matches(req.headers.authorization, row.writeToken))
        return reply.code(403).send({
          error: { message: 'Only the main device can update this table.' },
        });
      const state = parse(req.body);
      if (!state)
        return reply
          .code(400)
          .send({ error: { message: 'Invalid table state.' } });
      row.state = state;
      row.updatedAt = Date.now();
      row.revision += 1;
      return { revision: row.revision };
    },
  );
  app.delete<{ Params: { id: string } }>(
    '/tracker-shares/:id',
    async (req, reply) => {
      const row = shares.get(req.params.id);
      if (!row || !matches(req.headers.authorization, row.writeToken))
        return reply.code(403).send({
          error: { message: 'Only the main device can stop sharing.' },
        });
      shares.delete(req.params.id);
      return { stopped: true };
    },
  );
  app.addHook('onClose', async () => {
    shares.clear();
  });
};
