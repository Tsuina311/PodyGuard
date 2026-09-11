import type { FastifyPluginAsync } from 'fastify';
import { checkDatabaseConnection } from '../db/client.js';

const serverStartedAt = new Date();
const buildVersion =
  process.env.RENDER_GIT_COMMIT?.trim().slice(0, 7) ||
  process.env.GITHUB_SHA?.trim().slice(0, 7) ||
  process.env.npm_package_version?.trim() ||
  'dev';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_request, reply) => {
    const databaseOk = await checkDatabaseConnection();
    const uptimeSeconds = Math.max(
      0,
      Math.floor((Date.now() - serverStartedAt.getTime()) / 1000),
    );

    return reply.code(databaseOk ? 200 : 503).send({
      ok: databaseOk,
      service: 'podyguard-server',
      database: databaseOk ? 'up' : 'down',
      timestamp: new Date().toISOString(),
      buildVersion,
      serverStartedAt: serverStartedAt.toISOString(),
      uptimeSeconds,
    });
  });
};
