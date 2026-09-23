import { expect, test } from '@playwright/test';
import {
  createConstructedEvent,
  dismissWakeIfPresent,
  joinAsPlayer,
  markPlayerReady,
  prepareApp,
} from './helpers';

test.describe('event lobby — join, match, tracker', () => {
  test('classic duel: two players ready → host match/start → tracker', async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);

    const code = await createConstructedEvent(page, {
      name: 'E2E Lobby Duel',
      baseModeLabel: 'Duel',
      commanderRules: false,
    });
    await expect(page.getByText('Pod sizes', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Match now' })).toBeVisible();

    const playerA = await browser.newPage();
    const playerB = await browser.newPage();

    await joinAsPlayer(playerA, code, 'Ada');
    await markPlayerReady(playerA);

    await joinAsPlayer(playerB, code, 'Bea');
    await markPlayerReady(playerB);

    await expect(page.getByText('Ada').first()).toBeVisible();
    await expect(page.getByText('Bea').first()).toBeVisible();
    await expect(page.getByText('2 ready', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Match now' }).click();
    await expect(page.getByRole('button', { name: 'Start game' }).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole('button', { name: 'Start game' }).first().click();

    for (const player of [playerA, playerB]) {
      await expect(player.getByText('Match found')).toBeVisible({
        timeout: 20_000,
      });
      await expect(
        player.getByRole('button', { name: 'Use game tracker' }),
      ).toBeVisible();
    }

    await playerA.getByRole('button', { name: 'Use game tracker' }).click();
    await expect(
      playerA.getByRole('heading', { name: 'Ready to begin' }),
    ).toBeVisible();

    await playerA.close();
    await playerB.close();
  });

  test('join deep link ?join= opens the take-a-seat screen', async ({
    page,
    browser,
    baseURL,
  }) => {
    const code = await createConstructedEvent(page, {
      name: 'E2E Join Link',
      baseModeLabel: 'Duel',
      commanderRules: false,
    });

    const player = await browser.newPage();
    await prepareApp(player);
    await player.goto(`${baseURL}/?join=${code}`);
    await player.waitForURL(/#\/e\//i);
    await dismissWakeIfPresent(player);

    await expect(player.getByLabel('Display name')).toBeVisible();
    await expect(player.getByRole('button', { name: 'Join event' })).toBeVisible();
    await expect(
      player.getByText('Limited events only need your name'),
    ).toHaveCount(0);

    await player.close();
  });
});
