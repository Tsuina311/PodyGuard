import { expect, test } from '@playwright/test';
import {
  createConstructedEvent,
  createLimitedEvent,
  joinAsPlayer,
} from './helpers';

test.describe('event screens — constructed vs Limited', () => {
  test('duel-commander host opens constructed desk, not Limited Swiss', async ({
    page,
  }) => {
    const code = await createConstructedEvent(page, {
      name: 'E2E Duel Commander',
      baseModeLabel: 'Duel',
      commanderRules: true,
    });

    await expect(page.getByText('Duel Commander').first()).toBeVisible();
    await expect(page.getByText('Pod sizes', { exact: true })).toBeVisible();
    await expect(page.getByText('Limited pairing', { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText('Limited event desk')).toHaveCount(0);
    await expect(page.getByText('Booster Draft')).toHaveCount(0);
    expect(code.length).toBeGreaterThanOrEqual(4);
  });

  test('classic multiplayer host opens constructed desk', async ({ page }) => {
    await createConstructedEvent(page, {
      name: 'E2E Multiplayer',
      baseModeLabel: 'Multiplayer',
      commanderRules: false,
    });

    await expect(page.getByText('Pod sizes', { exact: true })).toBeVisible();
    await expect(page.getByText('Limited pairing', { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByText('Limited event desk')).toHaveCount(0);
  });

  test('booster draft host opens Limited desk (Swiss pairing)', async ({
    page,
  }) => {
    await createLimitedEvent(page, {
      name: 'E2E Booster Draft',
      formatLabel: 'Booster Draft',
    });

    await expect(page.getByText('Limited pairing', { exact: true })).toBeVisible();
    await expect(page.getByText('Limited event desk')).toBeVisible();
    await expect(page.getByText('Booster Draft').first()).toBeVisible();
    await expect(page.getByText('Pod sizes', { exact: true })).toHaveCount(0);
  });

  test('sealed host opens Limited desk', async ({ page }) => {
    await createLimitedEvent(page, {
      name: 'E2E Sealed',
      formatLabel: 'Sealed',
    });

    await expect(page.getByText('Limited pairing', { exact: true })).toBeVisible();
    await expect(page.getByText('Limited event desk')).toBeVisible();
    await expect(page.getByText('Sealed').first()).toBeVisible();
    await expect(page.getByText('Pod sizes', { exact: true })).toHaveCount(0);
  });

  test('duel-commander player join form is constructed (decks), not Limited', async ({
    page,
    browser,
  }) => {
    const code = await createConstructedEvent(page, {
      name: 'E2E DC Player',
      baseModeLabel: 'Duel',
      commanderRules: true,
    });

    const player = await browser.newPage();
    await player.addInitScript(() => {
      window.localStorage.setItem('podyguard-lang', 'en');
    });
    await player.goto(`/#/e/${code}`);
    await player.waitForURL(/#\/e\//i);
    const wake = player.getByRole('heading', { name: 'Waking the tables' });
    if (await wake.count()) {
      await expect(wake).toHaveCount(0, { timeout: 45_000 });
    }
    await expect(
      player.getByText('Limited events only need your name'),
    ).toHaveCount(0);
    await expect(player.getByText('Commander decks')).toBeVisible();
    await expect(player.getByText('Limited', { exact: true })).toHaveCount(0);
    await expect(player.getByText('Booster Draft')).toHaveCount(0);
    await player.close();
  });

  test('limited player sees Limited panel after join', async ({
    page,
    browser,
  }) => {
    const code = await createLimitedEvent(page, {
      name: 'E2E Draft Player',
      formatLabel: 'Booster Draft',
    });

    const player = await browser.newPage();
    await joinAsPlayer(player, code, 'Bea');

    await expect(
      player.getByText('Limited', { exact: true }).first(),
    ).toBeVisible();
    await expect(player.getByText('Booster Draft').first()).toBeVisible();
    await expect(
      player.getByText('Limited events only need your name'),
    ).toHaveCount(0);
    await player.close();
  });
});
