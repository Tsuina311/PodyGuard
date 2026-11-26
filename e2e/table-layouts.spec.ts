import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { openHome, prepareApp } from './helpers';

test('phone: a quick draft uses one eight-seat table then 4 + 2 + 2 playing seats', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  await page.getByRole('tab', { name: 'Limited', exact: true }).click();
  const draft = page.getByRole('group', { name: 'Drafting tables', exact: true });
  const play = page.getByRole('group', { name: 'Playing tables', exact: true });
  await expect(draft.getByRole('combobox', { name: 'Table 1 seats' })).toHaveValue('8');
  await expect(draft.getByRole('spinbutton')).toHaveCount(0);
  const count = play.getByRole('spinbutton');
  await count.fill('');
  await expect(count).toHaveValue('');
  await count.press('3');
  await expect(count).toHaveValue('3');
  await play.getByRole('combobox', { name: 'Table 1 seats' }).selectOption('4');
  await play.getByRole('combobox', { name: 'Table 2 shape' }).selectOption('rectangle');
  await play.getByRole('combobox', { name: 'Table 3 shape' }).selectOption('round');
  await expect(play.getByText('Part A: 2 players · Part B: 2 players')).toBeVisible();
  await expect(play.getByText('8 of 8 playing seats used')).toBeVisible();
  await expect(play.getByRole('combobox', { name: 'Table 1 seats' }).locator('option[value="5"]')).toBeDisabled();
  const preview = play.getByRole('img', { name: 'Square table with 4 seats' });
  for (const area of ['A', 'B']) {
    const group = preview.locator(`g[data-area="${area}"]`);
    await expect(group).toHaveText(`${area} · 2`);
    await expect(group.locator('[data-playmat]')).toHaveCount(2);
    const [first, second] = await group.locator('[data-playmat]').evaluateAll(mats => mats.map(mat => ({
      x: mat.getAttribute('x'), y: mat.getAttribute('y'),
    })));
    expect(first!.x).toBe(second!.x);
    expect(first!.y).not.toBe(second!.y);
  }
  await expect(preview.locator('line')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('limited-table-planner-phone.png'), fullPage: true });
  await page.getByRole('button', { name: 'Start limited pod', exact: true }).click();
  await page.getByRole('button', { name: 'Seat and start draft', exact: true }).click();
  await page.getByRole('button', { name: /^Finish draft/ }).click();
  await page.getByRole('button', { name: 'Start round 1', exact: true }).click();
  for (const label of ['Table 1 · Part A', 'Table 1 · Part B', 'Table 2', 'Table 3']) await expect(page.getByText(label, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Table 1 · Part B', { exact: true })).toBeVisible();
});

test('host: select all twenty physical tables, then customize a seven-seat Commander table', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  await page.getByRole('tab', { name: 'Host event', exact: true }).click();
  const play = page.getByRole('group', { name: 'Playing tables', exact: true });
  await play.getByRole('spinbutton').fill('20');
  await play.getByText('Edit several tables', { exact: true }).click();
  await play.getByRole('button', { name: 'Select all', exact: true }).click();
  await play.getByRole('combobox', { name: 'Shape for selected tables' }).selectOption('square');
  await play.getByRole('combobox', { name: 'Seats for selected tables' }).selectOption('4');
  await play.getByRole('button', { name: 'Apply to selected (20)', exact: true }).click();
  const shapes = await play.getByRole('combobox', { name: /^Table \d+ shape$/ }).evaluateAll(elements => elements.map(element => (element as HTMLSelectElement).value));
  expect(shapes).toEqual(Array(20).fill('square'));
  await play.getByRole('combobox', { name: 'Table 1 seats', exact: true }).selectOption('7');
  await expect(play.getByText('Part A: 4 players · Part B: 3 players')).toBeVisible();
  await page.getByLabel('Event name').fill('Twenty physical tables');
  await page.getByLabel('Host PIN').fill('2468');
  const created = page.waitForResponse(response => response.url().endsWith('/api/events') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const { event } = await response.json();
  const tables = (await (await page.request.get(`/api/events/${event.joinCode}/tables`)).json()).tables;
  expect(new Set(tables.map((table: { area: { tableNumber: number } }) => table.area.tableNumber)).size).toBe(20);
  expect(tables.slice(0, 2).map((table: { label: string }) => table.label)).toEqual(['Table 1 · Part A', 'Table 1 · Part B']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('recovery removes expired events while retaining waiting players from active events', async ({ page }) => {
  await prepareApp(page);
  const response = await page.request.post('/api/events', { data: { name: 'Still active', hostPin: '2468', tableCount: 1 } });
  const code = (await response.json()).event.joinCode;
  await page.route('**/api/events/OLD123', route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'EVENT_NOT_FOUND', message: 'Expired' } }) }));
  await page.goto('/');
  await page.evaluate(code => {
    localStorage.setItem('podyguard.player.OLD123', JSON.stringify({ token: 'expired-token', displayName: 'Old player' }));
    localStorage.setItem(`podyguard.player.${code}`, JSON.stringify({ token: 'waiting-token', displayName: 'Waiting player', eventName: 'Still active' }));
  }, code);
  await page.goto('/#/players');
  await expect(page.getByRole('link', { name: 'Continue as Waiting player', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('podyguard.player.OLD123'))).toBeNull();
  await expect(page.getByRole('link', { name: 'Continue as Old player', exact: true })).toHaveCount(0);
});
