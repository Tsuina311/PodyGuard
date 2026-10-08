import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { EventService } from './event-service.js';
import { MemoryEventStore } from './memory-event-store.js';
import { createIdentityBoundary } from '../identity/index.js';

describe('Limited fake players', () => {
  it('fills the lobby and moves only the fakes through each gate', async () => {
    const identity = createIdentityBoundary({
      participantSessionSecret: 'limited-fake-secret',
    });
    const events = new EventService(new MemoryEventStore(), identity, {
      now: () => new Date('2026-08-31T10:00:00.000Z'),
    });
    const app = await buildApp({ identity, events, logger: false });
    const created = await app.inject({
      method: 'POST',
      url: '/events',
      payload: {
        name: 'Solo draft',
        hostPin: '2468',
        tableCount: 1,
        limitedModeConfigs: [
          {
            mode: 'PICK_TWO_DRAFT',
            enabled: true,
            preferredCohortSize: 4,
            minCohortSize: 4,
            maxCohortSize: 4,
            totalRounds: 3,
            deckbuildingMinutes: 20,
            roundMinutes: 35,
            matchStructure: 'BO1',
          },
        ],
      },
    });
    const event = created.json() as {
      event: { joinCode: string };
      hostToken: string;
    };
    const joined = await app.inject({
      method: 'POST',
      url: `/events/${event.event.joinCode}/join`,
      payload: { displayName: 'Ada' },
    });
    const human = joined.json() as { participant: { id: string }; token: string };
    const added = await app.inject({
      method: 'POST',
      url: `/events/${event.event.joinCode}/dev/limited-players`,
      headers: { authorization: `Bearer ${event.hostToken}` },
      payload: { mode: 'PICK_TWO_DRAFT', count: 3 },
    });
    expect(added.statusCode).toBe(200);
    const lobby = (added.json() as {
      snapshot: {
        participants: Array<{ id: string; isBot: boolean; status: string }>;
      };
    }).snapshot;
    const fakes = lobby.participants.filter((person) => person.isBot);
    expect(fakes).toHaveLength(3);
    expect(fakes.every((person) => person.status === 'joined')).toBe(true);
    expect(lobby.participants.find((person) => person.id === human.participant.id)?.status).toBe(
      'joined',
    );

    const readied = await app.inject({
      method: 'POST',
      url: `/events/${event.event.joinCode}/dev/limited-fakes`,
      headers: { authorization: `Bearer ${event.hostToken}` },
      payload: { action: 'ready', mode: 'PICK_TWO_DRAFT' },
    });
    const afterReady = (readied.json() as {
      snapshot: { participants: Array<{ id: string; isBot: boolean; status: string }> };
    }).snapshot.participants;
    expect(afterReady.filter((person) => person.isBot).every((person) => person.status === 'ready')).toBe(
      true,
    );
    expect(afterReady.find((person) => person.id === human.participant.id)?.status).toBe('joined');

    await app.inject({
      method: 'POST',
      url: `/events/${event.event.joinCode}/ready`,
      headers: { authorization: `Bearer ${human.token}` },
      payload: { ready: true },
    });
    const assigned = await app.inject({
      method: 'POST',
      url: `/events/${event.event.joinCode}/limited/assign`,
      headers: { authorization: `Bearer ${event.hostToken}` },
      payload: { mode: 'PICK_TWO_DRAFT' },
    });
    const sessionId = (assigned.json() as { session: { id: string } }).session.id;
    await app.inject({
      method: 'POST',
      url: `/events/${event.event.joinCode}/limited/sessions/${sessionId}/seat`,
      headers: { authorization: `Bearer ${human.token}` },
      payload: { seat: 1 },
    });
    await app.inject({
      method: 'POST',
      url: `/events/${event.event.joinCode}/limited/sessions/${sessionId}/seated`,
      headers: { authorization: `Bearer ${human.token}` },
    });
    const seatedFakes = await app.inject({
      method: 'POST',
      url: `/events/${event.event.joinCode}/dev/limited-fakes`,
      headers: { authorization: `Bearer ${event.hostToken}` },
      payload: { action: 'seat', sessionId },
    });
    const seating = (seatedFakes.json() as {
      snapshot: {
        limitedSessions?: Array<{
          participants: Array<{
            participantId: string;
            draftSeat?: number;
            seated?: boolean;
          }>;
        }>;
      };
    }).snapshot.limitedSessions?.[0];
    const fakeIds = new Set(fakes.map((person) => person.id));
    expect(
      seating?.participants
        .filter((person) => fakeIds.has(person.participantId))
        .map((person) => person.draftSeat)
        .sort(),
    ).toEqual([2, 3, 4]);
    expect(
      seating?.participants
        .filter((person) => fakeIds.has(person.participantId))
        .every((person) => person.seated !== true),
    ).toBe(true);

    const blocked = await app.inject({
      method: 'POST',
      url: `/events/${event.event.joinCode}/limited/sessions/${sessionId}/phase`,
      headers: { authorization: `Bearer ${event.hostToken}` },
      payload: { status: 'DRAFTING' },
    });
    expect(blocked.statusCode).toBe(409);
    await app.inject({
      method: 'POST',
      url: `/events/${event.event.joinCode}/dev/limited-fakes`,
      headers: { authorization: `Bearer ${event.hostToken}` },
      payload: { action: 'seated', sessionId },
    });
    const drafting = await app.inject({
      method: 'POST',
      url: `/events/${event.event.joinCode}/limited/sessions/${sessionId}/phase`,
      headers: { authorization: `Bearer ${event.hostToken}` },
      payload: { status: 'DRAFTING' },
    });
    expect(drafting.statusCode).toBe(200);

    const fakeDraft = await app.inject({
      method: 'POST',
      url: `/events/${event.event.joinCode}/dev/limited-fakes`,
      headers: { authorization: `Bearer ${event.hostToken}` },
      payload: { action: 'ack', sessionId },
    });
    const stillDrafting = (fakeDraft.json() as {
      snapshot: { limitedSessions?: Array<{ status: string; phaseAcks?: string[] }> };
    }).snapshot.limitedSessions?.[0];
    expect(stillDrafting?.status).toBe('DRAFTING');
    expect(stillDrafting?.phaseAcks).toHaveLength(3);
    expect(stillDrafting?.phaseAcks).not.toContain(human.participant.id);

    await app.inject({
      method: 'POST',
      url: `/events/${event.event.joinCode}/limited/sessions/${sessionId}/ack`,
      headers: { authorization: `Bearer ${human.token}` },
    });
    expect((await app.events.getSnapshot(event.event.joinCode)).limitedSessions?.[0]?.status).toBe(
      'DECKBUILDING',
    );
    await app.inject({
      method: 'POST',
      url: `/events/${event.event.joinCode}/dev/limited-fakes`,
      headers: { authorization: `Bearer ${event.hostToken}` },
      payload: { action: 'ack', sessionId },
    });
    await app.inject({
      method: 'POST',
      url: `/events/${event.event.joinCode}/limited/sessions/${sessionId}/ack`,
      headers: { authorization: `Bearer ${human.token}` },
    });
    const playing = (await app.events.getSnapshot(event.event.joinCode)).limitedSessions?.[0];
    expect(playing?.status).toBe('ROUND_ACTIVE');
    await app.inject({
      method: 'POST',
      url: `/events/${event.event.joinCode}/dev/limited-fakes`,
      headers: { authorization: `Bearer ${event.hostToken}` },
      payload: { action: 'report', sessionId },
    });
    const afterReport = (await app.events.getSnapshot(event.event.joinCode)).limitedSessions?.[0];
    const humanMatch = afterReport?.rounds[0]?.matches.find(
      (match) =>
        match.playerAId === human.participant.id || match.playerBId === human.participant.id,
    );
    const fakeMatch = afterReport?.rounds[0]?.matches.find(
      (match) =>
        match.playerAId !== human.participant.id && match.playerBId !== human.participant.id,
    );
    expect(humanMatch?.outcome).toBeUndefined();
    expect(fakeMatch?.outcome).toBe('PLAYER_A_WIN');
    expect(afterReport?.status).toBe('ROUND_ACTIVE');
    await app.close();
  });
});
