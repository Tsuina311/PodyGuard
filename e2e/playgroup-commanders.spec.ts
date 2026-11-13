import { expect, test, type Page } from './fixtures';
import { createConstructedEvent, prepareApp } from './helpers';

const variants = [
  { label: 'Partner', text: 'Partner', keywords: ['Partner'], type: 'Legendary Creature' },
  { label: 'Partner with', text: 'Partner with Pair Beta', keywords: ['Partner with'], type: 'Legendary Creature' },
  { label: 'Friends forever', text: 'Friends forever', keywords: ['Friends forever'], type: 'Legendary Creature' },
  { label: 'Choose a Background', text: 'Choose a Background', keywords: ['Choose a Background'], type: 'Legendary Creature' },
  { label: 'Background first', text: '', keywords: [], type: 'Legendary Enchantment — Background' },
  { label: "Doctor's companion", text: "Doctor's companion", keywords: ["Doctor's companion"], type: 'Legendary Creature' },
  { label: 'Doctor first', text: '', keywords: [], type: 'Legendary Creature — Time Lord Doctor' },
];

const art = 'https://example.com/pair-alpha.svg';
const secondary = { oracleId: 'pair-beta', cardId: 'pair-beta', name: 'Pair Beta', artCropUri: 'https://example.com/pair-beta.svg',
  typeLine: 'Legendary Creature', oracleText: 'Partner', keywords: ['Partner'] };

async function fixture(page: Page, suffix: string) {
  const demo = await (await page.request.get('/test/demo')).json();
  const headers = { Authorization: `Bearer ${demo.token}` };
  const groupResponse = await page.request.post('/api/playgroups', { headers, data: { name: `Pair coverage ${suffix}` } });
  expect(groupResponse.ok()).toBe(true);
  const group = (await groupResponse.json()).playgroup;
  const guestResponse = await page.request.post(`/api/playgroups/${group.id}/guests`, { headers, data: { displayName: 'Pair Player' } });
  expect(guestResponse.ok()).toBe(true);
  const guest = (await guestResponse.json()).guest;
  await prepareApp(page);
  await page.route('https://example.com/pair-*.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="${route.request().url().includes('beta') ? '#653e4d' : '#234'}"/></svg>` }));
  await page.route('https://cards.scryfall.io/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#234"/></svg>' }));
  await page.addInitScript(session => localStorage.setItem('podyguard.account.session', JSON.stringify(session)), { token: demo.token, account: demo.account });
  return { group, guest, headers };
}

async function select(page: Page, label: string, name: string) {
  await page.getByLabel(label, { exact: true }).fill(name);
  await page.getByRole('button', { name: new RegExp(`${name}.*Legendary`) }).click();
  // Cancel the optional artwork choice; the Commander itself is already selected.
  await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
}

