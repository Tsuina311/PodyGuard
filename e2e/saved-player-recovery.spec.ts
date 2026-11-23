import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { createConstructedEvent, joinAsPlayer, prepareApp } from './helpers';

test('home recovers closed player tabs by event after removing shortcuts, without replacing identities', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 844 });
  const first = await createConstructedEvent(page, { name: 'Recovery Friday', baseModeLabel: 'Duel', commanderRules: false });
  const ada = await context.newPage();
  await joinAsPlayer(ada, first, 'Ada');
  const adaUrl = ada.url();
  const joining = ada.waitForEvent('popup');
  await ada.getByRole('link', { name: 'Join as another person', exact: true }).click();
  const bea = await joining;
  await bea.getByLabel('Display name', { exact: true }).fill('Bea');
  await bea.getByRole('button', { name: 'Join event', exact: true }).click();
  await expect(bea.getByText('This tab: Bea', { exact: true })).toBeVisible();
  const beaUrl = bea.url();
  const credentials = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('podyguard.player.') || key.startsWith('podyguard.host.')));
  await ada.close();
  await bea.close();

  const second = await createConstructedEvent(page, { name: 'Recovery Sunday', baseModeLabel: 'Duel', commanderRules: false });
  const cal = await context.newPage();
  await joinAsPlayer(cal, second, 'Cal');
  await cal.close();
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Resume a player · 3 saved', exact: true })).toBeInViewport();
  await expect(page.getByRole('tab', { name: 'Host event', exact: true })).toBeInViewport();

  await page.getByRole('button', { name: 'Navigation menu', exact: true }).click();
  const recent = page.getByRole('navigation', { name: 'Recent events and invitations', exact: true });
  const firstCard = recent.getByRole('listitem').filter({ hasText: 'Recovery Friday' }).first();
  await firstCard.getByRole('link', { name: 'Resume a player · 2 saved', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recovery Friday', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue as Cal', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Main menu', exact: true }).click();
  await page.getByRole('button', { name: 'Navigation menu', exact: true }).click();
  const removeFriday = recent.getByRole('button', { name: /^Remove Recovery Friday/ });
  await expect(removeFriday).toHaveCount(2);
  for (let remaining = 2; remaining > 0; remaining--) {
    await removeFriday.first().click();
    await expect(removeFriday).toHaveCount(remaining - 1);
  }
  await expect(recent.getByText(/Recovery Friday/)).toHaveCount(0);
  await page.reload();
  await page.getByRole('link', { name: 'Resume a player · 3 saved', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recovery Friday', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recovery Sunday', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('saved-player-recovery-phone.png') });

  for (const [name, url] of [['Ada', adaUrl], ['Bea', beaUrl], ['Bea', beaUrl]]) {
    const popup = page.waitForEvent('popup');
    const link = page.getByRole('link', { name: `Continue as ${name}`, exact: true });
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await link.click();
    const restored = await popup;
    await expect(restored.getByText(`This tab: ${name}`, { exact: true })).toBeVisible();
    expect(restored.url()).toBe(url);
    await expect(page).toHaveURL(/#\/players$/);
    await restored.close();
  }
  for (const [key, value] of credentials) expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(value);
  const roster = (await (await page.request.get(`/api/events/${first}/participants`)).json()).participants;
  expect(roster.map((p: { displayName: string }) => p.displayName).sort()).toEqual(['Ada', 'Bea']);
});

test('saved-player recovery stays reachable with no saved players', async ({ page }) => {
  await prepareApp(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: /^Resume a player/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Navigation menu', exact: true }).click();
  await page.getByRole('link', { name: 'Players on this device', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Players on this device', exact: true })).toBeVisible();
  await expect(page.getByText('No saved players on this browser yet. Join an event to save your player here.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Main menu', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Start playing', exact: true })).toBeVisible();
});
