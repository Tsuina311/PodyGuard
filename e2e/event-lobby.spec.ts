import { expect, test } from './fixtures';
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
    await page.getByRole('tab', { name: 'Settings', exact: true }).click();
    await expect(page.getByText('Pod sizes', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Tables', exact: true }).click();
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

    await playerA.getByRole('button', { name: 'Reveal starting player' }).click();
    await playerA.getByRole('button', { name: 'Start', exact: true }).click();
    await playerA.getByTitle('Show seat controls', { exact: true }).click();
    await playerA.getByTitle('Match menu', { exact: true }).click();
    await playerA.getByRole('button', { name: 'Share live tracker', exact: true }).click();
    const viewingLink = playerA.getByRole('link', { name: 'Open read-only tracker' });
    await expect(viewingLink).toBeVisible();
    await expect(playerB.getByRole('button', { name: 'Read-only mode', exact: true })).toBeVisible();
    await playerB.getByRole('button', { name: 'Read-only mode', exact: true }).click();
    await expect(playerB.getByLabel('Ada: 20 life', { exact: true })).toBeVisible();
    await expect(playerB.getByRole('button', { name: /Add 1 life|Remove 1 life/ })).toHaveCount(0);
    await playerA.getByRole('button', { name: 'Close match menu' }).click();
    await playerA.getByRole('button', { name: /Remove 1 life/ }).first().click();
    await expect(playerB.getByLabel('Ada: 19 life', { exact: true })).toBeVisible();
    await playerB.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(playerB.getByText('Match found')).toBeVisible();
    await expect(playerB.getByRole('button', { name: 'Read-only mode', exact: true })).toBeVisible();
    await expect(playerB.getByRole('heading', { name: 'Ready to begin' })).toHaveCount(0);

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
