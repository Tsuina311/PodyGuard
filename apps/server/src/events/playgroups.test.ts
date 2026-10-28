import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { createIdentityBoundary } from '../identity/index.js';
import { EventService } from './event-service.js';
import { MemoryEventStore } from './memory-event-store.js';

const MULDROTHA = {
  oracleId: 'oracle-muldrotha',
  cardId: 'card-muldrotha',
  name: 'Muldrotha, the Gravetide',
  artCropUri: 'https://cards.scryfall.io/art_crop/front/m/u/muldrotha.jpg',
  typeLine: 'Legendary Creature — Elemental Avatar',
  oracleText: 'During each of your turns, you may play a permanent card of each permanent type from your graveyard.',
  keywords: [],
};

const GIADA = {
  oracleId: 'oracle-giada',
  cardId: 'card-giada',
  name: 'Giada, Font of Hope',
  artCropUri: 'https://cards.scryfall.io/art_crop/front/g/i/giada.jpg',
  typeLine: 'Legendary Creature — Angel',
  oracleText: 'Flying, vigilance',
  keywords: ['Flying', 'Vigilance'],
};

const ATRAXA = {
  oracleId: 'oracle-atraxa',
  cardId: 'card-atraxa',
  name: "Atraxa, Praetors' Voice",
  artCropUri: 'https://cards.scryfall.io/art_crop/front/a/t/atraxa.jpg',
  typeLine: 'Legendary Creature — Phyrexian Angel Horror',
  oracleText: 'Flying, vigilance, deathtouch, lifelink',
  keywords: ['Flying', 'Vigilance', 'Deathtouch', 'Lifelink'],
};

const MEREN = {
  oracleId: 'oracle-meren',
  cardId: 'card-meren',
  name: 'Meren of Clan Nel Toth',
  artCropUri: 'https://cards.scryfall.io/art_crop/front/m/e/meren.jpg',
  typeLine: 'Legendary Creature — Human Shaman',
  oracleText: 'Whenever another creature you control dies, you get an experience counter.',
  keywords: [],
};

