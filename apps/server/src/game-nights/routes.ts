import { createHash } from 'node:crypto';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import {
  gameNightCalendar,
  parsePregameAgreement,
  type GameNightInput,
  type NightRsvp,
} from '@podyguard/shared';
import { InvalidEventInputError } from '../events/validation.js';
import { sendEventError } from '../routes/events.js';
import { GameNightBusyError, type GameNightStore } from './store.js';
function sendNightError(reply: FastifyReply, error: unknown) {
  if (error instanceof GameNightBusyError)
    return reply
      .code(409)
      .send({ error: { code: 'NIGHT_BUSY', message: error.message } });
  return sendEventError(reply, error);
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bearer = (s?: string) =>
  s?.startsWith('Bearer ') ? s.slice(7).trim() : '';
function text(
  value: unknown,
  label: string,
  max: number,
  required = true,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    throw new InvalidEventInputError(`Invalid ${label}.`);
  return value.trim();
}
export const gameNightRoutes: FastifyPluginAsync<{
  store: GameNightStore;
}> = async (app, { store }) => {
  const host = (token: string, group: string) =>
    app.events.getPlaygroupOverview(token, group);
  const fresh = (night: { startsAt: string; cancelled: boolean }) =>
    !night.cancelled && Date.now() < Date.parse(night.startsAt) + 24 * 3600_000;
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
  });
  app.get<{ Params: { playgroupId: string } }>(
    '/playgroups/:playgroupId/nights',
    async (req, reply) => {
      try {
        await host(bearer(req.headers.authorization), req.params.playgroupId);
        return { nights: await store.list(req.params.playgroupId) };
      } catch (e) {
        return sendNightError(reply, e);
      }
    },
  );
  app.post<{ Params: { playgroupId: string } }>(
    '/playgroups/:playgroupId/nights',
    async (req, reply) => {
      try {
        await host(bearer(req.headers.authorization), req.params.playgroupId);
        const body = (req.body ?? {}) as Record<string, unknown>;
        const startsAt = text(body.startsAt, 'start time', 40);
        if (
          !Number.isFinite(Date.parse(startsAt)) ||
          !/(Z|[+-]\d\d:\d\d)$/.test(startsAt) ||
          Date.parse(startsAt) <= Date.now()
        )
          throw new InvalidEventInputError(
            'Choose a future start time with a time zone.',
          );
        const timeZone = text(body.timeZone, 'time zone', 100);
        try {
          new Intl.DateTimeFormat('en', { timeZone });
        } catch {
          throw new InvalidEventInputError('Choose a valid time zone.');
        }
        if (
          !Number.isInteger(body.seatTarget) ||
          Number(body.seatTarget) < 2 ||
          Number(body.seatTarget) > 100
        )
          throw new InvalidEventInputError('Choose 2–100 seats.');
        let agreement;
        try {
          agreement = parsePregameAgreement(body.agreement);
        } catch (e) {
          throw new InvalidEventInputError((e as Error).message);
        }
        const input: GameNightInput = {
          name: text(body.name, 'name', 80),
          startsAt: new Date(startsAt).toISOString(),
          timeZone,
          location: text(body.location ?? '', 'location', 200, false),
          seatTarget: Number(body.seatTarget),
          agreement,
        };
        return reply
          .code(201)
          .send({ night: await store.create(req.params.playgroupId, input) });
      } catch (e) {
        return sendNightError(reply, e);
      }
    },
  );
  app.get<{ Params: { id: string } }>('/nights/:id', async (req, reply) => {
    if (!uuid.test(req.params.id))
      return reply.code(404).send({
        error: { code: 'NIGHT_MISSING', message: 'Game night not found.' },
      });
    const night = await store.get(req.params.id);
    if (!night)
      return reply.code(404).send({
        error: { code: 'NIGHT_MISSING', message: 'Game night not found.' },
      });
    return { night, responses: await store.rsvps(night.id) };
  });
  app.get<{ Params: { id: string } }>(
    '/nights/:id/calendar',
    async (req, reply) => {
      const night = uuid.test(req.params.id)
        ? await store.get(req.params.id)
        : undefined;
      if (!night) return reply.code(404).send();
      return reply
        .header(
          'Content-Disposition',
          'attachment; filename="podyguard-night.ics"',
        )
        .type('text/calendar; charset=utf-8')
        .send(gameNightCalendar(night));
    },
  );
  app.post<{ Params: { id: string } }>(
    '/nights/:id/rsvp',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      if (!uuid.test(req.params.id)) return reply.code(404).send();
      try {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const token = text(body.rsvpToken, 'response key', 128);
        if (!/^[a-zA-Z0-9_-]{32,128}$/.test(token))
          throw new InvalidEventInputError('Invalid response key.');
        if (
          typeof body.response !== 'string' ||
          !['yes', 'maybe', 'no'].includes(body.response)
        )
          throw new InvalidEventInputError('Choose Yes, Maybe or No.');
        const response: NightRsvp = {
          displayName: text(body.displayName, 'display name', 24),
          response: body.response as NightRsvp['response'],
        };
        return await store.exclusive(req.params.id, async () => {
          const night = await store.get(req.params.id);
          if (!night) return reply.code(404).send();
          if (!fresh(night) || night.eventJoinCode)
            return reply.code(409).send({
              error: {
                code: 'NIGHT_CLOSED',
                message: 'This invitation is closed.',
              },
            });
          await store.rsvp(
            night.id,
            createHash('sha256').update(token).digest('hex'),
            response,
          );
          return { ok: true };
        });
      } catch (e) {
        return sendNightError(reply, e);
      }
    },
  );
  app.post<{ Params: { id: string } }>(
    '/nights/:id/cancel',
    async (req, reply) => {
      if (!uuid.test(req.params.id)) return reply.code(404).send();
      try {
        return await store.exclusive(req.params.id, async () => {
          const night = await store.get(req.params.id);
          if (!night) return reply.code(404).send();
          await host(bearer(req.headers.authorization), night.playgroupId);
          if (night.eventJoinCode)
            return reply.code(409).send({
              error: {
                code: 'NIGHT_STARTED',
                message: 'Manage the running event from the host desk.',
              },
            });
          return { night: await store.update(night.id, { cancelled: true }) };
        });
      } catch (e) {
        return sendNightError(reply, e);
      }
    },
  );
  app.post<{ Params: { id: string } }>(
    '/nights/:id/start',
    async (req, reply) => {
      if (!uuid.test(req.params.id)) return reply.code(404).send();
      try {
        return await store.exclusive(req.params.id, async () => {
          const night = await store.get(req.params.id);
          if (!night) return reply.code(404).send();
          const token = bearer(req.headers.authorization);
          await host(token, night.playgroupId);
          if (night.eventJoinCode)
            return {
              event: await app.events.getEvent(night.eventJoinCode),
              hostToken: token,
            };
          const recovered = await app.events.findGameNightEvent(
            night.playgroupId,
            night.id,
            token,
          );
          if (recovered) {
            await store.update(night.id, { eventJoinCode: recovered.joinCode });
            return { event: recovered, hostToken: token };
          }
          if (!fresh(night))
            return reply.code(409).send({
              error: {
                code: 'NIGHT_CLOSED',
                message: 'This invitation is closed.',
              },
            });
          const body = (req.body ?? {}) as Record<string, unknown>;
          const result = await app.events.createEvent(
            {
              name: night.name,
              hostPin: text(body.hostPin, 'host PIN', 20),
              gameMode: 'commander',
              rulesFormat: 'commander',
              tableCount: Math.ceil(night.seatTarget / 4),
              playgroupId: night.playgroupId,
              gameNightId: night.id,
              pregameAgreement: night.agreement,
            },
            token,
          );
          await store.update(night.id, {
            eventJoinCode: result.event.joinCode,
          });
          return result;
        });
      } catch (e) {
        return sendNightError(reply, e);
      }
    },
  );
};
