import { expect, test, type Page } from './fixtures';
import { createConstructedEvent, joinAsPlayer, markPlayerReady, prepareApp } from './helpers';

async function anotherPlayer(page: Page) {
  const popup = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'Join as another person', exact: true }).click();
  const next = await popup;
  await next.setViewportSize({ width: 390, height: 844 });
  await expect(next.getByLabel('Display name', { exact: true })).toBeVisible();
  await expect(next.getByLabel('Display name', { exact: true })).toHaveValue('');
  return next;
}

async function joinCurrent(page: Page, name: string) {
  await page.getByLabel('Display name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Join event', exact: true }).click();
  await expect(page.getByText(`This tab: ${name}`, { exact: true })).toBeVisible();
}

test('one phone hosts and plays four independent seats, restores closed tabs, and keeps one tracker', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const code = await createConstructedEvent(page, { name: 'One phone night', baseModeLabel: 'Multiplayer', commanderRules: false });
  const hostToken = await page.evaluate(code => localStorage.getItem(`podyguard.host.${code}`), code);
  const ada = await context.newPage();
  await ada.setViewportSize({ width: 390, height: 844 });
  await joinAsPlayer(ada, code, 'Ada');
  const adaSession = await ada.evaluate(code => localStorage.getItem(`podyguard.player.${code}`), code);
  // An account on the device must not authenticate the additional guests.
  const demo = await (await page.request.get('/test/demo')).json();
  const accountSession = JSON.stringify({ token: demo.token, account: demo.account });
  await page.evaluate(value => localStorage.setItem('podyguard.account.session', value), accountSession);

  const bea = await anotherPlayer(ada);
  await bea.getByLabel('Display name', { exact: true }).fill('Bea draft');
  await bea.getByPlaceholder('Deck name (optional)').fill('Bea deck');
  const cal = await anotherPlayer(ada);
  expect(bea.url()).not.toBe(cal.url());
  await expect(bea.getByLabel('Display name', { exact: true })).toHaveValue('Bea draft');
  await expect(cal.getByPlaceholder('Deck name (optional)')).toHaveValue('');
  await expect(bea.getByPlaceholder('Deck name (optional)')).toHaveValue('Bea deck');
  const joinRequest = bea.waitForRequest(r => r.url().endsWith(`/events/${code}/join`) && r.method() === 'POST');
  await joinCurrent(bea, 'Bea');
  expect((await joinRequest).headers().authorization).toBeUndefined();
  await joinCurrent(cal, 'Cal');
  const dara = await anotherPlayer(bea);
  await joinCurrent(dara, 'Dara');
  const daraUrl = dara.url();
  await dara.close();

  const restored = await context.newPage();
  await restored.setViewportSize({ width: 390, height: 844 });
  await restored.goto(`/#/e/${code}`);
  await expect(restored.getByText('This tab: Ada', { exact: true })).toBeVisible();
  await restored.getByText('Players on this device', { exact: true }).click();
  await restored.getByRole('link', { name: 'Continue as Dara', exact: true }).click();
  await expect(restored.getByText('This tab: Dara', { exact: true })).toBeVisible();
  expect(restored.url()).toBe(daraUrl);
  await restored.getByText('Players on this device', { exact: true }).click();
  expect(await restored.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await restored.screenshot({ path: test.info().outputPath('saved-players-phone.png') });
  for (const [player, name] of [[ada, 'Ada'], [bea, 'Bea'], [cal, 'Cal'], [restored, 'Dara']] as const) {
    await player.reload();
    await expect(player.getByText(`This tab: ${name}`, { exact: true })).toBeVisible();
    await expect(player).toHaveTitle(`${name} · PodyGuard`);
    await markPlayerReady(player);
  }
  const roster = (await (await page.request.get(`/api/events/${code}/participants`)).json()).participants;
  expect(roster.map((p: { displayName: string }) => p.displayName).sort()).toEqual(['Ada', 'Bea', 'Cal', 'Dara']);
  expect(new Set(roster.map((p: { id: string }) => p.id)).size).toBe(4);
  await expect(page.getByText('4 ready', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Match now', exact: true }).click();
  await page.getByRole('button', { name: 'Start game', exact: true }).first().click();
  await expect(ada.getByText('Match found', { exact: true })).toBeVisible();
  await ada.getByRole('button', { name: 'Use game tracker', exact: true }).click();
  await ada.getByRole('button', { name: 'Reveal starting player', exact: true }).click();
  await ada.getByRole('button', { name: 'Start', exact: true }).click();
  await ada.getByTitle('Show seat controls', { exact: true }).click();
  await ada.getByTitle('Match menu', { exact: true }).click();
  await expect(ada.getByRole('link', { name: 'Join as another person', exact: true })).toBeVisible();
  await ada.getByRole('button', { name: 'Share live tracker', exact: true }).click();
  await expect(ada.getByRole('link', { name: 'Open read-only tracker' })).toBeVisible();
  await bea.reload();
  await expect(bea.getByText('This tab: Bea', { exact: true })).toBeVisible();
  await expect(bea.locator('article[data-seat-id]')).toHaveCount(0);
  await bea.getByRole('link', { name: 'View live table', exact: true }).click();
  await expect(bea.getByLabel('Ada: 20 life', { exact: true })).toBeVisible();
  await expect(bea.getByRole('button', { name: /Add 1 life|Remove 1 life/ })).toHaveCount(0);
  await expect(cal.getByText('This tab: Cal', { exact: true })).toBeVisible();
  expect(await page.evaluate(code => localStorage.getItem(`podyguard.host.${code}`), code)).toBe(hostToken);
  expect(await page.evaluate(code => localStorage.getItem(`podyguard.player.${code}`), code)).toBe(adaSession);
  expect(await page.evaluate(() => localStorage.getItem('podyguard.account.session'))).toBe(accountSession);
});

test('two invitation tabs opened before joining cannot replace each other’s saved seat', async ({ page, context }) => {
  const code = await createConstructedEvent(page, { name: 'Fresh invitation tabs', baseModeLabel: 'Duel', commanderRules: false });
  const ada = await context.newPage();
  const bea = await context.newPage();
  await ada.goto(`/#/e/${code}`);
  await bea.goto(`/#/e/${code}`);
  await expect(ada.getByLabel('Display name', { exact: true })).toBeVisible();
  await expect(bea.getByLabel('Display name', { exact: true })).toBeVisible();
  await joinCurrent(ada, 'Ada');
  await joinCurrent(bea, 'Bea');
  await expect(bea).toHaveURL(/\?seat=/);
  await ada.reload();
  await bea.reload();
  await expect(ada.getByText('This tab: Ada', { exact: true })).toBeVisible();
  await expect(bea.getByText('This tab: Bea', { exact: true })).toBeVisible();
});

test('leaving an extra seat preserves other tabs and its old local link cannot impersonate a player elsewhere', async ({ page, context, browser }) => {
  const code = await createConstructedEvent(page, { name: 'Shared device recovery', baseModeLabel: 'Duel', commanderRules: false });
  const ada = await context.newPage();
  await joinAsPlayer(ada, code, 'Ada');
  const bea = await anotherPlayer(ada);
  await joinCurrent(bea, 'Bea');
  const localUrl = bea.url();
  await bea.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(bea.getByLabel('Display name', { exact: true })).toBeVisible();
  await ada.reload();
  await expect(ada.getByText('This tab: Ada', { exact: true })).toBeVisible();
  await ada.getByText('Players on this device', { exact: true }).click();
  await expect(ada.getByRole('link', { name: 'Continue as Bea', exact: true })).toHaveCount(0);
  // A different browser has no saved credentials for this local selector.
  const stranger = await browser.newPage();
  try {
    await prepareApp(stranger);
    await stranger.goto(localUrl);
    await expect(stranger.getByLabel('Display name', { exact: true })).toHaveValue('');
    await expect(stranger.getByText('This tab: Bea', { exact: true })).toHaveCount(0);
  } finally { await stranger.close(); }
});
