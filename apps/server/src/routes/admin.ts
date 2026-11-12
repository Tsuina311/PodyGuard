import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';

// Separate from player/account sessions. Never include this secret in a web build.
export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const expected = process.env.ADMIN_ACCESS_TOKEN?.trim();
    if (!expected || expected.length < 32) {
      return reply.code(503).send({ error: { code: 'ADMIN_DISABLED', message: 'Admin access is not configured.' } });
    }
    const header = request.headers.authorization ?? '';
    const actual = header.startsWith('Bearer ') ? header.slice(7) : '';
    const digest = (value: string) => createHash('sha256').update(value).digest();
    if (!timingSafeEqual(digest(actual), digest(expected))) {
      return reply.code(403).send({ error: { code: 'ADMIN_FORBIDDEN', message: 'Admin access denied.' } });
    }
  });

  app.get('/admin/playgroups', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const query = request.query as { offset?: string };
    const offset = Number(query.offset ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0) {
      return reply.code(400).send({ error: { code: 'INVALID_OFFSET', message: 'Offset must be a non-negative integer.' } });
    }
    const rows = await app.events.listAdminPlaygroups(offset, 51);
    return { playgroups: rows.slice(0, 50), nextOffset: rows.length > 50 ? offset + 50 : null };
  });

  app.get('/admin/playgroups/:playgroupId', async (request, reply) => {
    const { playgroupId } = request.params as { playgroupId: string };
    const overview = await app.events.getAdminPlaygroupOverview(playgroupId);
    return overview ? { overview } : reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Playgroup not found.' } });
  });
};
