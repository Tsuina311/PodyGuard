import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { openQuickPlaySetup } from './helpers';

test.describe('quick play', () => {
  test('classic duel: home → setup → ready to begin → reveal first player', async ({
    page,
  }) => {
    await openQuickPlaySetup(page, {
      baseModeLabel: 'Duel',
      commanderRules: false,
    });

    await expect(page.getByText('Duel', { exact: true }).first()).toBeVisible();
    await page.getByPlaceholder('Player 1').fill('Ada');
    await page.getByPlaceholder('Player 2').fill('Bea');

    await page.getByRole('button', { name: 'Start game', exact: true }).click();
    await page.waitForURL(/#\/match$/);
    await expect(
      page.getByRole('heading', { name: 'Ready to begin' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Reveal starting player' }).click();
    await expect(
      page.getByRole('heading', { name: 'Ready to begin' }),
    ).toHaveCount(0);
    // Life board is live (classic duel starts at 20). Seat labels can be
    // rotated off the "readable" axis during the first-player spotlight.
    await expect(page.getByText('20', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
});

test('a saved local game cold-starts offline with its shell and assets', async ({
  page,
  context,
}) => {
  await openQuickPlaySetup(page, {
    baseModeLabel: 'Duel',
    commanderRules: false,
  });
  await page.getByPlaceholder('Player 1').fill('Ada');
  await page.getByPlaceholder('Player 2').fill('Bea');
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal starting player' }).click();
  const remove = page.getByRole('button', { name: /^Remove 1 life/ }).first();
  await remove.click();
  await expect(page.getByText('19', { exact: true }).first()).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => resolve(),
          { once: true },
        ),
      );
  });
  const cached = await page.evaluate(async () => {
    const names = (await caches.keys()).filter(key => key.startsWith('podyguard-shell-'));
    return Promise.all(names.map(async name => ({ name, urls: (await (await caches.open(name)).keys()).map(request => request.url) })));
  });
  await test.info().attach('offline-cache', { body: JSON.stringify(cached), contentType: 'application/json' });
  expect(cached.flatMap(cache => cache.urls).some(url => /\/assets\/.*\.js$/.test(url))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('19', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: /^Remove 1 life/ }).first(),
  ).toBeVisible();
  await context.setOffline(false);
});
