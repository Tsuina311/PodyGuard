import type { FastifyPluginAsync } from 'fastify';
import { LinkTransferError } from './service.js';
const token = (header?: string) => header?.startsWith('Bearer ') ? header.slice(7) : '';

export const linkTransferRoutes: FastifyPluginAsync = async app => {
  app.addHook('onSend', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof LinkTransferError) return reply.code(error.statusCode).send({ error: { code: 'LINK_TRANSFER_ERROR', message: error.message } });
    if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: { code: 'LINK_TRANSFER_ERROR', message: error.message } });
    }
    app.log.error(error);
    return reply.code(500).send({ error: { code: 'LINK_TRANSFER_ERROR', message: 'Transfer temporarily unavailable.' } });
  });
  app.post('/link-transfers', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (_request, reply) =>
    reply.code(201).send(await app.linkTransfers.create()));
  app.get('/link-transfers/:id', { config: { rateLimit: { max: 90, timeWindow: '1 minute' } } }, async request =>
    app.linkTransfers.receive((request.params as { id: string }).id, token(request.headers.authorization)));
  app.post('/link-transfers/:id', { bodyLimit: 12_000, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async request => {
    const id = (request.params as { id: string }).id;
    const result = await app.linkTransfers.send(id, token(request.headers.authorization), (request.body as { destination?: unknown } | null)?.destination);
    app.live.publishTransfer(id);
    return result;
  });
};
