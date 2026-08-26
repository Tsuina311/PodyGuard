import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { EventService } from '../events/event-service.js';
import { MemoryEventStore } from '../events/memory-event-store.js';
import { createIdentityBoundary } from '../identity/index.js';

async function buildTestApp(isDev = true) {
  const identity = createIdentityBoundary({
    participantSessionSecret: 'test-secret',
  });
  const events = new EventService(new MemoryEventStore(), identity, { isDev });
  return buildApp({ identity, events, logger: false });
}

describe('event HTTP api', () => {
  it('creates an event, joins as a guest, and unlocks the host with the PIN', async () => {
    const app = await buildTestApp();

    const created = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { name: 'Friday Commander', hostPin: '2468', tableCount: 8 },
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json() as {
      event: { joinCode: string; name: string; status: string };
      hostToken: string;
    };
    expect(createdBody.event.name).toBe('Friday Commander');
    expect(createdBody.event.status).toBe('open');
    expect(createdBody.hostToken.length).toBeGreaterThan(8);
    const { joinCode } = createdBody.event;

    const tables = await app.inject({
      method: 'GET',
      url: `/events/${joinCode}/tables`,
    });
    expect(tables.statusCode).toBe(200);
    expect(tables.json()).toMatchObject({
      tables: Array.from({ length: 8 }, (_, index) => ({
        label: `Table ${index + 1}`,
        status: 'free',
      })),
    });

    const fetched = await app.inject({
      method: 'GET',
      url: `/events/${joinCode.toLowerCase()}`,
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toMatchObject({ name: 'Friday Commander', joinCode });

    const joined = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/join`,
      payload: { displayName: 'Alex' },
    });
    expect(joined.statusCode).toBe(201);
    const joinedBody = joined.json() as {
      participant: { displayName: string };
      token: string;
    };
    expect(joinedBody.participant.displayName).toBe('Alex');
    expect(joinedBody.token.startsWith('ps1.')).toBe(true);

    const roster = await app.inject({
      method: 'GET',
      url: `/events/${joinCode}/participants`,
    });
    expect(roster.json()).toMatchObject({
      participants: [{ displayName: 'Alex' }],
    });

    const badPin = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/host`,
      payload: { hostPin: '0000' },
    });
    expect(badPin.statusCode).toBe(401);

    const host = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/host`,
      payload: { hostPin: '2468' },
    });
    expect(host.statusCode).toBe(200);
    const hostBody = host.json() as { hostToken: string };
    expect(hostBody.hostToken.startsWith('hs1.')).toBe(true);

    const resume = await app.inject({
      method: 'GET',
      url: `/events/${joinCode}/host`,
      headers: { authorization: `Bearer ${hostBody.hostToken}` },
    });
    expect(resume.statusCode).toBe(200);

    await app.close();
  });

  it('rejects an unknown join code', async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/events/ZZZZZZ',
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it('rejects creating an event without a table count', async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { name: 'Friday Commander', hostPin: '2468' },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('lets a guest mark ready and a host disable a table', async () => {
    const app = await buildTestApp();

    const created = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { name: 'Friday Commander', hostPin: '2468', tableCount: 2 },
    });
    const createdBody = created.json() as {
      event: { joinCode: string };
      hostToken: string;
    };
    const { joinCode } = createdBody.event;
    const { hostToken } = createdBody;

    const joined = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/join`,
      payload: { displayName: 'Alex' },
    });
    const joinedBody = joined.json() as { token: string };

    const ready = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/ready`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
      payload: { ready: true },
    });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      participant: { displayName: 'Alex', status: 'ready' },
    });

    const me = await app.inject({
      method: 'GET',
      url: `/events/${joinCode}/me`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
    });
    expect(me.json()).toMatchObject({
      participant: { status: 'ready' },
    });

    const listedBefore = await app.inject({
      method: 'GET',
      url: `/events/${joinCode}/tables`,
    });
    const tableBody = listedBefore.json() as {
      tables: Array<{ id: string; label: string; status: string }>;
    };
    expect(tableBody.tables).toHaveLength(2);
    expect(tableBody.tables[0]?.label).toBe('Table 1');

    const disabled = await app.inject({
      method: 'PATCH',
      url: `/events/${joinCode}/tables/${tableBody.tables[0]?.id}`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { status: 'disabled' },
    });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json()).toMatchObject({
      table: { status: 'disabled' },
    });

    const listed = await app.inject({
      method: 'GET',
      url: `/events/${joinCode}/tables`,
    });
    expect(listed.json()).toMatchObject({
      tables: [{ status: 'disabled' }, { status: 'free' }],
    });

    await app.close();
  });

  it('matches ready players onto free tables and fills remaining seats with bots', async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { name: 'Friday Commander', hostPin: '2468', tableCount: 2 },
    });
    const createdBody = created.json() as {
      event: { joinCode: string };
      hostToken: string;
    };
    const { joinCode } = createdBody.event;
    const { hostToken } = createdBody;

    const names = ['Alex', 'Blair', 'Casey', 'Drew'];
    for (const displayName of names) {
      const joined = await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/join`,
        payload: { displayName },
      });
      const joinedBody = joined.json() as { token: string };
      await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/ready`,
        headers: { authorization: `Bearer ${joinedBody.token}` },
        payload: { ready: true },
      });
    }

    const matched = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/match`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    expect(matched.statusCode).toBe(200);
    const matchedBody = matched.json() as {
      pods: Array<{ tableLabel: string; playerNames: string[] }>;
    };
    expect(matchedBody.pods).toHaveLength(1);
    expect(matchedBody.pods[0]?.playerNames).toHaveLength(4);

    const filled = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/dev/fill-bots`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    expect(filled.statusCode).toBe(200);
    const filledBody = filled.json() as {
      botsAdded: number;
      pods: Array<{ playerNames: string[] }>;
    };
    expect(filledBody.botsAdded).toBe(4);
    expect(filledBody.pods).toHaveLength(1);
    expect(filledBody.pods[0]?.playerNames).toHaveLength(4);

    const listed = await app.inject({
      method: 'GET',
      url: `/events/${joinCode}/tables`,
    });
    const tableBody = listed.json() as {
      tables: Array<{ status: string; seatedNames: string[] }>;
    };
    expect(tableBody.tables.every((table) => table.status === 'occupied')).toBe(
      true,
    );
    expect(tableBody.tables[1]?.seatedNames.every((name) => name.length > 0)).toBe(
      true,
    );

    await app.close();
  });

  it('rejects bot fill outside development', async () => {
    const app = await buildTestApp(false);
    const created = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { name: 'Friday Commander', hostPin: '2468', tableCount: 1 },
    });
    const createdBody = created.json() as {
      event: { joinCode: string };
      hostToken: string;
    };
    const denied = await app.inject({
      method: 'POST',
      url: `/events/${createdBody.event.joinCode}/dev/fill-bots`,
      headers: { authorization: `Bearer ${createdBody.hostToken}` },
    });
    expect(denied.statusCode).toBe(403);
    await app.close();
  });

  it('records tracker use and lets a player finish and requeue the pod', async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { name: 'Friday Commander', hostPin: '2468', tableCount: 1 },
    });
    const createdBody = created.json() as {
      event: { joinCode: string };
      hostToken: string;
    };
    const { joinCode } = createdBody.event;
    const { hostToken } = createdBody;

    const joined = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/join`,
      payload: { displayName: 'Alex' },
    });
    const joinedBody = joined.json() as {
      token: string;
      participant: { id: string };
    };
    await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/ready`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
      payload: { ready: true },
    });

    const filled = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/dev/fill-bots`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    expect(filled.statusCode).toBe(200);

    const tables = await app.inject({
      method: 'GET',
      url: `/events/${joinCode}/tables`,
    });
    const tableBody = tables.json() as {
      tables: Array<{ id: string; podStatus?: string; status: string }>;
    };
    const table = tableBody.tables[0];
    expect(table?.status).toBe('occupied');
    expect(table?.podStatus).toBe('formed');

    const started = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/tables/${table?.id}/start`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    expect(started.statusCode).toBe(200);
    expect(started.json()).toMatchObject({
      table: { status: 'occupied', podStatus: 'playing' },
    });

    const mePlaying = await app.inject({
      method: 'GET',
      url: `/events/${joinCode}/me`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
    });
    expect(mePlaying.json()).toMatchObject({
      participant: { status: 'playing', tableLabel: 'Table 1' },
    });

    const choseTracker = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/tracker-choice`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
      payload: { trackerUsed: true },
    });
    expect(choseTracker.statusCode).toBe(200);
    expect(choseTracker.json()).toMatchObject({
      participant: { status: 'playing', trackerUsed: true },
    });
    const cannotEraseUse = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/tracker-choice`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
      payload: { trackerUsed: false },
    });
    expect(cannotEraseUse.json()).toMatchObject({
      participant: { trackerUsed: true },
    });

    const automaticChallenge = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/challenges/centurion/complete`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
      payload: {
        targetParticipantId: joinedBody.participant.id,
        source: 'automatic',
      },
    });
    expect(automaticChallenge.statusCode).toBe(200);
    expect(automaticChallenge.json()).toMatchObject({
      created: true,
      completion: { challengeId: 'centurion', points: 5 },
    });
    const duplicateChallenge = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/challenges/centurion/complete`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
      payload: {
        targetParticipantId: joinedBody.participant.id,
        source: 'automatic',
      },
    });
    expect(duplicateChallenge.json()).toMatchObject({ created: false });

    const unconfirmedChallenge = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/challenges/double-kill/complete`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
      payload: {
        targetParticipantId: joinedBody.participant.id,
        source: 'confirmation',
      },
    });
    expect(unconfirmedChallenge.statusCode).toBe(400);
    const confirmedChallenge = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/challenges/double-kill/complete`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
      payload: {
        targetParticipantId: joinedBody.participant.id,
        source: 'confirmation',
        confirmed: true,
      },
    });
    expect(confirmedChallenge.json()).toMatchObject({
      created: true,
      completion: { points: 5 },
    });
    const manualChallenge = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/challenges/alternate-destiny/complete`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
      payload: {
        targetParticipantId: joinedBody.participant.id,
        source: 'manual',
      },
    });
    expect(manualChallenge.json()).toMatchObject({
      created: true,
      completion: { points: 4 },
    });
    const challengeScore = await app.inject({
      method: 'GET',
      url: `/events/${joinCode}/me`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
    });
    expect(challengeScore.json()).toMatchObject({
      participant: {
        challengePoints: 14,
        flexCredits: 0,
        challengeCompletions: [
          { challengeId: 'centurion' },
          { challengeId: 'double-kill' },
          { challengeId: 'alternate-destiny' },
        ],
      },
    });

    const invalidResult = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/result`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
      payload: {
        winnerParticipantId: '00000000-0000-0000-0000-000000000000',
        durationSeconds: 4_321,
      },
    });
    expect(invalidResult.statusCode).toBe(400);

    const result = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/result`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
      payload: {
        winnerParticipantId: joinedBody.participant.id,
        durationSeconds: 4_321,
      },
    });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({
      participant: { status: 'ready' },
    });

    const meAfter = await app.inject({
      method: 'GET',
      url: `/events/${joinCode}/me`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
    });
    expect(meAfter.json()).toMatchObject({
      participant: { status: 'ready' },
    });
    expect(
      (meAfter.json() as { participant: { tableLabel?: string } }).participant
        .tableLabel,
    ).toBeUndefined();

    const freed = await app.inject({
      method: 'GET',
      url: `/events/${joinCode}/tables`,
    });
    expect(freed.json()).toMatchObject({
      tables: [{ status: 'free', seatedNames: [] }],
    });

    await app.close();
  });

  it('lets a player pause and leave the queue', async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { name: 'Friday Commander', hostPin: '2468', tableCount: 1 },
    });
    const createdBody = created.json() as { event: { joinCode: string } };
    const { joinCode } = createdBody.event;

    const joined = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/join`,
      payload: { displayName: 'Alex' },
    });
    const token = (joined.json() as { token: string }).token;

    await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/ready`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ready: true },
    });

    const paused = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/pause`,
      headers: { authorization: `Bearer ${token}` },
      payload: { paused: true },
    });
    expect(paused.statusCode).toBe(200);
    expect(paused.json()).toMatchObject({
      participant: { status: 'paused' },
    });

    const resumed = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/pause`,
      headers: { authorization: `Bearer ${token}` },
      payload: { paused: false },
    });
    expect(resumed.json()).toMatchObject({
      participant: { status: 'joined' },
    });

    const left = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/leave`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(left.statusCode).toBe(200);
    expect(left.json()).toMatchObject({
      participant: { status: 'left' },
    });

    await app.close();
  });

  it('keeps same-pool pods and lets a player update decks', async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { name: 'Friday Commander', hostPin: '2468', tableCount: 2 },
    });
    const createdBody = created.json() as {
      event: { joinCode: string };
      hostToken: string;
    };
    const { joinCode } = createdBody.event;
    const { hostToken } = createdBody;

    async function joinReady(
      displayName: string,
      poolId: string,
    ): Promise<string> {
      const joined = await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/join`,
        payload: {
          displayName,
          decks: [{ poolId, preference: 'preferred' }],
        },
      });
      const token = (joined.json() as { token: string }).token;
      await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: { ready: true },
      });
      return token;
    }

    await joinReady('A1', 'b2');
    await joinReady('A2', 'b2');
    await joinReady('A3', 'b2');
    await joinReady('A4', 'b2');
    await joinReady('B1', 'b3');
    await joinReady('B2', 'b3');
    await joinReady('B3', 'b3');
    const last = await joinReady('B4', 'b3');

    const saved = await app.inject({
      method: 'PUT',
      url: `/events/${joinCode}/decks`,
      headers: { authorization: `Bearer ${last}` },
      payload: {
        decks: [
          { poolId: 'b3', preference: 'preferred', name: 'Kinnan' },
          { poolId: 'b2', preference: 'accepted' },
        ],
      },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      participant: {
        decks: [
          { poolId: 'b3', preference: 'preferred', name: 'Kinnan' },
          { poolId: 'b2', preference: 'accepted' },
        ],
      },
    });

    const matched = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/match`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    expect(matched.statusCode).toBe(200);
    const matchedBody = matched.json() as {
      pods: Array<{ poolId: string; playerNames: string[] }>;
    };
    expect(matchedBody.pods).toHaveLength(2);
    expect(new Set(matchedBody.pods.map((row) => row.poolId))).toEqual(
      new Set(['b2', 'b3']),
    );
    for (const pod of matchedBody.pods) {
      expect(pod.playerNames).toHaveLength(4);
    }

    await app.close();
  });

  it('assigns private Treachery roles and never exposes them in the roster', async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/events',
      payload: {
        name: 'Friday Treachery',
        hostPin: '2468',
        tableCount: 1,
        gameMode: 'treachery',
        allowThreePods: true,
      },
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json() as {
      event: {
        joinCode: string;
        gameMode: string;
        allowThreePods: boolean;
      };
      hostToken: string;
    };
    expect(createdBody.event).toMatchObject({
      gameMode: 'treachery',
      allowThreePods: false,
    });
    const tokens: string[] = [];
    for (const displayName of ['Ada', 'Bea', 'Cam', 'Dee']) {
      const joined = await app.inject({
        method: 'POST',
        url: `/events/${createdBody.event.joinCode}/join`,
        payload: { displayName },
      });
      const token = (joined.json() as { token: string }).token;
      tokens.push(token);
      await app.inject({
        method: 'POST',
        url: `/events/${createdBody.event.joinCode}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: { ready: true },
      });
    }
    const matched = await app.inject({
      method: 'POST',
      url: `/events/${createdBody.event.joinCode}/match`,
      headers: { authorization: `Bearer ${createdBody.hostToken}` },
    });
    expect(matched.statusCode).toBe(200);

    const assignments = await Promise.all(
      tokens.map((token) =>
        app.inject({
          method: 'GET',
          url: `/events/${createdBody.event.joinCode}/me/treachery-role`,
          headers: { authorization: `Bearer ${token}` },
        }),
      ),
    );
    expect(assignments.every((response) => response.statusCode === 200)).toBe(
      true,
    );
    const roles = assignments.map(
      (response) =>
        (
          response.json() as {
            assignment: {
              role: string;
              identity: { id: number; role: string; image: string };
              leaderParticipantId: string;
              distribution: Record<string, number>;
            };
          }
        ).assignment,
    );
    expect(roles.map((row) => row.role).sort()).toEqual([
      'assassin',
      'assassin',
      'leader',
      'traitor',
    ]);
    expect(new Set(roles.map((row) => row.leaderParticipantId)).size).toBe(1);
    expect(new Set(roles.map((row) => row.identity.id)).size).toBe(4);
    for (const assignment of roles) {
      expect(assignment.identity.role).toBe(assignment.role);
      expect(assignment.identity.image).toMatch(
        /^\/treachery-identities\/\d{3}\.jpg$/,
      );
    }
    expect(roles[0]?.distribution).toEqual({
      leader: 1,
      guardian: 0,
      assassin: 2,
      traitor: 1,
    });

    const roster = await app.inject({
      method: 'GET',
      url: `/events/${createdBody.event.joinCode}/participants`,
    });
    expect(roster.statusCode).toBe(200);
    expect(roster.body).not.toContain('treacheryRole');
    const publicBeforeUnveil = (
      roster.json() as {
        participants: Array<{
          revealedTreacheryIdentity?: { id: number; role: string };
        }>;
      }
    ).participants.flatMap((row) =>
      row.revealedTreacheryIdentity ? [row.revealedTreacheryIdentity] : [],
    );
    expect(publicBeforeUnveil).toHaveLength(1);
    expect(publicBeforeUnveil[0]?.role).toBe('leader');

    const tables = await app.inject({
      method: 'GET',
      url: `/events/${createdBody.event.joinCode}/tables`,
    });
    const tableId = (
      tables.json() as { tables: Array<{ id: string }> }
    ).tables[0]?.id;
    await app.inject({
      method: 'POST',
      url: `/events/${createdBody.event.joinCode}/tables/${tableId}/start`,
      headers: { authorization: `Bearer ${createdBody.hostToken}` },
    });

    const hiddenIndex = roles.findIndex((assignment) => assignment.role !== 'leader');
    const unveiled = await app.inject({
      method: 'POST',
      url: `/events/${createdBody.event.joinCode}/me/treachery-identity/unveil`,
      headers: { authorization: `Bearer ${tokens[hiddenIndex]}` },
    });
    expect(unveiled.statusCode).toBe(200);
    expect(unveiled.json()).toMatchObject({
      assignment: {
        unveiled: true,
        identity: { id: roles[hiddenIndex]?.identity.id },
      },
    });
    const publicAfterUnveil = await app.inject({
      method: 'GET',
      url: `/events/${createdBody.event.joinCode}/participants`,
    });
    const publicIdentities = (
      publicAfterUnveil.json() as {
        participants: Array<{ revealedTreacheryIdentity?: { id: number } }>;
      }
    ).participants.flatMap((row) =>
      row.revealedTreacheryIdentity ? [row.revealedTreacheryIdentity] : [],
    );
    expect(publicIdentities).toHaveLength(2);
    expect(publicIdentities).toContainEqual({
      id: roles[hiddenIndex]?.identity.id,
      name: expect.any(String),
      role: roles[hiddenIndex]?.role,
      image: roles[hiddenIndex]?.identity.image,
    });

    await app.close();
  });

  it('awards event-local flex credits for a leftover 3-pod', async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { name: 'Friday Commander', hostPin: '2468', tableCount: 2 },
    });
    const createdBody = created.json() as {
      event: { joinCode: string };
      hostToken: string;
    };
    const { joinCode } = createdBody.event;
    const { hostToken } = createdBody;

    for (const displayName of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
      const joined = await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/join`,
        payload: { displayName },
      });
      const token = (joined.json() as { token: string }).token;
      await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: { ready: true },
      });
    }

    const matched = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/match`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    expect(matched.statusCode).toBe(200);

    const roster = await app.inject({
      method: 'GET',
      url: `/events/${joinCode}/participants`,
    });
    const body = roster.json() as {
      participants: Array<{ flexCredits: number; tableLabel?: string }>;
    };
    const seated = body.participants.filter((row) => row.tableLabel);
    expect(seated).toHaveLength(7);
    expect(seated.filter((row) => row.flexCredits === 3)).toHaveLength(3);
    expect(seated.filter((row) => row.flexCredits === 0)).toHaveLength(4);

    await app.close();
  });

  it('seats five players when 5-pods are enabled', async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/events',
      payload: {
        name: 'Friday Commander',
        hostPin: '2468',
        tableCount: 1,
        allowFivePods: true,
      },
    });
    const createdBody = created.json() as {
      event: { joinCode: string; allowFivePods: boolean };
      hostToken: string;
    };
    expect(createdBody.event.allowFivePods).toBe(true);
    const { joinCode } = createdBody.event;
    const { hostToken } = createdBody;

    for (const displayName of ['Ada', 'Bea', 'Cam', 'Drew', 'Eve']) {
      const joined = await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/join`,
        payload: { displayName },
      });
      const token = (joined.json() as { token: string }).token;
      await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: { ready: true },
      });
    }

    const matched = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/match`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    expect(matched.statusCode).toBe(200);
    const matchedBody = matched.json() as {
      pods: Array<{ playerNames: string[] }>;
    };
    expect(matchedBody.pods[0]?.playerNames).toHaveLength(5);

    await app.close();
  });

  it('lets a late arrival join after a table is already seated', async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { name: 'Friday Commander', hostPin: '2468', tableCount: 2 },
    });
    const createdBody = created.json() as {
      event: { joinCode: string };
      hostToken: string;
    };
    const { joinCode } = createdBody.event;
    const { hostToken } = createdBody;

    for (const displayName of ['Ada', 'Bea', 'Cam', 'Drew']) {
      const joined = await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/join`,
        payload: { displayName },
      });
      const token = (joined.json() as { token: string }).token;
      await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/ready`,
        headers: { authorization: `Bearer ${token}` },
        payload: { ready: true },
      });
    }
    await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/match`,
      headers: { authorization: `Bearer ${hostToken}` },
    });

    const late = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/join`,
      payload: { displayName: 'Eve' },
    });
    expect(late.statusCode).toBe(201);
    expect(late.json()).toMatchObject({
      participant: { displayName: 'Eve', status: 'joined' },
    });

    await app.close();
  });

  it('cancels a formed pod and returns players to the ready queue', async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { name: 'Friday Commander', hostPin: '2468', tableCount: 1 },
    });
    const createdBody = created.json() as {
      event: { joinCode: string };
      hostToken: string;
    };
    const { joinCode } = createdBody.event;
    const { hostToken } = createdBody;

    const joined = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/join`,
      payload: { displayName: 'Ada' },
    });
    const token = (joined.json() as { token: string }).token;
    await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/ready`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ready: true },
    });
    await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/dev/fill-bots`,
      headers: { authorization: `Bearer ${hostToken}` },
    });

    const tables = await app.inject({
      method: 'GET',
      url: `/events/${joinCode}/tables`,
    });
    const tableId = (
      tables.json() as { tables: Array<{ id: string }> }
    ).tables[0]?.id;

    const cancelled = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/tables/${tableId}/cancel`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toMatchObject({
      table: { status: 'free', seatedNames: [] },
    });

    const me = await app.inject({
      method: 'GET',
      url: `/events/${joinCode}/me`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.json()).toMatchObject({
      participant: { status: 'ready' },
    });

    await app.close();
  });

  it('versions a private pack, syncs a repeated result, and never double-seats', async () => {
    const app = await buildTestApp();
    const created = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { name: 'Friday Commander', hostPin: '2468', tableCount: 1 },
    });
    const createdBody = created.json() as {
      event: { joinCode: string };
      hostToken: string;
    };
    const { joinCode } = createdBody.event;
    const { hostToken } = createdBody;

    const copied = await app.inject({
      method: 'PUT',
      url: `/events/${joinCode}/pack`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: { mode: 'copy-official' },
    });
    expect(copied.statusCode).toBe(200);
    const copiedEvent = copied.json() as {
      event: {
        challengePackId: string;
        challengePackVersion: number;
        challengePack: { visibility: string; challenges: unknown[] };
      };
    };
    expect(copiedEvent.event.challengePackId).not.toBe('classic-commander-v1');
    expect(copiedEvent.event.challengePack.visibility).toBe('private');
    expect(copiedEvent.event.challengePackVersion).toBe(1);

    const saved = await app.inject({
      method: 'PUT',
      url: `/events/${joinCode}/pack`,
      headers: { authorization: `Bearer ${hostToken}` },
      payload: {
        mode: 'save',
        pack: {
          ...copiedEvent.event.challengePack,
          name: 'Night pack',
        },
      },
    });
    expect(saved.json()).toMatchObject({
      event: { challengePackVersion: 2, challengePack: { name: 'Night pack' } },
    });

    const joined = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/join`,
      payload: { displayName: 'Alex' },
    });
    const joinedBody = joined.json() as {
      participant: { id: string };
      token: string;
    };
    await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/ready`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
      payload: { ready: true },
    });
    await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/dev/fill-bots`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    const tables = await app.inject({
      method: 'GET',
      url: `/events/${joinCode}/tables`,
    });
    const tableId = (
      tables.json() as { tables: Array<{ id: string; status: string }> }
    ).tables.find((row) => row.status === 'occupied')?.id;
    await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/tables/${tableId}/start`,
      headers: { authorization: `Bearer ${hostToken}` },
    });

    const secondMatch = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/match`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    expect(secondMatch.json()).toMatchObject({ pods: [] });

    const result = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/result`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
      payload: {
        winnerParticipantId: joinedBody.participant.id,
        durationSeconds: 90,
      },
    });
    expect(result.statusCode).toBe(200);

    const replay = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/result`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
      payload: {
        winnerParticipantId: joinedBody.participant.id,
        durationSeconds: 90,
      },
    });
    expect(replay.statusCode).toBe(200);

    const lateChallenge = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/challenges/centurion/complete`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
      payload: {
        targetParticipantId: joinedBody.participant.id,
        source: 'automatic',
      },
    });
    expect(lateChallenge.statusCode).toBe(200);

    const rating = await app.inject({
      method: 'POST',
      url: `/events/${joinCode}/pod-rating`,
      headers: { authorization: `Bearer ${joinedBody.token}` },
      payload: { rating: 4 },
    });
    expect(rating.json()).toMatchObject({ rating: 4, alreadyRecorded: false });

    const metrics = await app.inject({
      method: 'GET',
      url: `/events/${joinCode}/metrics`,
      headers: { authorization: `Bearer ${hostToken}` },
    });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.json()).toMatchObject({
      metrics: {
        games: 1,
        challengeCompletions: 1,
        podRating: { count: 1 },
      },
    });

    await app.close();
  });
});
