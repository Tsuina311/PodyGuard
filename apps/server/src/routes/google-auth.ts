import type { FastifyPluginAsync } from 'fastify';
import { GoogleSignIn, GoogleSignInError } from '../identity/google-sign-in.js';
import { sendEventError } from './events.js';

export const googleAuthRoutes: FastifyPluginAsync = async (app) => {
  const google = new GoogleSignIn();
  app.addHook('onRequest', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); });

  // POST ensures browsers send Origin even when frontend/API share an origin.
  app.post('/auth/google/config', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    try {
      return google.configuration(request.headers.origin);
    } catch (error) {
      if (error instanceof GoogleSignInError) return reply.code(error.status).send({ error: { code: error.code, message: error.message } });
      throw error;
    }
  });

  app.post('/auth/google', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    // Only the JS callback can submit JSON. Form/redirect logins are not accepted;
    // a malicious site cannot set an ambient account cookie (there is none).
    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
      return reply.code(415).send({ error: { code: 'JSON_REQUIRED', message: 'Sign-in requires JSON.' } });
    }
    const body = (request.body ?? {}) as { credential?: unknown; nonce?: unknown };
    try {
      const verified = await google.verify(body.credential, body.nonce, request.headers.origin);
      return await app.events.loginWithGoogleAuth(verified);
    } catch (error) {
      if (error instanceof GoogleSignInError) return reply.code(error.status).send({ error: { code: error.code, message: error.message } });
      return sendEventError(reply, error);
    }
  });
};