describe('persistent identity, playgroups, saved guests, and game history', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    const store = new MemoryEventStore();
    const identity = createIdentityBoundary({
      participantSessionSecret: 'test-secret-for-playgroups',
      resolveEventOwnerUserId: async (eventId) => {
        const event = await store.findEventById(eventId);
        return event?.ownerUserId ?? null;
      },
    });
    const events = new EventService(store, identity, { isDev: true });
    app = await buildApp({
      identity,
      events,
      feedbackTransport: null,
      logger: false,
      serveWeb: false,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  async function loginHost(email: string, displayName: string) {
    const startRes = await app.inject({
      method: 'POST',
      url: '/auth/email/start',
      payload: { email, displayName },
    });
    expect(startRes.statusCode).toBe(200);
    const { devCode } = startRes.json<{ devCode: string }>();
    expect(devCode).toMatch(/^\d{6}$/);

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/auth/email/verify',
      payload: { email, code: devCode, displayName },
    });
    expect(verifyRes.statusCode).toBe(200);
    return verifyRes.json<{
      account: { id: string; displayName: string; email: string };
      token: string;
    }>();
  }

  describe('TESTS — AUTH', () => {
    it('user can access own playgroup and cannot access another user playgroup', async () => {
      const hostA = await loginHost('host-a@example.com', 'Host A');
      const hostB = await loginHost('host-b@example.com', 'Host B');

      const createPg = await app.inject({
        method: 'POST',
        url: '/playgroups',
        headers: { authorization: `Bearer ${hostA.token}` },
        payload: { name: 'Friday Friends' },
      });
      expect(createPg.statusCode).toBe(201);
      const { playgroup } = createPg.json<{ playgroup: { id: string; name: string } }>();

      const ownRead = await app.inject({
        method: 'GET',
        url: `/playgroups/${playgroup.id}`,
        headers: { authorization: `Bearer ${hostA.token}` },
      });
      expect(ownRead.statusCode).toBe(200);
      expect(ownRead.json().overview.playgroup.name).toBe('Friday Friends');

      const otherRead = await app.inject({
        method: 'GET',
        url: `/playgroups/${playgroup.id}`,
        headers: { authorization: `Bearer ${hostB.token}` },
      });
      expect(otherRead.statusCode).toBe(403);

      const otherMutate = await app.inject({
        method: 'POST',
        url: `/playgroups/${playgroup.id}/guests`,
        headers: { authorization: `Bearer ${hostB.token}` },
        payload: { displayName: 'Intruder' },
      });
      expect(otherMutate.statusCode).toBe(403);
    });

    it('guest cannot call host playgroup APIs and account session does not replace participant authorization', async () => {
      const host = await loginHost('host@example.com', 'Host');
      const pgRes = await app.inject({
        method: 'POST',
        url: '/playgroups',
        headers: { authorization: `Bearer ${host.token}` },
        payload: { name: 'Friday Friends' },
      });
      const playgroupId = pgRes.json().playgroup.id as string;

      const eventRes = await app.inject({
        method: 'POST',
        url: '/events',
        headers: { authorization: `Bearer ${host.token}` },
        payload: {
          name: 'Commander Night',
          hostPin: '1234',
          tableCount: 2,
          playgroupId,
        },
      });
      expect(eventRes.statusCode).toBe(201);
      const { event } = eventRes.json<{ event: { joinCode: string } }>();

      const joinRes = await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/join`,
        payload: {
          displayName: 'GuestOne',
          decks: [{ poolId: 'b3', preference: 'preferred', commanders: [MULDROTHA] }],
        },
      });
      expect(joinRes.statusCode).toBe(201);
      const guestToken = joinRes.json().token as string;

      // Guest token cannot call playgroup APIs
      const guestCallPg = await app.inject({
        method: 'GET',
        url: `/playgroups/${playgroupId}`,
        headers: { authorization: `Bearer ${guestToken}` },
      });
      expect(guestCallPg.statusCode).toBe(401);

      // Account session token cannot be used in place of event participant token
      const accountAsParticipant = await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/ready`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: { ready: true },
      });
      expect(accountAsParticipant.statusCode).toBe(401);
    });

    it('enforces event host ownership for account tokens and playgroup attachment', async () => {
      const hostA = await loginHost('owner@example.com', 'Owner');
      const hostB = await loginHost('other@example.com', 'Other');

      const pgRes = await app.inject({
        method: 'POST',
        url: '/playgroups',
        headers: { authorization: `Bearer ${hostA.token}` },
        payload: { name: 'Owner Group' },
      });
      const playgroupId = pgRes.json().playgroup.id as string;

      // Host B cannot create an event attached to Host A's playgroup
      const hijackEvent = await app.inject({
        method: 'POST',
        url: '/events',
        headers: { authorization: `Bearer ${hostB.token}` },
        payload: {
          name: 'Hijacked',
          hostPin: '1234',
          tableCount: 2,
          playgroupId,
        },
      });
      expect(hijackEvent.statusCode).toBe(403);

      // Host A creates an event
      const eventRes = await app.inject({
        method: 'POST',
        url: '/events',
        headers: { authorization: `Bearer ${hostA.token}` },
        payload: {
          name: 'Legit Event',
          hostPin: '1234',
          tableCount: 2,
          playgroupId,
        },
      });
      expect(eventRes.statusCode).toBe(201);
      const joinCode = eventRes.json().event.joinCode as string;

      // Host A can manage the event using their account token
      const ownerVerify = await app.inject({
        method: 'GET',
        url: `/events/${joinCode}/host`,
        headers: { authorization: `Bearer ${hostA.token}` },
      });
      expect(ownerVerify.statusCode).toBe(200);

      // Host B cannot manage Host A's event using Host B's account token
      const otherVerify = await app.inject({
        method: 'GET',
        url: `/events/${joinCode}/host`,
        headers: { authorization: `Bearer ${hostB.token}` },
      });
      expect(otherVerify.statusCode).toBe(403);
    });
  });

  describe('TESTS — GUESTS & MANUAL SEEDING', () => {
    it('supports manual guest creation, manual Commander seeding, editing/removing commanders, and returning guest join', async () => {
      const host = await loginHost('friday@example.com', 'Friday Host');

      const pgRes = await app.inject({
        method: 'POST',
        url: '/playgroups',
        headers: { authorization: `Bearer ${host.token}` },
        payload: { name: 'Friday Friends' },
      });
      const playgroupId = pgRes.json().playgroup.id as string;

      // Manually add Alex, Marie, Thomas before any game has ever happened
      const alexRes = await app.inject({
        method: 'POST',
        url: `/playgroups/${playgroupId}/guests`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: { displayName: 'Alex' },
      });
      expect(alexRes.statusCode).toBe(201);
      const alex = alexRes.json().guest as { id: string; displayName: string };

      const marieRes = await app.inject({
        method: 'POST',
        url: `/playgroups/${playgroupId}/guests`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: { displayName: 'Marie' },
      });
      const marie = marieRes.json().guest as { id: string; displayName: string };

      const thomasRes = await app.inject({
        method: 'POST',
        url: `/playgroups/${playgroupId}/guests`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: { displayName: 'Thomas' },
      });
      expect(thomasRes.statusCode).toBe(201);

      // Duplicate name within the same playgroup is explicitly rejected unless allowDuplicate is set
      const dupRes = await app.inject({
        method: 'POST',
        url: `/playgroups/${playgroupId}/guests`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: { displayName: 'alex' },
      });
      expect(dupRes.statusCode).toBe(409);
      expect(dupRes.json().error.code).toBe('DUPLICATE_GUEST_NAME');

      // Same name in a different playgroup is allowed
      const secondPg = await app.inject({
        method: 'POST',
        url: '/playgroups',
        headers: { authorization: `Bearer ${host.token}` },
        payload: { name: 'Office Magic' },
      });
      const secondPgAlex = await app.inject({
        method: 'POST',
        url: `/playgroups/${secondPg.json().playgroup.id}/guests`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: { displayName: 'Alex' },
      });
      expect(secondPgAlex.statusCode).toBe(201);
      expect(secondPgAlex.json().guest.id).not.toBe(alex.id);

      // Manually seed Alex's commanders: Muldrotha (B3) and Giada (B2)
      const muldrothaRes = await app.inject({
        method: 'POST',
        url: `/playgroups/${playgroupId}/guests/${alex.id}/decks`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: {
          commanderName: 'Muldrotha, the Gravetide',
          commanders: [MULDROTHA],
          bracket: 3,
          preferred: true,
        },
      });
      expect(muldrothaRes.statusCode).toBe(201);
      const muldrothaDeck = muldrothaRes.json().deck as { id: string; bracket: number };

      const giadaRes = await app.inject({
        method: 'POST',
        url: `/playgroups/${playgroupId}/guests/${alex.id}/decks`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: {
          commanderName: 'Giada, Font of Hope',
          commanders: [GIADA],
          bracket: 2,
        },
      });
      expect(giadaRes.statusCode).toBe(201);
      const giadaDeck = giadaRes.json().deck as { id: string; bracket: number };

      // Manually seed Marie's commander: Atraxa (B4)
      await app.inject({
        method: 'POST',
        url: `/playgroups/${playgroupId}/guests/${marie.id}/decks`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: {
          commanderName: "Atraxa, Praetors' Voice",
          commanders: [ATRAXA],
          bracket: 4,
          preferred: true,
        },
      });

      // Edit Giada deck name and mark preferred, then restore Muldrotha preferred
      const editGiada = await app.inject({
        method: 'PATCH',
        url: `/playgroups/${playgroupId}/guests/${alex.id}/decks/${giadaDeck.id}`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: {
          deckName: 'Giada Angels',
          bracket: 2,
          preferred: true,
        },
      });
      expect(editGiada.statusCode).toBe(200);
      expect(editGiada.json().deck.deckName).toBe('Giada Angels');
      expect(editGiada.json().deck.preferred).toBe(true);

      await app.inject({
        method: 'PATCH',
        url: `/playgroups/${playgroupId}/guests/${alex.id}/decks/${muldrothaDeck.id}`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: { preferred: true },
      });

      // Add a temporary deck and delete it
      const tempDeck = await app.inject({
        method: 'POST',
        url: `/playgroups/${playgroupId}/guests/${alex.id}/decks`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: { commanderName: 'Temp Commander', bracket: 1 },
      });
      const delDeck = await app.inject({
        method: 'DELETE',
        url: `/playgroups/${playgroupId}/guests/${alex.id}/decks/${tempDeck.json().deck.id}`,
        headers: { authorization: `Bearer ${host.token}` },
      });
      expect(delDeck.statusCode).toBe(200);

      // Host creates tonight's Commander event using Friday Friends
      const eventRes = await app.inject({
        method: 'POST',
        url: '/events',
        headers: { authorization: `Bearer ${host.token}` },
        payload: {
          name: 'Friday Commander',
          hostPin: '1234',
          tableCount: 2,
          gameMode: 'commander',
          rulesFormat: 'commander',
          playgroupId,
        },
      });
      expect(eventRes.statusCode).toBe(201);
      const joinCode = eventRes.json().event.joinCode as string;

      // Alex scans QR without an account and sees returning-player suggestions
      const suggestionsRes = await app.inject({
        method: 'GET',
        url: `/events/${joinCode}/join-suggestions`,
      });
      expect(suggestionsRes.statusCode).toBe(200);
      const suggestions = suggestionsRes.json<{
        suggestions: Array<{ id: string; displayName: string }>;
        mode: string;
      }>();
      expect(suggestions.mode).toBe('list');
      expect(suggestions.suggestions.map((s) => s.displayName)).toEqual([
        'Alex',
        'Marie',
        'Thomas',
      ]);

      // Alex selects Alex and immediately sees Muldrotha and Giada
      const alexDecksRes = await app.inject({
        method: 'GET',
        url: `/events/${joinCode}/join-suggestions/${alex.id}/decks`,
      });
      expect(alexDecksRes.statusCode).toBe(200);
      const alexDecks = alexDecksRes.json().decks as Array<{
        id: string;
        commanderName: string;
        bracket: number;
      }>;
      expect(alexDecks.map((d) => `${d.commanderName} · B${d.bracket}`)).toEqual([
        'Muldrotha, the Gravetide · B3',
        'Giada, Font of Hope · B2',
      ]);

      // Alex joins selecting Muldrotha
      const alexJoinRes = await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/join`,
        payload: {
          displayName: 'Alex',
          guestProfileId: alex.id,
          savedDeckProfileId: muldrothaDeck.id,
        },
      });
      expect(alexJoinRes.statusCode).toBe(201);
      const alexJoined = alexJoinRes.json();
      expect(alexJoined.participant.displayName).toBe('Alex');
      expect(alexJoined.participant.decks[0]).toMatchObject({
        poolId: 'b3',
        preference: 'preferred',
      });
      expect(alexJoined.participant.decks[0].commanders[0].name).toBe(
        'Muldrotha, the Gravetide',
      );
      expect(alexJoined.token).toMatch(/^ps1\./);

      // New guest joins normally and opts into rememberMe
      const sarahJoinRes = await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/join`,
        payload: {
          displayName: 'Sarah',
          rememberMe: true,
          decks: [
            {
              name: 'Meren Reanimator',
              poolId: 'b3',
              preference: 'preferred',
              commanders: [MEREN],
            },
          ],
        },
      });
      expect(sarahJoinRes.statusCode).toBe(201);

      // Sarah is now remembered in Friday Friends with her Meren deck
      const overviewAfterJoin = await app.inject({
        method: 'GET',
        url: `/playgroups/${playgroupId}`,
        headers: { authorization: `Bearer ${host.token}` },
      });
      const guestsInPg = overviewAfterJoin.json().overview.guests as Array<{
        guest: { displayName: string };
        savedDecks: Array<{ commanderName: string }>;
      }>;
      const sarahEntry = guestsInPg.find((g) => g.guest.displayName === 'Sarah');
      expect(sarahEntry).toBeDefined();
      expect(sarahEntry?.savedDecks[0]?.commanderName).toBe(
        'Meren of Clan Nel Toth',
      );
    });

    it('does not offer or allow reusing an invalid event config during join', async () => {
      const host = await loginHost('host-filter@example.com', 'Host');
      const pgRes = await app.inject({
        method: 'POST',
        url: '/playgroups',
        headers: { authorization: `Bearer ${host.token}` },
        payload: { name: 'Mixed Group' },
      });
      const playgroupId = pgRes.json().playgroup.id as string;

      const guestRes = await app.inject({
        method: 'POST',
        url: `/playgroups/${playgroupId}/guests`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: { displayName: 'Alex' },
      });
      const guestId = guestRes.json().guest.id as string;

      // Add a classic 60-card normal deck (not a Commander deck)
      const normalDeckRes = await app.inject({
        method: 'POST',
        url: `/playgroups/${playgroupId}/guests/${guestId}/decks`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: {
          format: 'normal',
          deckName: 'Mono Red Burn',
          poolId: 'open',
        },
      });
      const normalDeckId = normalDeckRes.json().deck.id as string;

      // Create a Commander event
      const eventRes = await app.inject({
        method: 'POST',
        url: '/events',
        headers: { authorization: `Bearer ${host.token}` },
        payload: {
          name: 'Commander Only Night',
          hostPin: '1234',
          tableCount: 2,
          gameMode: 'commander',
          rulesFormat: 'commander',
          playgroupId,
        },
      });
      const joinCode = eventRes.json().event.joinCode as string;

      // Saved normal deck is filtered out of Commander event suggestions
      const decksRes = await app.inject({
        method: 'GET',
        url: `/events/${joinCode}/join-suggestions/${guestId}/decks`,
      });
      expect(decksRes.statusCode).toBe(200);
      expect(decksRes.json().decks).toEqual([]);

      // Attempting to force-join with the incompatible savedDeckProfileId is rejected
      const badJoin = await app.inject({
        method: 'POST',
        url: `/events/${joinCode}/join`,
        payload: {
          displayName: 'Alex',
          guestProfileId: guestId,
          savedDeckProfileId: normalDeckId,
        },
      });
      expect(badJoin.statusCode).toBe(400);
    });
  });

  describe('TESTS — HISTORY & DERIVED STATS', () => {
    it('records completed pod games idempotently, preserves history when renaming guest, and supports games without a winner', async () => {
      const host = await loginHost('history@example.com', 'Host');
      const pgRes = await app.inject({
        method: 'POST',
        url: '/playgroups',
        headers: { authorization: `Bearer ${host.token}` },
        payload: { name: 'Friday Friends' },
      });
      const playgroupId = pgRes.json().playgroup.id as string;

      const alexIds = await app.inject({
        method: 'POST',
        url: `/playgroups/${playgroupId}/guests`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: { displayName: 'Alex' },
      });
      const alexId = alexIds.json().guest.id as string;

      const marieIds = await app.inject({
        method: 'POST',
        url: `/playgroups/${playgroupId}/guests`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: { displayName: 'Marie' },
      });
      const marieId = marieIds.json().guest.id as string;

      const thomasIds = await app.inject({
        method: 'POST',
        url: `/playgroups/${playgroupId}/guests`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: { displayName: 'Thomas' },
      });
      const thomasId = thomasIds.json().guest.id as string;

      const muldrothaRes = await app.inject({
        method: 'POST',
        url: `/playgroups/${playgroupId}/guests/${alexId}/decks`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: {
          commanderName: 'Muldrotha, the Gravetide',
          commanders: [MULDROTHA],
          bracket: 3,
          preferred: true,
        },
      });
      const muldrothaId = muldrothaRes.json().deck.id as string;

      const eventRes = await app.inject({
        method: 'POST',
        url: '/events',
        headers: { authorization: `Bearer ${host.token}` },
        payload: {
          name: 'Commander Night',
          hostPin: '1234',
          tableCount: 2,
          gameMode: 'commander',
          rulesFormat: 'commander',
          preferredPodSize: 3,
          playgroupId,
        },
      });
      const { event, hostToken } = eventRes.json<{
        event: { joinCode: string };
        hostToken: string;
      }>();

      // Join 3 players
      const jAlex = await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/join`,
        payload: {
          displayName: 'Alex',
          guestProfileId: alexId,
          savedDeckProfileId: muldrothaId,
        },
      });
      const jMarie = await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/join`,
        payload: {
          displayName: 'Marie',
          guestProfileId: marieId,
          decks: [{ poolId: 'b3', preference: 'preferred', commanders: [ATRAXA] }],
        },
      });
      const jThomas = await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/join`,
        payload: {
          displayName: 'Thomas',
          guestProfileId: thomasId,
          decks: [{ poolId: 'b3', preference: 'preferred', commanders: [GIADA] }],
        },
      });

      for (const j of [jAlex, jMarie, jThomas]) {
        await app.inject({
          method: 'POST',
          url: `/events/${event.joinCode}/ready`,
          headers: { authorization: `Bearer ${j.json().token}` },
          payload: { ready: true },
        });
      }

      // Match & start table
      await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/match`,
        headers: { authorization: `Bearer ${hostToken}` },
      });
      const tablesRes = await app.inject({
        method: 'GET',
        url: `/events/${event.joinCode}/tables`,
      });
      const occupiedTable = tablesRes
        .json()
        .tables.find((t: { podStatus?: string }) => t.podStatus === 'formed');
      await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/tables/${occupiedTable.id}/start`,
        headers: { authorization: `Bearer ${hostToken}` },
      });

      // Alex reports win; retry does not duplicate
      const res1 = await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/result`,
        headers: { authorization: `Bearer ${jAlex.json().token}` },
        payload: {
          winnerParticipantId: jAlex.json().participant.id,
          durationSeconds: 2400,
        },
      });
      expect(res1.statusCode).toBe(200);

      // Retry same result call (player is already requeued, must not create a second record)
      const resRetry = await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/result`,
        headers: { authorization: `Bearer ${jAlex.json().token}` },
        payload: {
          winnerParticipantId: jAlex.json().participant.id,
          durationSeconds: 2400,
        },
      });
      expect(resRetry.statusCode).toBe(200);

      // Play a second game finished by the host without a recorded winner
      await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/match`,
        headers: { authorization: `Bearer ${hostToken}` },
      });
      await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/tables/${occupiedTable.id}/start`,
        headers: { authorization: `Bearer ${hostToken}` },
      });
      const finishNoWinner = await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/tables/${occupiedTable.id}/finish`,
        headers: { authorization: `Bearer ${hostToken}` },
      });
      expect(finishNoWinner.statusCode).toBe(200);

      // Rename Alex to Alexander — historical snapshot remains 'Alex' while stats stay linked
      await app.inject({
        method: 'PATCH',
        url: `/playgroups/${playgroupId}/guests/${alexId}`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: { displayName: 'Alexander' },
      });

      const overviewRes = await app.inject({
        method: 'GET',
        url: `/playgroups/${playgroupId}`,
        headers: { authorization: `Bearer ${host.token}` },
      });
      expect(overviewRes.statusCode).toBe(200);
      const overview = overviewRes.json().overview;
      expect(overview.recordedGamesCount).toBe(2);

      // Historical snapshot still retains 'Alex'
      const firstGameAlexSnapshot = overview.recentGames[1].participants.find(
        (p: { guestProfileId: string }) => p.guestProfileId === alexId,
      );
      expect(firstGameAlexSnapshot.displayNameSnapshot).toBe('Alex');

      const alexOverview = overview.guests.find(
        (g: { guest: { id: string } }) => g.guest.id === alexId,
      );
      expect(alexOverview.guest.displayName).toBe('Alexander');
      expect(alexOverview.stats.gamesPlayed).toBe(2);
      expect(alexOverview.stats.wins).toBe(1);
      expect(alexOverview.stats.completedNoWinner).toBe(1);
      expect(alexOverview.stats.mostUsedCommanders[0]).toMatchObject({
        commanderName: 'Muldrotha, the Gravetide',
        games: 2,
        wins: 1,
      });
    });

    it('supports duel draw and result correction updating derived stats in ROUNDS mode, and multiplayer placements in local games', async () => {
      const host = await loginHost('rounds-host@example.com', 'Host');
      const pgRes = await app.inject({
        method: 'POST',
        url: '/playgroups',
        headers: { authorization: `Bearer ${host.token}` },
        payload: { name: 'Duel Group' },
      });
      const playgroupId = pgRes.json().playgroup.id as string;

      const gA = (
        await app.inject({
          method: 'POST',
          url: `/playgroups/${playgroupId}/guests`,
          headers: { authorization: `Bearer ${host.token}` },
          payload: { displayName: 'Alex' },
        })
      ).json().guest.id as string;

      const gB = (
        await app.inject({
          method: 'POST',
          url: `/playgroups/${playgroupId}/guests`,
          headers: { authorization: `Bearer ${host.token}` },
          payload: { displayName: 'Marie' },
        })
      ).json().guest.id as string;

      const eventRes = await app.inject({
        method: 'POST',
        url: '/events',
        headers: { authorization: `Bearer ${host.token}` },
        payload: {
          name: 'Duel Rounds',
          hostPin: '1234',
          tableCount: 2,
          gameMode: 'duel',
          rulesFormat: 'normal',
          operationMode: 'ROUNDS',
          playgroupId,
        },
      });
      const { event, hostToken } = eventRes.json<{
        event: { joinCode: string };
        hostToken: string;
      }>();

      await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/join`,
        payload: {
          displayName: 'Alex',
          guestProfileId: gA,
          decks: [{ poolId: 'open', preference: 'preferred' }],
        },
      });
      await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/join`,
        payload: {
          displayName: 'Marie',
          guestProfileId: gB,
          decks: [{ poolId: 'open', preference: 'preferred' }],
        },
      });

      const gen = await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/rounds/generate`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: {},
      });
      const v1 = gen.json().event.rounds.rounds[0].version as number;

      const pub = await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/rounds/publish`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: { expectedVersion: v1 },
      });
      const v2 = pub.json().event.rounds.rounds[0].version as number;

      const started = await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/rounds/start`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: { expectedVersion: v2 },
      });
      const round = started.json().event.rounds.rounds[0];
      const assignmentId = round.assignments[0].id as string;

      // Report DRAW
      const drawRes = await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/rounds/assignments/${assignmentId}/result`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: {
          expectedVersion: round.version,
          outcome: 'DRAW',
          playerAGameWins: 1,
          playerBGameWins: 1,
        },
      });
      expect(drawRes.statusCode).toBe(200);

      let overview = (
        await app.inject({
          method: 'GET',
          url: `/playgroups/${playgroupId}`,
          headers: { authorization: `Bearer ${host.token}` },
        })
      ).json().overview;
      expect(overview.recordedGamesCount).toBe(1);
      const alexBefore = overview.guests.find(
        (g: { guest: { id: string } }) => g.guest.id === gA,
      );
      expect(alexBefore.stats.draws).toBe(1);
      expect(alexBefore.stats.wins).toBe(0);

      // Complete round 1, then correct round 1 assignment to PLAYER_A_WIN
      const vAfterDraw = drawRes.json().event.rounds.rounds[0].version as number;
      const completed = await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/rounds/complete`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: { expectedVersion: vAfterDraw },
      });
      const vCompleted = completed.json().event.rounds.rounds[0].version as number;

      const corrected = await app.inject({
        method: 'POST',
        url: `/events/${event.joinCode}/rounds/assignments/${assignmentId}/correct`,
        headers: { authorization: `Bearer ${hostToken}` },
        payload: {
          expectedVersion: vCompleted,
          roundNumber: 1,
          assignmentId,
          outcome: 'PLAYER_A_WIN',
          playerAGameWins: 2,
          playerBGameWins: 1,
          reason: 'Scorecard correction',
        },
      });
      expect(corrected.statusCode).toBe(200);

      overview = (
        await app.inject({
          method: 'GET',
          url: `/playgroups/${playgroupId}`,
          headers: { authorization: `Bearer ${host.token}` },
        })
      ).json().overview;
      // Still 1 game record (updated in place, not duplicated!)
      expect(overview.recordedGamesCount).toBe(1);
      const alexAfter = overview.guests.find(
        (g: { guest: { id: string } }) => g.guest.id === gA,
      );
      const marieAfter = overview.guests.find(
        (g: { guest: { id: string } }) => g.guest.id === gB,
      );
      expect(alexAfter.stats.draws).toBe(0);
      expect(alexAfter.stats.wins + marieAfter.stats.wins).toBe(1);
      expect(alexAfter.stats.losses + marieAfter.stats.losses).toBe(1);

      // Also record a local multiplayer game with placements
      const localGame = await app.inject({
        method: 'POST',
        url: `/playgroups/${playgroupId}/games`,
        headers: { authorization: `Bearer ${host.token}` },
        payload: {
          clientGameId: 'local-game-1',
          gameMode: 'commander',
          rulesFormat: 'commander',
          poolId: 'b3',
          durationSeconds: 1800,
          seats: [
            {
              guestProfileId: gA,
              displayName: 'Alex',
              commanderName: 'Muldrotha, the Gravetide',
              bracket: 3,
              resultType: 'WIN',
              placement: 1,
            },
            {
              guestProfileId: gB,
              displayName: 'Marie',
              commanderName: "Atraxa, Praetors' Voice",
              bracket: 4,
              resultType: 'LOSS',
              placement: 2,
            },
          ],
        },
      });
      expect(localGame.statusCode).toBe(201);
      expect(localGame.json().gameRecord.participants[0].placement).toBe(1);
      expect(localGame.json().gameRecord.participants[1].placement).toBe(2);
    });
  });

  describe('TESTS — PRIVACY', () => {
    it('prevents enumerating roster when suggestions are disabled, hides guest history/account IDs from public display, and isolates guest deck lookups', async () => {
      const hostA = await loginHost('privacy-a@example.com', 'Host A');
      const pgARes = await app.inject({
        method: 'POST',
        url: '/playgroups',
        headers: { authorization: `Bearer ${hostA.token}` },
        payload: { name: 'Private Group A' },
      });
      const pgAId = pgARes.json().playgroup.id as string;

      const alexRes = await app.inject({
        method: 'POST',
        url: `/playgroups/${pgAId}/guests`,
        headers: { authorization: `Bearer ${hostA.token}` },
        payload: { displayName: 'Alex' },
      });
      const alexId = alexRes.json().guest.id as string;

      await app.inject({
        method: 'POST',
        url: `/playgroups/${pgAId}/guests/${alexId}/decks`,
        headers: { authorization: `Bearer ${hostA.token}` },
        payload: {
          commanderName: 'Muldrotha, the Gravetide',
          commanders: [MULDROTHA],
          bracket: 3,
        },
      });

      // Another playgroup with its own guest
      const hostB = await loginHost('privacy-b@example.com', 'Host B');
      const pgBRes = await app.inject({
        method: 'POST',
        url: '/playgroups',
        headers: { authorization: `Bearer ${hostB.token}` },
        payload: { name: 'Private Group B' },
      });
      const pgBId = pgBRes.json().playgroup.id as string;
      const secretGuestRes = await app.inject({
        method: 'POST',
        url: `/playgroups/${pgBId}/guests`,
        headers: { authorization: `Bearer ${hostB.token}` },
        payload: { displayName: 'SecretBob' },
      });
      const secretBobId = secretGuestRes.json().guest.id as string;

      // Create Event A for Playgroup A
      const eventARes = await app.inject({
        method: 'POST',
        url: '/events',
        headers: { authorization: `Bearer ${hostA.token}` },
        payload: {
          name: 'Event A',
          hostPin: '1234',
          tableCount: 2,
          playgroupId: pgAId,
        },
      });
      const { event: eventA, hostToken: hostAToken } = eventARes.json<{
        event: { joinCode: string };
        hostToken: string;
      }>();

      // Cannot fetch SecretBob's decks through Event A's join-suggestions endpoint
      const crossPlaygroupLookup = await app.inject({
        method: 'GET',
        url: `/events/${eventA.joinCode}/join-suggestions/${secretBobId}/decks`,
      });
      expect(crossPlaygroupLookup.statusCode).toBe(404);

      // Suggestions projection contains ONLY id and displayName (no playgroupId, linkedUserAccountId, or stats)
      const sugRes = await app.inject({
        method: 'GET',
        url: `/events/${eventA.joinCode}/join-suggestions`,
      });
      expect(Object.keys(sugRes.json().suggestions[0]).sort()).toEqual([
        'displayName',
        'id',
      ]);

      // Disable returning-player suggestions for LGS privacy
      await app.inject({
        method: 'PATCH',
        url: `/events/${eventA.joinCode}/settings`,
        headers: { authorization: `Bearer ${hostAToken}` },
        payload: { showReturningPlayerSuggestions: false },
      });

      const disabledSugRes = await app.inject({
        method: 'GET',
        url: `/events/${eventA.joinCode}/join-suggestions`,
      });
      expect(disabledSugRes.json().suggestions).toEqual([]);
      expect(disabledSugRes.json().mode).toBe('none');

      const disabledDeckLookup = await app.inject({
        method: 'GET',
        url: `/events/${eventA.joinCode}/join-suggestions/${alexId}/decks`,
      });
      expect(disabledDeckLookup.statusCode).toBe(404);

      // Re-enable suggestions and have Alex join, then inspect public display projection
      await app.inject({
        method: 'PATCH',
        url: `/events/${eventA.joinCode}/settings`,
        headers: { authorization: `Bearer ${hostAToken}` },
        payload: { showReturningPlayerSuggestions: true },
      });

      await app.inject({
        method: 'POST',
        url: `/events/${eventA.joinCode}/join`,
        headers: { authorization: `Bearer ${hostA.token}` },
        payload: {
          displayName: 'Alex',
          guestProfileId: alexId,
          decks: [{ poolId: 'b3', preference: 'preferred', commanders: [MULDROTHA] }],
        },
      });

      // Pair and claim public display
      const pairRes = await app.inject({
        method: 'POST',
        url: '/displays/pair',
      });
      const { sessionId, pairingCode } = pairRes.json<{
        sessionId: string;
        pairingCode: string;
      }>();
      await app.inject({
        method: 'POST',
        url: `/events/${eventA.joinCode}/displays/approve`,
        headers: { authorization: `Bearer ${hostAToken}` },
        payload: { pairingCode, label: 'Main TV' },
      });
      const claimRes = await app.inject({
        method: 'POST',
        url: `/displays/pair/${sessionId}/claim`,
      });
      const displayToken = claimRes.json().token as string;

      const displayStateRes = await app.inject({
        method: 'GET',
        url: '/displays/state',
        headers: { authorization: `Bearer ${displayToken}` },
      });
      expect(displayStateRes.statusCode).toBe(200);
      const rawDisplayJson = displayStateRes.body;
      expect(rawDisplayJson).not.toContain(hostA.account.id);
      expect(rawDisplayJson).not.toContain(alexId);
      expect(rawDisplayJson).not.toContain(pgAId);
      expect(rawDisplayJson).not.toContain('ownerUserId');
      expect(rawDisplayJson).not.toContain('guestProfileId');
    });
  });
});
