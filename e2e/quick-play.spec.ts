import { expect, test } from '@playwright/test';
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

    await page
      .getByRole('button', { name: 'Reveal starting player' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Ready to begin' }),
    ).toHaveCount(0);
    // Life board is live (classic duel starts at 20). Seat labels can be
    // rotated off the "readable" axis during the first-player spotlight.
    await expect(page.getByText('20', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  });
});
