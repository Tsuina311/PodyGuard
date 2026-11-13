import { expect, test } from './fixtures';
import { openQuickPlaySetup } from './helpers';

test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });

test('a four-player landscape game faces each player and keeps controls correct after rotation', async ({ page }, info) => {
  const card = { oracleId: 'orientation-giada', cardId: 'orientation-giada', name: 'Giada, Font of Hope',
    typeLine: 'Legendary Creature — Angel', oracleText: 'Flying, vigilance', keywords: ['Flying', 'Vigilance'],
    artCropUri: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><defs><linearGradient id="a"><stop stop-color="#113552"/><stop offset="1" stop-color="#806538"/></linearGradient></defs><rect width="600" height="400" fill="url(#a)"/><path d="M50 350L300 50L550 350" fill="none" stroke="#ddd" stroke-opacity=".35" stroke-width="12"/></svg>') };
  await page.route('**/api/scryfall/commanders?**', route => route.fulfill({ json: { cards: [card] } }));
  await page.route('**/api/scryfall/artwork?**', route => route.fulfill({ json: { artwork: [] } }));
  await openQuickPlaySetup(page, { baseModeLabel: 'Multiplayer', commanderRules: true });
  for (const [index, name] of ['Ada', 'Bea', 'Cam', 'Dee'].entries()) {
    await page.getByLabel(`Player ${index + 1}`, { exact: true }).fill(name);
    await page.getByLabel('Commander', { exact: true }).first().fill('Giada');
    await page.getByRole('button', { name: /Giada, Font of Hope.*Legendary/ }).click();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal starting player', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const seats = page.locator('article[data-seat-id]');
  await expect(seats).toHaveCount(4);

  async function seatAngles() {
    return seats.evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element.firstElementChild!);
      const rotate = style.rotate !== 'none' ? parseFloat(style.rotate) : 0;
      const transform = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);
      return ((Math.round(rotate + Math.atan2(transform.b, transform.a) * 180 / Math.PI) % 360) + 360) % 360;
    }));
  }
  await expect.poll(seatAngles).toEqual([180, 180, 0, 0]);
  // The selected first player has a short landing animation. Measure the final
  // board, rather than asserting exact row coordinates during that animation.
  await expect.poll(() => seats.evaluateAll(elements => {
    const boxes = elements.map(element => element.getBoundingClientRect());
    return Math.max(Math.abs(boxes[0]!.y - boxes[1]!.y), Math.abs(boxes[2]!.y - boxes[3]!.y));
  })).toBeLessThan(0.1);
  const boxes = await seats.evaluateAll(elements => elements.map(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  }));
  expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(1);
  expect(Math.abs(boxes[2]!.y - boxes[3]!.y)).toBeLessThan(1);
  expect(boxes[0]!.y).toBeLessThan(boxes[2]!.y);
  expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
  await page.screenshot({ path: info.outputPath('commander-landscape.png') });
  await info.attach('four-player-landscape', { body: await page.screenshot(), contentType: 'image/png' });

  await seats.nth(0).getByRole('button', { name: /^Remove 1 life/ }).click();
  await expect(seats.nth(0).getByText('39', { exact: true })).toBeVisible();
  await seats.nth(2).getByRole('button', { name: /^Add 1 life/ }).click();
  await expect(seats.nth(2).getByText('41', { exact: true })).toBeVisible();
  await expect(seats.nth(1).getByText('40', { exact: true })).toBeVisible();
  await expect(seats.nth(3).getByText('40', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(seatAngles).toEqual([0, 0, 0, 0]);
  await expect(seats.nth(0).getByText('39', { exact: true })).toBeVisible();
  await expect(seats.nth(2).getByText('41', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(seatAngles).toEqual([180, 180, 0, 0]);

  await page.getByRole('button', { name: /^Show seat controls/ }).click();
  await page.getByRole('button', { name: 'Open counters for Ada', exact: true }).click();
  const topCounters = page.getByRole('dialog', { name: 'Counters for Ada', exact: true });
  await expect(topCounters).toBeVisible();
  await expect.poll(() => topCounters.evaluate(element => getComputedStyle(element).rotate)).toBe('180deg');
  await page.getByRole('button', { name: 'Close counters', exact: true }).click();
  await page.getByRole('button', { name: 'Open counters for Cam', exact: true }).click();
  const bottomCounters = page.getByRole('dialog', { name: 'Counters for Cam', exact: true });
  await expect(bottomCounters).toBeVisible();
  expect(await bottomCounters.evaluate(element => getComputedStyle(element).rotate)).not.toBe('180deg');
  await page.getByRole('button', { name: 'Close counters', exact: true }).click();
  await page.screenshot({ path: info.outputPath('commander-landscape-after-rotation.png') });
});
