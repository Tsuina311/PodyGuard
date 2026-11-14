import { expect, test } from './fixtures';
import { prepareApp } from './helpers';

test('demo account remembers friends, commanders, results and opponents after a fresh browser session', async ({ browser, request }) => {
  const response = await request.get('/test/demo');
  expect(response.ok()).toBe(true);
  const demo = await response.json();
  for (let visit = 0; visit < 2; visit++) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    try {
      const page = await context.newPage();
      await prepareApp(page);
      await page.addInitScript(session => localStorage.setItem('podyguard.account.session', JSON.stringify(session)), { token: demo.token, account: demo.account });
      await page.goto('/#/account');
      await expect(page.getByText('Demo Friday Friends', { exact: true }).first()).toBeVisible();
      const overview = await request.get(`/api/playgroups/${demo.playgroup.id}`, { headers: { Authorization: `Bearer ${demo.token}` } });
      expect(overview.ok()).toBe(true);
      const { guests, recordedGamesCount } = (await overview.json()).overview;
      expect(recordedGamesCount).toBe(1);
      expect(guests).toHaveLength(4);
      for (const guest of guests) {
        expect(guest.savedDecks).toHaveLength(1);
        expect(guest.stats.gamesPlayed).toBe(1);
        expect(guest.stats.mostPlayedWith).toHaveLength(3);
        expect(guest.stats.wins).toBe(guest.guest.displayName === 'Ada' ? 1 : 0);
        expect(guest.stats.losses).toBe(guest.guest.displayName === 'Ada' ? 0 : 1);
      }
    } finally { await context.close(); }
  }
});

test('admin can inspect demo results and lock the console', async ({ page }, info) => {
  await prepareApp(page);
  await page.goto('/#/admin');
  await page.getByLabel('Admin access token').fill('wrong-token');
  await page.getByRole('button', { name: 'Open administration' }).click();
  await expect(page.getByRole('alert')).toContainText('denied');
  await page.getByLabel('Admin access token').fill('local-demo-admin-token-not-for-production');
  await page.getByRole('button', { name: 'Open administration' }).click();
  await page.getByRole('button', { name: 'Demo Friday Friends', exact: true }).click();
  const details = page.getByRole('region', { name: 'Playgroup details' });
  await expect(details).toContainText('4 players · 1 recorded games');
  await expect(details).toContainText('Muldrotha, the Gravetide');
  await expect(details).toContainText('1 wins · 0 losses');
  await expect(details).toContainText('0 wins · 1 losses');
  await expect(details).toContainText('Bea (1)');
  await info.attach('admin-demo', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.getByRole('button', { name: 'Lock administration' }).click();
  await expect(details).toHaveCount(0);
  await expect(page.getByLabel('Admin access token')).toHaveValue('');
});
