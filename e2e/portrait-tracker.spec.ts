import { expect, test, type Page } from './fixtures';
import { openQuickPlaySetup } from './helpers';

async function startPortraitDuel(page: Page) {
  await page.setViewportSize({ width: 390, height: 660 });
  await openQuickPlaySetup(page, { baseModeLabel: 'Duel', commanderRules: false });
  await page.getByPlaceholder('Player 1').fill('Ada');
  await page.getByPlaceholder('Player 2').fill('Bea');
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal starting player' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.evaluate(async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
  });
  await page.getByTitle('Show seat controls', { exact: true }).click();
  await page.getByTitle('Match menu', { exact: true }).click();
  const menu = page.getByRole('dialog', { name: 'Match menu', exact: true });
  await menu.getByRole('button', { name: 'Change layout', exact: true }).click();
  await menu.getByRole('button', { name: /^Portrait/ }).click();
  await expect(page.locator('[data-board-layout="portrait"]').first()).toBeVisible();
  await menu.getByRole('button', { name: 'Close', exact: true }).click();
}

test('portrait tracker centers the dungeon cards and keeps the full cards visible', async ({ page }) => {
  await startPortraitDuel(page);
  await page.getByTitle('Show seat controls', { exact: true }).click();
  await page.getByRole('button', { name: /^Dungeon and initiative for Ada/ }).click();
  const dungeon = page.getByRole('dialog', { name: 'Dungeon for Ada', exact: true });
  const cards = dungeon.getByRole('img');
  await expect(cards).toHaveCount(4);

  for (const viewport of [
    { width: 390, height: 660 },
    { width: 430, height: 540 },
  ]) {
    await page.setViewportSize(viewport);
    const [first, second, third, fourth] = await cards.evaluateAll(images =>
      images.map(image => {
        const { x, y, width, height } = image.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
    for (const card of [first!, second!, third!, fourth!]) {
      expect(Math.abs(card.width / card.height - 488 / 680)).toBeLessThan(0.02);
      expect(card.y).toBeGreaterThanOrEqual(0);
      expect(card.y + card.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(first!.y).toBeCloseTo(second!.y, 0);
    expect(third!.y).toBeCloseTo(fourth!.y, 0);
    expect(first!.x).toBeCloseTo(third!.x, 0);
    expect(second!.x).toBeCloseTo(fourth!.x, 0);
    expect(Math.abs(first!.x + second!.x + second!.width - viewport.width)).toBeLessThan(2);
  }

  await dungeon.getByRole('button', { name: 'Lost Mine of Phandelver', exact: true }).click();
  await expect(dungeon.getByRole('button', { name: /Cave Entrance/ })).toBeVisible();
  await dungeon.getByRole('button', { name: /Cave Entrance/ }).click();
  await expect(dungeon.locator('[aria-current="step"]')).toBeVisible();
  await dungeon.getByRole('button', { name: 'Close dungeon', exact: true }).click();
  await expect(dungeon).toHaveCount(0);
});

test('the portrait life keypad faces the selected player', async ({ page }) => {
  await startPortraitDuel(page);
  const upper = page.locator('article[data-seat-id]').nth(0);
  const lower = page.locator('article[data-seat-id]').nth(1);
  for (const { seat, action, player, digit, total, turned } of [
    { seat: upper, action: 'Add', player: 'Ada', digit: '5', total: '25', turned: true },
    { seat: lower, action: 'Remove', player: 'Bea', digit: '3', total: '17', turned: false },
  ]) {
    await seat.getByRole('button', { name: new RegExp(`^${action} 1 life`) }).click({ delay: 550 });
    const keypad = page.getByRole('dialog', { name: `${action} life for ${player}`, exact: true });
    await expect(keypad).toBeVisible();
    const one = await keypad.getByRole('button', { name: '1', exact: true }).boundingBox();
    const nine = await keypad.getByRole('button', { name: '9', exact: true }).boundingBox();
    expect(one!.x > nine!.x).toBe(turned);
    expect(one!.y > nine!.y).toBe(turned);
    await keypad.getByRole('button', { name: digit, exact: true }).click();
    await keypad.getByRole('button', { name: `${action} ${digit}`, exact: true }).click();
    await expect(seat.getByText(total, { exact: true })).toBeVisible();
  }
});