for (const variant of variants) {
  test(`playgroup saves and reuses both Commanders: ${variant.label}`, async ({ page }, info) => {
    const { group, guest, headers } = await fixture(page, `${variant.label} ${info.retry}-${info.repeatEachIndex}`);
    const primary = { oracleId: 'pair-alpha', cardId: 'pair-alpha', name: 'Pair Alpha', artCropUri: art,
      typeLine: variant.type, oracleText: variant.text, keywords: variant.keywords };
    let pairedSearch = false;
    await page.route('**/api/scryfall/commanders?**', route => {
      const pairedWith = new URL(route.request().url()).searchParams.get('pairedWith');
      if (pairedWith) { expect(pairedWith).toBe(primary.cardId); pairedSearch = true; }
      return route.fulfill({ json: { cards: pairedWith ? [secondary] : [primary] } });
    });
    await page.route('**/api/scryfall/artwork?**', route => route.fulfill({ json: { artwork: [] } }));
    await page.goto(`/#/playgroups/${group.id}`);
    await page.getByRole('button', { name: 'Commanders & Edit', exact: true }).click();
    await select(page, 'Search Scryfall Commander', primary.name);
    await select(page, 'Second commander', secondary.name);
    const savedPromise = page.waitForResponse(response => response.url().endsWith(`/guests/${guest.id}/decks`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save commander', exact: true }).click();
    const saved = await savedPromise;
    expect(saved.ok()).toBe(true);
    expect(saved.request().postDataJSON().commanders.map((card: { name: string }) => card.name)).toEqual([primary.name, secondary.name]);
    expect(pairedSearch).toBe(true);
    const pairLabel = `${primary.name} + ${secondary.name}`;
    await expect(page.getByText(pairLabel, { exact: true }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(pairLabel, { exact: true }).first()).toBeVisible();
    const overview = await page.request.get(`/api/playgroups/${group.id}`, { headers });
    expect((await overview.json()).overview.guests[0].savedDecks[0].commanders).toHaveLength(2);

    const code = await createConstructedEvent(page, { name: `Pair return ${variant.label}`, baseModeLabel: 'Multiplayer', commanderRules: true,
      playgroupName: group.name, tableCount: 1 });
    await page.getByRole('tab', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: /^Pair Player Select/ }).click();
    await expect(page.getByText(pairLabel, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Join event', exact: true }).click();
    await expect(page.getByRole('button', { name: "I'm ready", exact: true })).toBeVisible();
    const players = (await (await page.request.get(`/api/events/${code}/participants`)).json()).participants;
    expect(players[0].decks[0].commanders.map((card: { name: string }) => card.name)).toEqual([primary.name, secondary.name]);
    if (variant.label === 'Partner') {
      // Carry the playgroup pair all the way into an actual four-player game.
      for (const displayName of ['Pair Friend One', 'Pair Friend Two', 'Pair Friend Three']) {
        const joined = await page.request.post(`/api/events/${code}/join`, { data: {
          displayName, decks: [{ poolId: 'b3', commanders: [primary] }],
        } });
        expect(joined.ok()).toBe(true);
        const participant = await joined.json();
        const ready = await page.request.post(`/api/events/${code}/ready`, {
          headers: { Authorization: `Bearer ${participant.token}` }, data: { ready: true },
        });
        expect(ready.ok()).toBe(true);
      }
      const readyPromise = page.waitForResponse(response => response.url().endsWith('/ready') && response.request().method() === 'POST');
      await page.getByRole('button', { name: "I'm ready", exact: true }).click();
      expect((await readyPromise).ok()).toBe(true);
      await page.getByRole('tab', { name: 'Desk', exact: true }).click();
      await expect(page.getByText('4 ready', { exact: true }).first()).toBeVisible();
      await page.getByRole('button', { name: 'Match now', exact: true }).click();
      await page.getByRole('button', { name: 'Start game', exact: true }).click();
      await page.getByRole('tab', { name: 'Play', exact: true }).click();
      await page.getByRole('button', { name: 'Use game tracker', exact: true }).click();
      await page.getByRole('button', { name: 'Reveal starting player', exact: true }).click();
      await page.getByRole('button', { name: 'Start', exact: true }).click();
      const pairedSeat = page.locator(`article[data-seat-id="${players[0].id}"]`);
      await expect(pairedSeat.locator('img')).toHaveCount(2);
      await expect(page.getByText('40', { exact: true })).toHaveCount(4);
      await page.screenshot({ path: info.outputPath('saved-partner-pair-in-game.png') });
      await info.attach('saved-partner-pair-in-game', { body: await page.screenshot(), contentType: 'image/png' });
    }
  });
}

test('an existing saved Commander gains a partner without replacing the deck, and a solo Commander clears it', async ({ page }, info) => {
  const { group, guest, headers } = await fixture(page, `edit ${info.retry}`);
  const primary = { ...secondary, oracleId: 'editable-alpha', cardId: 'editable-alpha', name: 'Editable Alpha' };
  const solo = { ...secondary, oracleId: 'solo', cardId: 'solo', name: 'Solo Commander', oracleText: 'Flying', keywords: ['Flying'] };
  const original = await page.request.post(`/api/playgroups/${group.id}/guests/${guest.id}/decks`, { headers,
    data: { commanderName: primary.name, commanders: [primary], bracket: 3, preferred: true } });
  const originalDeck = (await original.json()).deck;
  await page.route('**/api/scryfall/commanders?**', route => route.fulfill({ json: { cards: new URL(route.request().url()).searchParams.has('pairedWith') ? [secondary] : [solo] } }));
  await page.route('**/api/scryfall/artwork?**', route => route.fulfill({ json: { artwork: [] } }));
  await page.goto(`/#/playgroups/${group.id}`);
  await page.getByRole('button', { name: 'Commanders & Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Edit commanders', exact: true }).click();
  await select(page, 'Second commander', secondary.name);
  await page.getByRole('button', { name: 'Save commanders', exact: true }).click();
  await expect(page.getByText(`${primary.name} + ${secondary.name}`, { exact: true }).first()).toBeVisible();
  let deck = (await (await page.request.get(`/api/playgroups/${group.id}`, { headers })).json()).overview.guests[0].savedDecks[0];
  expect(deck.id).toBe(originalDeck.id);
  expect(deck.timesUsed).toBe(originalDeck.timesUsed);
  await page.getByRole('button', { name: 'Edit commanders', exact: true }).click();
  await page.getByRole('button', { name: `Change ${primary.name}`, exact: true }).click();
  await select(page, 'Commander', solo.name);
  await expect(page.getByLabel('Second commander', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save commanders', exact: true }).click();
  await expect(page.getByText(solo.name, { exact: true }).first()).toBeVisible();
  deck = (await (await page.request.get(`/api/playgroups/${group.id}`, { headers })).json()).overview.guests[0].savedDecks[0];
  expect(deck.id).toBe(originalDeck.id);
  expect(deck.commanders.map((card: { name: string }) => card.name)).toEqual([solo.name]);
});

test('name-only manual entry saves and displays both Commanders', async ({ page }, info) => {
  const { group, headers } = await fixture(page, `manual ${info.retry}`);
  await page.goto(`/#/playgroups/${group.id}`);
  await page.getByRole('button', { name: 'Commanders & Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Enter Commander names manually', exact: true }).click();
  await page.getByLabel('Commander name', { exact: true }).fill('Manual Partner One');
  await page.getByRole('checkbox', { name: 'Two Commanders (Partner or similar)', exact: true }).check();
  await page.getByLabel('Second Commander name', { exact: true }).fill('Manual Partner Two');
  await page.getByRole('button', { name: 'Save commander', exact: true }).click();
  await expect(page.getByText('Manual Partner One + Manual Partner Two', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('Manual Partner One + Manual Partner Two', { exact: true }).first()).toBeVisible();
  const deck = (await (await page.request.get(`/api/playgroups/${group.id}`, { headers })).json()).overview.guests[0].savedDecks[0];
  expect(deck.commanders.map((card: { name: string }) => card.name)).toEqual(['Manual Partner One', 'Manual Partner Two']);
});
