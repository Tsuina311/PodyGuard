import type { FastifyPluginAsync } from 'fastify';
import { checkDatabaseConnection } from '../db/client.js';

const serverStartedAt = new Date();
const buildVersion =
  process.env.RENDER_GIT_COMMIT?.trim().slice(0, 7) ||
  process.env.GITHUB_SHA?.trim().slice(0, 7) ||
  process.env.npm_package_version?.trim() ||
  'dev';

export type HealthRoutesOptions = {
  /**
   * Override the Postgres probe. Memory-backed stacks (e2e) have no DB and
   * must still report healthy so the prod wake screen can clear.
   */
  checkDatabase?: () => Promise<boolean>;
};

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (
  app,
  opts,
) => {
  const checkDatabase = opts.checkDatabase ?? checkDatabaseConnection;
  app.get('/health', async (_request, reply) => {
    const databaseOk = await checkDatabase();
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
