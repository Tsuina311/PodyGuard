import { expect, test } from './fixtures';
import { openHome, openQuickPlaySetup } from './helpers';

for (const width of [320, 390, 768, 1280]) {
  test(`home controls stay reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openHome(page);
    const account = page.getByRole('link', {
      name: 'Host Account & Playgroups',
    });
    await expect(account).toBeVisible();
    await account.click({ trial: true });
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
  await page.goto('/');
  const card = page.getByRole('region', { name: 'ongoing game' });
  await expect(card).toContainText('Ada, Bea');
  await expect(card).toContainText('duel');
  await card.getByRole('button', { name: 'Resume game' }).click();
  await page.waitForURL(/#\/match$/);
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

test('a long account name remains visible and clickable on a narrow phone', async ({
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
  const account = page.getByRole('link', { name: `${name} · Playgroups` });
  await expect(account).toBeVisible();
  await account.click({ trial: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
