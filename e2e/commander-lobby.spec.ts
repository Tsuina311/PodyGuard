import { expect, test, type Page } from './fixtures';
import { createConstructedEvent, prepareApp } from './helpers';

// Only the external card catalogue is stubbed. Joining, decks, readiness,
// matching, starting and live updates use the real application server.
async function stubCommanderCatalogue(page: Page) {
  // Artwork is external and irrelevant to queue/tracker correctness. Keep this
  // journey independent of CDN availability and invalid fixture card IDs.
  const artwork = (route: import('@playwright/test').Route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#123"/></svg>' });
  await page.route('https://cards.scryfall.io/**', artwork);
  await page.route('https://example.com/commander.jpg', artwork);
  const commander = {
    oracleId: 'test-oracle', cardId: 'test-card', name: 'Test Commander',
    artCropUri: 'https://example.com/commander.jpg',
    typeLine: 'Legendary Creature — Human', oracleText: '', keywords: [],
  };
  await page.route('**/api/scryfall/commanders?**', (route) =>
    route.fulfill({ json: { cards: [commander] } }),
  );
  await page.route('**/api/scryfall/artwork?**', (route) =>
    route.fulfill({ json: { artwork: [] } }),
  );
}

async function joinCommander(page: Page, name: string, bracket = 'B3', saved = false) {
  if (saved) {
    await page.getByRole('button', { name: new RegExp(`^${name} Select`) }).click();
    await page.getByRole('button', { name: 'Join event', exact: true }).click();
    await expect(page.getByRole('button', { name: "I'm ready" })).toBeVisible();
    return;
  }
  await expect.poll(async () => await page.getByLabel('Display name').isVisible() || await page.getByRole('button', { name: "I'm new here", exact: true }).isVisible()).toBe(true);
  const newPlayer = page.getByRole('button', { name: "I'm new here", exact: true });
  if (await newPlayer.isVisible()) await newPlayer.click();
  await page.getByLabel('Display name').fill(name);
  await page.getByRole('button', { name: bracket, exact: true }).click();
  await page.getByLabel('Commander', { exact: true }).fill('Test');
  await page.getByRole('button', { name: /Test Commander.*Legendary/ }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Join event', exact: true }).click();
  await expect(page.getByRole('button', { name: "I'm ready" })).toBeVisible();
}

for (const changeBracket of [false, true]) {
  test(`one-table Commander: three friends + host${changeBracket ? ' changing B2 to B3 before ready' : ''} can match and start`, async ({ page, browser, baseURL }) => {
    test.setTimeout(120_000);
    const demo = await (await page.request.get('/test/demo')).json();
    const groupName = `Commander history ${changeBracket ? 'changed' : 'standard'} ${test.info().repeatEachIndex}-${test.info().retry}`;
    const groupResponse = await page.request.post('/api/playgroups', {
      headers: { Authorization: `Bearer ${demo.token}` }, data: { name: groupName },
    });
    expect(groupResponse.ok()).toBe(true);
    const groupId = (await groupResponse.json()).playgroup.id;
    for (const name of ['Ada', 'Bea', 'Cal', 'Host']) {
      const guestResponse = await page.request.post(`/api/playgroups/${groupId}/guests`, {
        headers: { Authorization: `Bearer ${demo.token}` }, data: { displayName: name },
      });
      expect(guestResponse.ok()).toBe(true);
      const guestId = (await guestResponse.json()).guest.id;
      const deckResponse = await page.request.post(`/api/playgroups/${groupId}/guests/${guestId}/decks`, {
        headers: { Authorization: `Bearer ${demo.token}` },
        data: { commanderName: 'Test Commander', bracket: name === 'Host' && changeBracket ? 2 : 3,
          commanders: [{ oracleId: 'test-oracle', cardId: 'test-card', name: 'Test Commander', artCropUri: '', typeLine: 'Legendary Creature', oracleText: '', keywords: [] }], preferred: true },
      });
      expect(deckResponse.ok()).toBe(true);
    }
    await page.addInitScript(session => localStorage.setItem('podyguard.account.session', JSON.stringify(session)), { token: demo.token, account: demo.account });
    await stubCommanderCatalogue(page);
    const code = await createConstructedEvent(page, {
      name: 'Commander friends', baseModeLabel: 'Multiplayer',
      commanderRules: true, tableCount: 1, playgroupName: groupName,
    });
    const friends: Page[] = [];
    try {
      for (const name of ['Ada', 'Bea', 'Cal']) {
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
        });
        const friend = await context.newPage();
        friends.push(friend);
        await prepareApp(friend);
        await stubCommanderCatalogue(friend);
        // The QR code points to this public join URL.
        await friend.goto(`${baseURL}/?join=${code}`);
        await joinCommander(friend, name, 'B3', true);
        await friend.getByRole('button', { name: "I'm ready" }).click();
      }
      await page.getByRole('tab', { name: 'Play', exact: true }).click();
      await joinCommander(page, 'Host', changeBracket ? 'B2' : 'B3', true);
      if (changeBracket) {
        await page.getByRole('button', { name: 'B3', exact: true }).click();
      }
      const readyResponse = page.waitForResponse((response) =>
        response.url().endsWith('/ready') && response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: "I'm ready" }).click();
      const ready = await readyResponse;
      expect(ready.ok()).toBe(true);
      expect((await ready.json()).participant.decks[0].poolId).toBe('b3');

      await page.getByRole('tab', { name: 'Desk', exact: true }).click();
      await expect(page.getByText('4 ready', { exact: true }).first()).toBeVisible();
      await page.getByRole('button', { name: 'Match now', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Start game', exact: true })).toHaveCount(1);
      const tables = await page.request.get(`/api/events/${code}/tables`);
      const eventTables = (await tables.json()).tables;
      expect(eventTables).toMatchObject([
        { status: 'occupied', seatedNames: expect.arrayContaining(['Ada', 'Bea', 'Cal', 'Host']) },
      ]);
      await page.getByRole('button', { name: 'Start game', exact: true }).click();
      await page.getByRole('tab', { name: 'Play', exact: true }).click();
      for (const player of [...friends, page]) {
        await expect(player.getByText('Match found', { exact: true })).toBeVisible();
        await player.getByRole('button', { name: 'Use game tracker', exact: true }).click();
        await expect(player.getByRole('heading', { name: 'Ready to begin' })).toBeVisible();
        await player.getByRole('button', { name: 'Reveal starting player', exact: true }).click();
        await expect(player.getByText('40', { exact: true })).toHaveCount(4);
        await player.getByRole('button', { name: 'Start', exact: true }).click();
        await expect(player.getByRole('button', { name: 'Start', exact: true })).toHaveCount(0);
        await expect(player.locator('article[data-seat-id]')).toHaveCount(4);
      }
      await test.step('Life changes survive refresh and can be undone', async () => {
        const seat = page.locator('article[data-seat-id]').first();
        await seat.getByRole('button', { name: /^Remove 1 life/ }).click();
        await expect(seat.getByText('39', { exact: true })).toBeVisible();
        const reveal = page.getByRole('button', { name: /^Show seat controls/ });
        if (await reveal.isVisible()) await reveal.click();
        await page.getByRole('button', { name: /^Match menu\./ }).click();
        await page.getByRole('button', { name: 'Undo', exact: true }).click();
        await page.getByRole('button', { name: 'Close match menu', exact: true }).click();
        await expect(page.getByText('40', { exact: true })).toHaveCount(4);
        const removeLife = seat.getByRole('button', { name: /^Remove 1 life/ });
        await expect(removeLife).toBeEnabled();
        await removeLife.click();
        await expect(seat.getByText('39', { exact: true })).toBeVisible();
        const seatId = await seat.getAttribute('data-seat-id');
        await expect.poll(() => page.evaluate(({ key, seatId }) => {
          const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
          return saved?.players?.find((player: { id: string; life: number }) => player.id === seatId)?.life;
        }, { key: `podyguard.tracker.${code}.${eventTables[0].id}`, seatId })).toBe(39);
        await page.reload();
        await page.getByRole('tab', { name: 'Play', exact: true }).click();
        await expect(page.locator('article[data-seat-id]').first().getByText('39', { exact: true })).toBeVisible();
      });
      await test.step('Finish a game and verify playgroup history exactly once', async () => {
        const reveal = page.getByRole('button', { name: /^Show seat controls/ });
        if (await reveal.isVisible()) await reveal.click();
        await page.getByRole('button', { name: /^Match menu\./ }).click();
        await page.getByRole('button', { name: 'Game won by', exact: true }).click();
        await page.getByRole('button', { name: 'Seat 1', exact: true }).click();
        await page.getByRole('button', { name: 'Yes, they won', exact: true }).click();
        await page.getByRole('button', { name: 'Done & requeue', exact: true }).click();
        const overviewResponse = await page.request.get(`/api/playgroups/${groupId}`, { headers: { Authorization: `Bearer ${demo.token}` } });
        expect(overviewResponse.ok()).toBe(true);
        const overview = (await overviewResponse.json()).overview;
        expect(overview.recordedGamesCount).toBe(1);
        expect(overview.recentGames[0].participants).toHaveLength(4);
        expect(overview.recentGames[0].participants.filter((player: { resultType: string }) => player.resultType === 'WIN')).toHaveLength(1);
        expect(overview.recentGames[0].participants.filter((player: { resultType: string }) => player.resultType === 'LOSS')).toHaveLength(3);
        for (const guest of overview.guests) {
          expect(guest.stats.gamesPlayed).toBe(1);
          expect(guest.stats.mostPlayedWith).toHaveLength(3);
          expect(guest.savedDecks.some((deck: { commanderName: string }) => deck.commanderName === 'Test Commander')).toBe(true);
        }
        const tables = await page.request.get(`/api/events/${code}/tables`);
        expect((await tables.json()).tables[0].status).toBe('free');
      });
      await test.step('The same playgroup returns for another event with its saved Commanders', async () => {
        const nextCode = await createConstructedEvent(page, {
          name: 'Next Commander night', baseModeLabel: 'Multiplayer', commanderRules: true,
          tableCount: 1, playgroupName: groupName,
        });
        for (const [index, friend] of friends.entries()) {
          await friend.goto(`${baseURL}/?join=${nextCode}`);
          await joinCommander(friend, ['Ada', 'Bea', 'Cal'][index]!, 'B3', true);
          await friend.getByRole('button', { name: "I'm ready", exact: true }).click();
        }
        await page.getByRole('tab', { name: 'Play', exact: true }).click();
        await joinCommander(page, 'Host', 'B3', true);
        await page.getByRole('button', { name: "I'm ready", exact: true }).click();
        await page.getByRole('tab', { name: 'Desk', exact: true }).click();
        await expect(page.getByText('4 ready', { exact: true }).first()).toBeVisible();
        await page.getByRole('button', { name: 'Match now', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Start game', exact: true })).toHaveCount(1);
        await page.getByRole('button', { name: 'Start game', exact: true }).click();
        const roster = await page.request.get(`/api/events/${nextCode}/participants`);
        expect((await roster.json()).participants).toHaveLength(4);
        const overview = await page.request.get(`/api/playgroups/${groupId}`, { headers: { Authorization: `Bearer ${demo.token}` } });
        expect((await overview.json()).overview.recordedGamesCount).toBe(1);
      });
    } finally {
      await Promise.all(friends.map((friend) => friend.context().close()));
    }
  });
}

test('Match now explains when it cannot form a table', async ({ page }) => {
  await createConstructedEvent(page, {
    name: 'Empty Commander queue', baseModeLabel: 'Multiplayer',
    commanderRules: true, tableCount: 1,
  });
  await page.getByRole('button', { name: 'Match now', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'No tables could be formed' })).toBeVisible();
});

test('a failed deck save does not ready a player with the old bracket', async ({ page }) => {
  await stubCommanderCatalogue(page);
  const code = await createConstructedEvent(page, {
    name: 'Failed deck save', baseModeLabel: 'Multiplayer',
    commanderRules: true, tableCount: 1,
  });
  await page.getByRole('tab', { name: 'Play', exact: true }).click();
  await joinCommander(page, 'Host', 'B2');
  await page.getByRole('button', { name: 'B3', exact: true }).click();
  let readyRequests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/ready') && request.method() === 'POST') readyRequests++;
  });
  await page.route('**/api/events/*/decks', (route) => route.fulfill({
    status: 503,
    json: { error: { code: 'UNAVAILABLE', message: 'Deck save unavailable. Please retry.' } },
  }));
  await page.getByRole('button', { name: "I'm ready" }).click();
  await expect(page.getByText('Deck save unavailable. Please retry.', { exact: true })).toBeVisible();
  expect(readyRequests).toBe(0);
  const roster = await page.request.get(`/api/events/${code}/participants`);
  expect((await roster.json()).participants).toMatchObject([
    { displayName: 'Host', status: 'joined', decks: [{ poolId: 'b2' }] },
  ]);
});
