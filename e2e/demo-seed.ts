import type { EventService } from '../apps/server/src/events/event-service.js';

/** Only called by the memory-only demo/e2e entrypoint, never production startup. */
export async function seedDemo(events: EventService, email = 'demo@podyguard.example') {
  const auth = await events.startEmailAuth({ email, displayName: 'Demo host' });
  if (!auth.devCode) throw new Error('Demo requires the isolated development identity boundary.');
  const session = await events.verifyEmailAuth({ email, code: auth.devCode, displayName: 'Demo host' });
  const playgroup = await events.createPlaygroup(session.token, { name: 'Demo Friday Friends' });
  const guests = [];
  const commanders = ['Muldrotha, the Gravetide', 'Giada, Font of Hope', "Atraxa, Praetors’ Voice", 'Meren of Clan Nel Toth'];
  for (const [index, name] of ['Ada', 'Bea', 'Cal', 'Dara'].entries()) {
    const guest = await events.createGuestProfile(session.token, playgroup.id, { displayName: name });
    const commanderName = commanders[index]!;
    const deck = await events.createSavedDeckProfile(session.token, playgroup.id, guest.id, {
      commanderName, bracket: 3, preferred: true,
      commanders: [{ oracleId: `demo-oracle-${index}`, cardId: `demo-card-${index}`, name: commanderName,
        artCropUri: '', typeLine: 'Legendary Creature', oracleText: '', keywords: [] }],
    });
    guests.push({ guest, deck });
  }
  await events.recordLocalPlaygroupGame(session.token, playgroup.id, {
    clientGameId: 'demo-first-game', gameMode: 'commander', rulesFormat: 'commander',
    seats: guests.map(({ guest, deck }, index) => ({ guestProfileId: guest.id,
      savedDeckProfileId: deck.id, displayName: guest.displayName, commanderName: deck.commanderName,
      bracket: 3, resultType: index === 0 ? 'WIN' : 'LOSS' })),
  });
  return { token: session.token, account: session.account, playgroup, guests };
}
