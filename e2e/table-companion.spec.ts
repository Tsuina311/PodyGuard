import { expect, test } from './fixtures';
import { openQuickPlaySetup, prepareApp } from './helpers';
test.describe('touch form controls', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('uses iPhone-safe font sizes before focusing Limited setup fields', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareApp(page);
    await page.route('**/api/health', route => route.fulfill({ json: { ok: true, database: 'up' } }));
    await page.goto('/');
    await page.getByRole('tab', { name: 'Host event' }).click();
    await page.getByRole('tab', { name: 'Limited' }).click();

    const match = page.getByRole('combobox', { name: 'Match', exact: true });
    const minutes = page.getByRole('spinbutton', { name: 'Round minutes', exact: true });
    for (const field of [match, minutes]) {
      await expect(field).toHaveCSS('font-size', '16px');
    }
    const initialScale = await page.evaluate(() => window.visualViewport?.scale);
    await minutes.tap();
    await expect(minutes).toBeFocused();
    expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(initialScale);
  });
});

test('a second phone follows a quick game read-only, uses tools, and sees sharing stop', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openQuickPlaySetup(page, {
    baseModeLabel: 'Duel',
    commanderRules: false,
  });
  await page.getByPlaceholder('Player 1').fill('Ada');
  await page.getByPlaceholder('Player 2').fill('Bea');
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal starting player' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByTitle('Show seat controls', { exact: true }).click();
  await page.getByTitle('Match menu', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Fullscreen', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect
    .poll(
      async () =>
        Boolean(await page.evaluate(() => document.fullscreenElement)) ||
        (await page.getByText(/On iPad, use Safari/).isVisible()),
    )
    .toBe(true);
  if (await page.evaluate(() => Boolean(document.fullscreenElement))) {
    await page
      .getByRole('button', { name: 'Exit fullscreen', exact: true })
      .click();
  } else {
    await page.getByRole('button', { name: 'Close screen help' }).click();
  }
  await page
    .getByRole('button', { name: 'Keep screen awake', exact: true })
    .click();
  await expect(page.getByText(/On iPad, use Safari/)).toBeVisible();
  await page.getByRole('button', { name: 'Close screen help' }).click();
  await page
    .getByRole('button', { name: 'Share live tracker', exact: true })
    .click();
  const link = page.getByRole('link', { name: 'Open read-only tracker' });
  await expect(link).toBeVisible();
  await expect
    .poll(async () => {
      const pause = await page
        .getByRole('button', { name: 'Pause', exact: true })
        .boundingBox();
      const arrange = await page
        .getByRole('button', { name: 'Rearrange seats', exact: true })
        .boundingBox();
      return Boolean(pause && arrange && pause.y + pause.height <= arrange.y);
    })
    .toBe(true);
  await page.screenshot({ path: '/tmp/podyguard-tablet-sharing.png' });
  const url = await link.getAttribute('href');
  expect(url).toBeTruthy();
  const viewerContext = await browser.newContext({
    serviceWorkers: 'block',
    viewport: { width: 390, height: 844 },
  });
  try {
    const viewer = await viewerContext.newPage();
    await prepareApp(viewer);
    await viewer.goto(url!);
    await expect(
      viewer.getByLabel('Ada: 20 life', { exact: true }),
    ).toBeVisible();
    await expect(
      viewer.getByRole('button', { name: /Add 1 life|Remove 1 life/ }),
    ).toHaveCount(0);
    await viewer.screenshot({ path: '/tmp/podyguard-companion-phone.png' });
    await page.getByRole('button', { name: 'Close match menu' }).click();
    await page
      .getByRole('button', { name: /Remove 1 life/ })
      .first()
      .click();
    await expect(
      viewer.getByLabel('Ada: 19 life', { exact: true }),
    ).toBeVisible();
    await viewer
      .getByRole('link', {
        name: 'Magic Rules & card translation',
        exact: true,
      })
      .click();
    await expect(
      viewer.getByRole('heading', { name: 'Magic Rules', exact: true }),
    ).toBeVisible();
    await viewer.getByRole('tab', { name: 'Cards', exact: true }).click();
    await expect(viewer.getByLabel('Card name (any language)')).toBeVisible();
    await viewer.goBack();
    await expect(
      viewer.getByLabel('Ada: 19 life', { exact: true }),
    ).toBeVisible();
    await viewer.reload();
    await expect(
      viewer.getByLabel('Ada: 19 life', { exact: true }),
    ).toBeVisible();
    await page.getByTitle('Show seat controls', { exact: true }).click();
    await page.getByTitle('Match menu', { exact: true }).click();
    await page
      .getByRole('button', { name: 'Stop sharing', exact: true })
      .click();
    await expect(viewer.getByRole('status')).toContainText(
      'totals may be out of date',
    );
  } finally {
    await viewerContext.close();
  }
});

test('rules and card tools are available from home without starting a game', async ({
  page,
}) => {
  await prepareApp(page);
  await page.goto('/');
  await page
    .getByRole('link', {
      name: 'Magic Rules and card translation',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Magic Rules', exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Cards', exact: true }).click();
  await expect(page.getByLabel('Card name (any language)')).toBeVisible();
  await page
    .getByRole('button', { name: 'Close Magic Rules', exact: true })
    .click();
  await expect(
    page.getByRole('tab', { name: 'Start playing', exact: true }),
  ).toBeVisible();
});
