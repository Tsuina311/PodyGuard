import { expect, test, type Page } from './fixtures';
import { createConstructedEvent, joinAsPlayer, markPlayerReady } from './helpers';

async function menu(page: Page) {
  const reveal = page.getByRole('button', { name: /^Show seat controls/ });
  if (await reveal.isVisible()) await reveal.click();
  await page.getByTitle('Match menu', { exact: true }).click();
}

test('one event tracker keeps playing offline, debounces saves, and hands over the latest game and undo', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const code = await createConstructedEvent(page, { name: 'Tracker handoff', baseModeLabel: 'Duel', commanderRules: false });
  const ada = await browser.newPage();
  const bea = await browser.newPage();
  await ada.clock.install();
  try {
    for (const [player, name] of [[ada, 'Ada'], [bea, 'Bea']] as const) {
      await player.setViewportSize({ width: 390, height: 844 });
      await joinAsPlayer(player, code, name);
      await markPlayerReady(player);
    }
    await expect(page.getByText('2 ready', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Match now', exact: true }).click();
    await page.getByRole('button', { name: 'Start game', exact: true }).click();
    await ada.getByRole('button', { name: 'Use game tracker', exact: true }).click();
    await ada.getByRole('button', { name: 'Reveal starting player', exact: true }).click();
    await ada.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(bea.getByText('Game is tracked on Ada’s device', { exact: true })).toBeVisible();
    await bea.getByRole('button', { name: 'Read-only mode', exact: true }).click();
    await expect(bea.getByLabel('Ada: 20 life', { exact: true })).toBeVisible();
    await expect(bea.getByRole('button', { name: /Remove 1 life|Add 1 life/ })).toHaveCount(0);
    // Freeze page time so slow WebKit action round trips still represent a rapid tap burst.
    await ada.clock.pauseAt(await ada.evaluate(() => Date.now() + 1000));
    let writes = 0;
    ada.on('request', req => {
      if (req.url().endsWith('/tracker/update') && req.postDataJSON().history.present.players[0].life < 20) writes++;
    });
    const seat = ada.locator('article[data-seat-id]').first();
    for (let i = 0; i < 3; i++) {
      await seat.getByRole('button', { name: /^Remove 1 life/ }).click({ force: true });
      await ada.clock.runFor(16);
    }
    await expect(seat.getByText('17', { exact: true })).toBeVisible();
    await ada.clock.runFor(450);
    await ada.clock.resume();
    await expect(bea.getByLabel('Ada: 17 life', { exact: true })).toBeVisible();
    expect(writes).toBeLessThan(3);
    await ada.context().setOffline(true);
    for (let i = 0; i < 2; i++) await seat.getByRole('button', { name: /^Remove 1 life/ }).click();
    await expect(seat.getByText('15', { exact: true })).toBeVisible();
    await bea.getByRole('button', { name: 'Transfer to this device', exact: true }).click();
    await expect(bea.getByText(/Waiting for the tracking device to connect and hand over/)).toBeVisible();
    // An offline controller remains editable while another device waits.
    await seat.getByRole('button', { name: /^Remove 1 life/ }).click();
    await expect(seat.getByText('14', { exact: true })).toBeVisible();
    await expect(bea.locator('article[data-seat-id]')).toHaveCount(0);
    await ada.context().setOffline(false);
    await expect(bea.locator('article[data-seat-id]')).toHaveCount(2);
    await expect(bea.locator('article[data-seat-id]').first().getByText('14', { exact: true })).toBeVisible();
    await expect(ada.getByLabel('Ada: 14 life', { exact: true })).toBeVisible();
    await expect(ada.getByRole('button', { name: /^Remove 1 life/ })).toHaveCount(0);
    await expect(bea.getByRole('heading', { name: 'Ready to begin', exact: true })).toHaveCount(0);
    await menu(bea);
    await bea.getByRole('button', { name: 'Undo', exact: true }).click();
    await bea.getByRole('button', { name: 'Close match menu', exact: true }).click();
    await expect(bea.locator('article[data-seat-id]').first().getByText('15', { exact: true })).toBeVisible();
    await expect(ada.getByLabel('Ada: 15 life', { exact: true })).toBeVisible();
    await bea.reload();
    await expect(bea.locator('article[data-seat-id]').first().getByText('15', { exact: true })).toBeVisible();
    await bea.screenshot({ path: test.info().outputPath('controller-phone.png') });
    await ada.screenshot({ path: test.info().outputPath('viewer-phone.png') });
  } finally {
    await ada.context().setOffline(false);
    await ada.close();
    await bea.close();
  }
});

test('upgrading an ongoing local event tracker preserves its life totals and starting player', async ({ page, browser }) => {
  const code = await createConstructedEvent(page, { name: 'Existing tracker upgrade', baseModeLabel: 'Duel', commanderRules: false });
  const ada = await browser.newPage();
  const bea = await browser.newPage();
  try {
    for (const [player, name] of [[ada, 'Ada'], [bea, 'Bea']] as const) {
      await joinAsPlayer(player, code, name);
      await markPlayerReady(player);
    }
    await expect(page.getByText('2 ready', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Match now', exact: true }).click();
    await page.getByRole('button', { name: 'Start game', exact: true }).click();
    const roster = (await (await page.request.get(`/api/events/${code}/participants`)).json()).participants as Array<{ id: string; displayName: string }>;
    const table = (await (await page.request.get(`/api/events/${code}/tables`)).json()).tables[0];
    // Snapshot shape saved by the previous release, before server-owned tracking existed.
    const saved = {
      gameMode: 'duel', rulesFormat: 'normal',
      players: roster.map((p, colorIndex) => ({ id: p.id, name: p.displayName, colorIndex,
        life: colorIndex === 0 ? 13 : 20, minimumLife: colorIndex === 0 ? 13 : 20,
        poison: 0, commanderTax: 0, counters: { acorn: 0, energy: 0, experience: 0, gate: 0, hit: 0, rad: 0, ring: 0, speed: 0, ticket: 0 },
        enduringStory: false, cityBlessing: false, commanders: [], commanderDamage: {}, eliminated: false, pendingLoss: null, answeredCauses: [],
      })),
      teams: null, teamMode: null, archenemyId: null, emperorIds: [], starOrder: [],
      assassinTargets: {}, assassinScores: {}, assassinContractsReady: false,
      treacheryRoles: {}, treacheryIdentities: {}, treacheryUnveiled: [], treacheryRolesReady: false,
      schemeOrder: [], currentSchemeId: null, activeSchemeIds: [], pastSchemeIds: [], dayNight: null,
      dungeons: {}, completedDungeons: {}, monarchId: null, initiativeId: null, firstPlayerId: roster[1]!.id,
      winnerId: null, startedAt: Date.now() - 300_000, pausedAt: null, accumulatedPausedMs: 0, eliminations: [],
    };
    await ada.evaluate(({ key, saved }) => localStorage.setItem(key, JSON.stringify(saved)), {
      key: `podyguard.tracker.${code}.${table.id}.${table.playingStartedAt}`, saved,
    });
    await ada.getByRole('button', { name: 'Use game tracker', exact: true }).click();
    await expect(ada.locator('article[data-seat-id]').first().getByText('13', { exact: true })).toBeVisible();
    await expect(ada.getByRole('heading', { name: 'Ready to begin', exact: true })).toHaveCount(0);
    await bea.getByRole('button', { name: 'Read-only mode', exact: true }).click();
    await expect(bea.getByLabel(`${roster[0]!.displayName}: 13 life`, { exact: true })).toBeVisible();
    const starter = bea.getByRole('article').filter({ hasText: roster[1]!.displayName });
    await expect(starter.getByText('Starting player', { exact: true })).toBeVisible();
  } finally { await ada.close(); await bea.close(); }
});

test('a host can return from the tracker to Desk and resume the same game via Play', async ({ page, browser }) => {
  const code = await createConstructedEvent(page, {
    name: 'Play and host', baseModeLabel: 'Duel', commanderRules: false,
  });
  const hostUrl = page.url();
  const guest = await browser.newPage();
  try {
    await joinAsPlayer(page, code, 'Ada');
    await markPlayerReady(page);
    await joinAsPlayer(guest, code, 'Bea');
    await markPlayerReady(guest);
    await page.goto(hostUrl);
    await expect(page.getByText('2 ready', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Match now', exact: true }).click();
    await page.getByRole('button', { name: 'Start game', exact: true }).click();
    await page.getByRole('tab', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: 'Use game tracker', exact: true }).click();
    await page.getByRole('button', { name: 'Reveal starting player', exact: true }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await menu(page);
    await page.getByRole('button', { name: 'Desk', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Desk', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('article[data-seat-id]')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: 'Continue tracking', exact: true }).click();
    await expect(page.locator('article[data-seat-id]')).toHaveCount(2);
    await page.reload();
    await expect(page.locator('article[data-seat-id]')).toHaveCount(2);
  } finally {
    await guest.close();
  }
});

test('opens an explicitly shared table on a monitor with the event code', async ({ page, browser }) => {
  const code = await createConstructedEvent(page, {
    name: 'Monitor rehearsal', baseModeLabel: 'Duel', commanderRules: false,
  });
  const ada = await browser.newPage();
  const bea = await browser.newPage();
  const monitor = await browser.newPage();
  try {
    await joinAsPlayer(ada, code, 'Ada');
    await markPlayerReady(ada);
    await joinAsPlayer(bea, code, 'Bea');
    await markPlayerReady(bea);
    await expect(page.getByText('2 ready', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Match now', exact: true }).click();
    await page.getByRole('button', { name: 'Start game', exact: true }).click();

    await monitor.addInitScript(() => localStorage.setItem('podyguard-lang', 'en'));
    await monitor.goto('/#/display');
    await monitor.getByLabel('Event code', { exact: true }).fill(code.toLowerCase());
    await monitor.getByRole('button', { name: 'Open display', exact: true }).click();
    await expect(monitor.getByRole('heading', { name: 'Monitor rehearsal' })).toBeVisible();
    await expect(monitor.getByText('No live games are shared on this display yet.')).toBeVisible();

    await ada.getByRole('button', { name: 'Use game tracker', exact: true }).click();
    await ada.getByRole('button', { name: 'Reveal starting player', exact: true }).click();
    await ada.getByRole('button', { name: 'Start', exact: true }).click();
    await menu(ada);
    await ada.getByRole('button', { name: 'Share live tracker', exact: true }).click();
    await expect(ada.getByText(new RegExp(code))).toBeVisible();
    await ada.getByRole('button', { name: 'Show on event monitor', exact: true }).click();

    await monitor.getByRole('button', { name: 'Table 1', exact: true }).click();
    await expect(monitor.getByRole('heading', { name: 'Table 1' })).toBeVisible();
    await expect(monitor.getByLabel('Ada: 20 life', { exact: true })).toBeVisible();
    await expect(monitor.getByRole('button', { name: /Remove 1 life|Transfer to this device/ })).toHaveCount(0);

    await ada.getByRole('button', { name: 'Remove from event monitor', exact: true }).click();
    await expect(monitor.getByText('No live games are shared on this display yet.')).toBeVisible();
    await expect(monitor.getByLabel('Ada: 20 life', { exact: true })).toHaveCount(0);
  } finally {
    await ada.close();
    await bea.close();
    await monitor.close();
  }
});
