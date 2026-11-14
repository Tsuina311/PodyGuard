import { expect, test, type Page } from './fixtures';
import { openQuickPlaySetup } from './helpers';

export async function prepareOfflineGame(page: Page, homeUrl?: string) {
  await openQuickPlaySetup(page, {
    baseModeLabel: 'Duel',
    commanderRules: false,
    homeUrl,
  });
  await page.getByPlaceholder('Player 1').fill('Ada');
  await page.getByPlaceholder('Player 2').fill('Bea');
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal starting player' }).click();
  await page
    .getByRole('button', { name: /^Remove 1 life/ })
    .first()
    .click();
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
    const names = (await caches.keys()).filter((key) =>
      key.startsWith('podyguard-shell-'),
    );
    return Promise.all(
      names.map(async (name) => ({
        name,
        urls: (await (await caches.open(name)).keys()).map(
          (request) => request.url,
        ),
      })),
    );
  });
  await test
    .info()
    .attach('offline-cache', {
      body: JSON.stringify(cached),
      contentType: 'application/json',
    });
  expect(
    cached
      .flatMap((cache) => cache.urls)
      .some((url) => /\/assets\/.*\.js$/.test(url)),
  ).toBe(true);
}

export async function expectRecoveredGame(page: Page) {
  await expect(page.getByText('19', { exact: true }).first()).toBeVisible();
  const remove = page.getByRole('button', { name: /^Remove 1 life/ }).first();
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(page.getByText('18', { exact: true }).first()).toBeVisible();
}
