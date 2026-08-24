import type { FastifyPluginAsync } from 'fastify';
import { checkDatabaseConnection } from '../db/client.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    const databaseOk = await checkDatabaseConnection();

    return {
      ok: databaseOk,
      service: 'podyguard-server',
      database: databaseOk ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    };
  });
};
