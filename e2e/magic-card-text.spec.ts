import { expect, test } from './fixtures';
import { openQuickPlaySetup } from './helpers';

test('Magic Rules searches translated names, cleans saved data at startup, and reuses English text offline', async ({ page }, info) => {
  const card = { oracleId: 'bolt', name: 'Lightning Bolt', faces: [{ name: 'Lightning Bolt', manaCost: '{R}',
    typeLine: 'Instant', oracleText: 'Lightning Bolt deals 3 damage to any target.', power: '', toughness: '', loyalty: '', defense: '' }] };
  await page.addInitScript(card => {
    if (localStorage.getItem('card-cache-test-seeded')) return;
    localStorage.setItem('card-cache-test-seeded', 'yes');
    localStorage.setItem('podyguard.card-text.v1', JSON.stringify([
      { query: 'old-test', savedAt: Date.now(), cards: [{ ...card, image_uris: { normal: 'https://example.com/unwanted.jpg' },
        faces: [{ ...card.faces[0], image_uris: { normal: 'https://example.com/unwanted-face.jpg' } }] }] },
      { query: 'corrupt', savedAt: Date.now(), cards: [{ name: 'broken' }] },
    ]));
  }, card);
  let searches = 0;
  await page.route('**/api/scryfall/card-text?**', async route => {
    searches += 1;
    expect(new URL(route.request().url()).searchParams.get('q')).toBe('Foudre');
    await route.fulfill({ json: { cards: [card] } });
  });
  const imageRequests: string[] = [];
  let searchingCards = false;
  page.on('request', request => {
    if (/unwanted.*\.jpg/.test(request.url()) ||
        (searchingCards && /scryfall.*\.(jpg|png)/.test(request.url()))) imageRequests.push(request.url());
  });
  await openQuickPlaySetup(page, { baseModeLabel: 'Duel', commanderRules: false });
  const startupCache = await page.evaluate(() => localStorage.getItem('podyguard.card-text.v1'));
  expect(startupCache).not.toMatch(/image|corrupt|unwanted/);
  await page.getByPlaceholder('Player 1').fill('Ada');
  await page.getByPlaceholder('Player 2').fill('Bea');
  await page.getByRole('button', { name: 'Start game', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal starting player' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  async function openCards() {
    const controls = page.getByRole('button', { name: /^Show seat controls/ });
    if (await controls.isVisible()) await controls.click();
    await page.getByRole('button', { name: /Match menu/ }).click();
    await page.getByRole('button', { name: 'Magic Rules', exact: true }).click();
    await page.getByRole('tab', { name: 'Cards', exact: true }).click();
    searchingCards = true;
    await page.getByLabel('Card name (any language)').fill('Foudre');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText(card.faces[0]!.oracleText, { exact: true })).toBeVisible();
    searchingCards = false;
  }
  await openCards();
  expect(searches).toBe(1);
  await expect(page.getByRole('article').filter({ hasText: 'Lightning Bolt' }).locator('img')).toHaveCount(0);
  await info.attach('English-card-text', { body: await page.screenshot(), contentType: 'image/png' });
  await page.screenshot({ path: 'reports/ui-fixes/magic-card-text.png' });
  await page.unroute('**/api/scryfall/card-text?**');
  await page.route('**/api/scryfall/card-text?**', route => { searches += 1; return route.abort(); });
  await page.reload();
  await openCards();
  expect(searches).toBe(1);
  expect(imageRequests).toEqual([]);
  const saved = await page.evaluate(() => localStorage.getItem('podyguard.card-text.v1'));
  expect(saved).toContain(card.faces[0]!.oracleText);
  expect(saved).not.toContain('image');
  await page.getByRole('button', { name: 'Close Magic Rules' }).click();
  await expect(page.locator('article[data-seat-id]')).toHaveCount(2);
  await expect(page.getByText('20', { exact: true }).first()).toBeVisible();
});
