import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { openQuickPlaySetup } from './helpers';
import { prepareOfflineGame, expectRecoveredGame } from './offline-game';
import { createOutageOrigin } from './origin-outage';

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [
    { name: 'phone', width: 390, height: 844 },
    { name: 'wide', width: 1280, height: 800 },
  ]) {
    test(`classic duel (${theme}, ${viewport.name}): setup → reveal → accessible tracker`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.addInitScript(
        (theme) => localStorage.setItem('podyguard-theme', theme),
        theme,
      );
      await openQuickPlaySetup(page, {
        baseModeLabel: 'Duel',
        commanderRules: false,
      });
      await expect(
        page.getByText('Duel', { exact: true }).first(),
      ).toBeVisible();
      await page.getByPlaceholder('Player 1').fill('Ada');
      await page.getByPlaceholder('Player 2').fill('Bea');
      await page
        .getByRole('button', { name: 'Start game', exact: true })
        .click();
      await page.waitForURL(/#\/match$/);
      await expect(
        page.getByRole('heading', { name: 'Ready to begin' }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Reveal starting player' })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Ready to begin' }),
      ).toHaveCount(0);
      await expect(page.getByText('20', { exact: true }).first()).toBeVisible();
      const start = page.getByRole('button', { name: 'Start', exact: true });
      await expect(start).toBeVisible();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      // Hover is a separate visual state and must also retain readable text.
      await start.hover();
      expect(
        (
          await new AxeBuilder({ page })
            .include('button[aria-label="Start"]')
            .withTags(['wcag2aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
    });
  }
}

test('a saved local game cold-starts when its origin becomes unreachable', async ({
  page,
  request,
  baseURL,
}) => {
  const origin = await createOutageOrigin(baseURL!);
  try {
    await prepareOfflineGame(page, origin.url);
    await origin.disconnect();
    // Prove the browser-facing server really stopped; no request interception
    // supplies a fake successful document or asset response.
    await expect(
      request.get(origin.url, { timeout: 2000, maxRetries: 0 }),
    ).rejects.toThrow();
    await page.reload();
    await expectRecoveredGame(page);
  } finally {
    await origin.disconnect();
  }
});
