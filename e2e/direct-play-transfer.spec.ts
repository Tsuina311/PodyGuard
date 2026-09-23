import { expect, test } from '@playwright/test';
import { encodePlayPayloadFromStoredConfig } from './encode-play';
import { dismissWakeIfPresent, openQuickPlaySetup, prepareApp } from './helpers';

test.describe('direct-play phone transfer', () => {
  test('receiver opens ?play= into tracker with shared seat names', async ({
    page,
    browser,
    baseURL,
  }) => {
    await openQuickPlaySetup(page, {
      baseModeLabel: 'Duel',
      commanderRules: false,
    });
    await page.getByPlaceholder('Player 1').fill('Sender Ada');
    await page.getByPlaceholder('Player 2').fill('Sender Bea');

    await page.getByRole('button', { name: 'Use other device' }).click();
    await expect(
      page.getByText(/Setup stays on this device until you start locally/i),
    ).toBeVisible();

    const raw = await page.evaluate(() =>
      window.localStorage.getItem('podyguard.match.config'),
    );
    expect(raw).toBeTruthy();
    const names = JSON.parse(raw!) as { names: string[] };
    expect(names.names[0]).toBe('Sender Ada');
    expect(names.names[1]).toBe('Sender Bea');

    const payload = encodePlayPayloadFromStoredConfig(raw!);
    const playUrl = `${baseURL}/?play=${encodeURIComponent(payload)}`;

    // Sender stays on setup — has not started locally.
    await expect(page.getByRole('heading', { name: 'Game setup' })).toBeVisible();

    const receiver = await browser.newPage();
    await prepareApp(receiver);
    await receiver.goto(playUrl);
    await receiver.waitForURL(/#\/match/);
    await dismissWakeIfPresent(receiver);

    await expect(
      receiver.getByRole('heading', { name: 'Ready to begin' }),
    ).toBeVisible();
    await receiver
      .getByRole('button', { name: 'Reveal starting player' })
      .click();
    await expect(
      receiver.getByRole('heading', { name: 'Ready to begin' }),
    ).toHaveCount(0);
    await expect(receiver.getByText('20', { exact: true }).first()).toBeVisible();

    await receiver.close();
  });
});
