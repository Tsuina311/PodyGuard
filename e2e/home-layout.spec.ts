import { expect, test } from './fixtures';
import { openHome, openQuickPlaySetup } from './helpers';

for (const width of [320, 390, 768, 1280]) {
  test(`home controls stay reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openHome(page);
    await expect(page.getByRole('tab', { name: 'Start playing' })).toBeInViewport();
    await expect(page.getByRole('tab', { name: 'Host event' })).toBeInViewport();
    const account = page.getByRole('link', { name: 'My playgroups', exact: true });
    await expect(account).toHaveCount(0);
    await page.getByRole('button', { name: 'Navigation menu' }).click();
    await expect(account).toBeVisible();
    await account.click({ trial: true });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Switch to .* mode/ }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `/tmp/podyguard-home-${width}.png` });
  });
}

test('home summarizes the actual saved game and confirms cancellation', async ({
  page,
}) => {
  await openQuickPlaySetup(page, {
    baseModeLabel: 'Duel',
    commanderRules: false,
  });
  await page.getByPlaceholder('Player 1').fill('Ada');
  await page.getByPlaceholder('Player 2').fill('Bea');
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await page.waitForURL(/#\/match$/);
  // A hash change can precede React's commit and persistence effects. Leave
  // only after the tracker is rendered and its resumable game has been saved.
  await expect(
    page.getByRole('heading', { name: 'Ready to begin' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const details = JSON.parse(
          localStorage.getItem('podyguard.active-match.details') ?? 'null',
        );
        return {
          path: localStorage.getItem('podyguard.active-match'),
          players: details?.players,
          hasProgress: Boolean(
            details?.storageKey && localStorage.getItem(details.storageKey),
          ),
        };
      }),
    )
    .toEqual({ path: '/match', players: ['Ada', 'Bea'], hasProgress: true });
  await page.goto('/');
  const card = page.getByRole('region', { name: 'ongoing game' });
  await expect(card).toContainText('Ada, Bea');
  await expect(card).toContainText('duel');
  await card.getByRole('button', { name: 'Resume game' }).click();
  await page.waitForURL(/#\/match$/);
  // A hash change can precede React's commit and persistence effects. Leave
  // only after the tracker is rendered and its resumable game has been saved.
  await expect(
    page.getByRole('heading', { name: 'Ready to begin' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const details = JSON.parse(
          localStorage.getItem('podyguard.active-match.details') ?? 'null',
        );
        return {
          path: localStorage.getItem('podyguard.active-match'),
          players: details?.players,
          hasProgress: Boolean(
            details?.storageKey && localStorage.getItem(details.storageKey),
          ),
        };
      }),
    )
    .toEqual({ path: '/match', players: ['Ada', 'Bea'], hasProgress: true });
  await page.goto('/');
  await card.getByRole('button', { name: 'Cancel game', exact: true }).click();
  await card.getByRole('button', { name: 'Keep game' }).click();
  await expect(card.getByRole('button', { name: 'Resume game' })).toBeVisible();
  await card.getByRole('button', { name: 'Cancel game', exact: true }).click();
  await card.getByRole('button', { name: 'Discard game', exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Resume game' })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) =>
        key.startsWith('podyguard.tracker.sandbox.'),
      ),
    ),
  ).toEqual([]);
});

test('Playgroups remains reachable for a signed-in account with a long name', async ({
  page,
  request,
}) => {
  const demo = await (await request.get('/test/demo')).json();
  const name = 'AlexandraVeryLongAccountDisplayNameForOurPlaygroup';
  await page.addInitScript(
    (session) =>
      localStorage.setItem(
        'podyguard.account.session',
        JSON.stringify(session),
      ),
    { token: demo.token, account: { ...demo.account, displayName: name } },
  );
  await page.setViewportSize({ width: 320, height: 844 });
  await openHome(page);
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Navigation menu' }).click();
  const account = page.getByRole('link', { name: 'My playgroups', exact: true });
  await expect(account).toBeVisible();
  await account.click({ trial: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('saved event shortcuts show dates and can be removed from this device’s list', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await openHome(page);
  await page.evaluate(() => {
    localStorage.setItem('podyguard.host.AB23CD', 'test-saved-host');
    localStorage.setItem('podyguard.player.XY23AB', 'test-saved-player');
    localStorage.setItem('podyguard.recent-events', JSON.stringify([
      { path: '/host/AB23CD', name: 'Friday Commander', seenAt: Date.UTC(2026, 10, 20, 12) },
    ]));
  });
  const openMenu = () => page.getByRole('button', { name: 'Navigation menu' }).click();
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Start playing' })).toBeInViewport();
  await expect(page.getByRole('tab', { name: 'Host event' })).toBeInViewport();
  const list = page.getByRole('navigation', { name: 'Recent events and invitations' });
  await expect(list).toHaveCount(0);
  await openMenu();
  const host = list.getByRole('listitem').filter({ hasText: 'Friday Commander' });
  const player = list.getByRole('listitem').filter({ hasText: 'XY23AB' });
  await expect(host.locator('time')).toHaveAttribute('datetime', '2026-11-20T12:00:00.000Z');
  await expect(host.locator('time')).toContainText(/Saved .*2026/);
  await expect(player).toContainText('Date unavailable');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await host.getByRole('button', { name: /Remove Friday Commander/ }).click();
  await expect(host).toHaveCount(0);
  await expect(player).toBeVisible();
  await page.reload();
  await openMenu();
  await expect(player).toBeVisible();
  await expect(host).toHaveCount(0);
  await player.getByRole('button', { name: /Remove XY23AB/ }).click();
  await expect(list).toHaveCount(0);
  await page.reload();
  await openMenu();
  await expect(list).toHaveCount(0);
  const credentials = await page.evaluate(() => [
    localStorage.getItem('podyguard.host.AB23CD'),
    localStorage.getItem('podyguard.player.XY23AB'),
  ]);
  expect(credentials).toEqual(['test-saved-host', 'test-saved-player']);
});
