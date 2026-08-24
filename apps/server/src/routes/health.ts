import type { FastifyPluginAsync } from 'fastify';
import { checkDatabaseConnection } from '../db/client.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_request, reply) => {
    const databaseOk = await checkDatabaseConnection();

    return reply.code(databaseOk ? 200 : 503).send({
      ok: databaseOk,
      service: 'podyguard-server',
      database: databaseOk ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    });
  });
};
