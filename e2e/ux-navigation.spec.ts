import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { createConstructedEvent, joinAsPlayer, markPlayerReady, openQuickPlaySetup, prepareApp } from './helpers';

test('an invitation has a main menu exit and retains the saved response', async ({ page, request }) => {
  const demo = await (await request.get('/test/demo')).json();
  const created = await request.post(`/api/playgroups/${demo.playgroup.id}/nights`, {
    headers: { Authorization: `Bearer ${demo.token}` },
    data: { name: 'Navigation rehearsal', startsAt: new Date(Date.now() + 86400_000).toISOString(),
      timeZone: 'Europe/Paris', location: 'Demo table', seatTarget: 4 },
  });
  expect(created.ok()).toBe(true);
  const night = (await created.json()).night;
  await prepareApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#/nights/${night.id}`);
  await page.getByLabel('Your name').fill('Ada');
  await page.getByRole('button', { name: 'Save response', exact: true }).click();
  await expect(page.getByText('Response saved.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Main menu', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Host event' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Recent events and invitations' })
    .getByRole('link', { name: /Navigation rehearsal/ }).click();
  await expect(page.getByLabel('Your name')).toHaveValue('Ada');
  await page.getByRole('button', { name: 'Navigation menu', exact: true }).click();
  const menu = page.getByRole('navigation', { name: 'Navigation menu', exact: true });
  await expect(menu.getByRole('link', { name: 'My playgroups', exact: true })).toBeVisible();
  await menu.getByRole('link', { name: 'Main menu', exact: true }).click();
  await expect(menu).not.toBeVisible();
  await page.getByRole('button', { name: 'Navigation menu', exact: true }).click();
  await menu.getByRole('link', { name: 'Main menu', exact: true }).click();
  await expect(menu).not.toBeVisible();
  await page.getByRole('button', { name: 'Navigation menu', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  await page.screenshot({ path: test.info().outputPath('navigation-phone.png') });
});

test('host overview stays visible while browsing tables, players, sharing and settings', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const code = await createConstructedEvent(page, { name: 'Host UX rehearsal', baseModeLabel: 'Duel', commanderRules: false, tableCount: 16 });
  const bar = page.getByRole('region', { name: 'Overview', exact: true });
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Pod sizes', exact: true })).not.toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(async () => (await bar.boundingBox())?.y).toBeLessThan(80);
  await expect.poll(async () => (await bar.boundingBox())?.y).toBeGreaterThanOrEqual(64);
  await expect(bar.getByRole('button', { name: 'Match now', exact: true })).toBeInViewport();
  await bar.getByRole('tab', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pod sizes', exact: true })).toBeVisible();
  const settings = page.getByRole('tabpanel', { name: 'Settings', exact: true });
  await settings.getByRole('button', { name: 'Disable', exact: true }).first().click();
  await expect(bar.getByText('15/16 tables free', { exact: true })).toBeVisible();
  await settings.getByRole('button', { name: 'Enable', exact: true }).first().click();
  await expect(bar.getByText('16/16 tables free', { exact: true })).toBeVisible();
  await bar.getByRole('tab', { name: 'Share', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copy player link', exact: true })).toBeVisible();
  await bar.getByRole('tab', { name: 'Players', exact: true }).click();
  const guest = await browser.newPage();
  try {
    await joinAsPlayer(guest, code, 'Ada');
    await markPlayerReady(guest);
    await expect(bar.getByText('1 ready', { exact: true })).toBeVisible();
    await expect(page.getByRole('tabpanel', { name: 'Players', exact: true }).getByText('Ada', { exact: true })).toBeVisible();
    await page.getByLabel('Find a player').fill('missing');
    await expect(page.getByText('No players match this view.')).toBeVisible();
    await page.getByLabel('Find a player').fill('ada');
    await page.getByRole('combobox', { name: 'Player status', exact: true }).selectOption('ready');
    await expect(page.getByRole('tabpanel', { name: 'Players', exact: true }).getByText('Ada', { exact: true })).toBeVisible();
    await bar.getByRole('tab', { name: 'Overview', exact: true }).click();
    await bar.getByRole('button', { name: 'Match now', exact: true }).click();
    await expect(bar.getByRole('status')).toContainText('No tables could be formed');
    await expect(bar.getByText('1 ready', { exact: true })).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('host-overview-phone.png') });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: test.info().outputPath('host-overview-desktop.png') });
  } finally { await guest.close(); }
});

test('changing a commander is an outlined touch target and focuses the replacement search', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/scryfall/commanders?**', route => route.fulfill({ json: { cards: [{
    oracleId: 'ux-commander', cardId: 'ux-commander', name: 'Test Commander', typeLine: 'Legendary Creature',
    oracleText: 'Flying', keywords: [], artCropUri: '',
  }] } }));
  await page.route('**/api/scryfall/artwork?**', route => route.fulfill({ json: { artwork: [] } }));
  await openQuickPlaySetup(page, { baseModeLabel: 'Duel', commanderRules: true });
  const search = page.getByLabel('Commander', { exact: true }).first();
  await search.fill('Test Commander');
  await page.getByRole('button', { name: /Test Commander.*Legendary/ }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
  const change = page.getByRole('button', { name: 'Change Test Commander', exact: true });
  await expect(change).toBeVisible();
  expect((await change.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await change.evaluate(el => getComputedStyle(el).borderTopStyle)).toBe('solid');
  await change.click();
  await expect(search).toBeFocused();
});
