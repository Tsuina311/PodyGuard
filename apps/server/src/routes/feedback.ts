import type { FastifyPluginAsync } from 'fastify';
import {
  FeedbackService,
  FeedbackUnavailableError,
} from '../feedback/service.js';
import {
  InvalidFeedbackError,
  parseFeedbackPayload,
} from '../feedback/validation.js';

type FeedbackRouteOptions = {
  service: FeedbackService;
};

export const feedbackRoutes: FastifyPluginAsync<FeedbackRouteOptions> = async (
  app,
  options,
) => {
  app.post(
    '/feedback',
    {
      bodyLimit: 16 * 1024,
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      try {
        const feedback = parseFeedbackPayload(request.body);
        await options.service.submit(feedback);
        return reply.code(201).send({ ok: true });
      } catch (error) {
        if (error instanceof InvalidFeedbackError) {
          return reply.code(400).send({
            error: {
              code: 'INVALID_FEEDBACK',
              message: error.message,
            },
          });
        }
        if (error instanceof FeedbackUnavailableError) {
          return reply.code(503).send({
            error: {
              code: 'FEEDBACK_UNAVAILABLE',
              message: error.message,
            },
          });
        }
        request.log.error({ err: error }, 'Could not submit feedback');
        return reply.code(502).send({
          error: {
            code: 'FEEDBACK_DELIVERY_FAILED',
            message: 'Could not deliver feedback. Please try again later.',
          },
        });
      }
    },
  );
};
