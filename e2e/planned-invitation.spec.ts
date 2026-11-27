import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { prepareApp } from './helpers';

test('event setup saves an invitation, calendar details and nickname RSVP, then restores its tables on launch', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const demo = await (await page.request.get('/test/demo')).json();
  const headers = { Authorization: `Bearer ${demo.token}` };
  const groupName = `Invitation planning ${test.info().project.name} ${test.info().repeatEachIndex}-${test.info().retry}`;
  const { playgroup } = await (await page.request.post('/api/playgroups', { headers, data: { name: groupName } })).json();
  const guests = [];
  for (const displayName of ['Gwen', 'Theo']) {
    const { guest } = await (await page.request.post(`/api/playgroups/${playgroup.id}/guests`, { headers, data: { displayName } })).json();
    guests.push(guest);
  }
  await prepareApp(page);
  await page.addInitScript(({ token, account, id }) => {
    localStorage.setItem('podyguard.account.session', JSON.stringify({ token, account }));
    localStorage.setItem('podyguard.account.preferredPlaygroupId', id);
  }, { token: demo.token, account: demo.account, id: playgroup.id });
  let liveEventsCreated = 0;
  page.on('request', request => { if (request.url().endsWith('/api/events') && request.method() === 'POST') liveEventsCreated++; });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Host event', exact: true }).click();
  await page.getByRole('button', { name: 'Classic', exact: true }).click();
  await page.locator('label').filter({ has: page.locator('input[name="hostBaseMode"]') }).filter({ hasText: /^Duel$/ }).click();
  await expect(page.getByRole('button', { name: groupName, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Event name', { exact: true }).fill('Classic plans');
  await page.getByRole('checkbox', { name: 'Create an invitation for later', exact: true }).check();
  await expect(page.getByLabel('Host PIN', { exact: true })).toHaveCount(0);
  const date = new Date(Date.now() + 3 * 86400_000);
  await page.getByLabel(/^Date and time/).fill(new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  await page.getByLabel('Location', { exact: true }).fill('Clubhouse, room 2');
  await page.getByRole('group', { name: 'Invited players', exact: true }).getByRole('checkbox', { name: 'Theo', exact: true }).uncheck();
  const tables = page.getByRole('group', { name: 'Playing tables', exact: true });
  await tables.getByRole('spinbutton').fill('2');
  await tables.getByRole('combobox', { name: 'Table 1 shape', exact: true }).selectOption('rectangle');
  await tables.getByRole('combobox', { name: 'Table 1 seats', exact: true }).selectOption('4');
  await tables.getByRole('combobox', { name: 'Table 2 shape', exact: true }).selectOption('round');
  const created = page.waitForResponse(response => response.url().endsWith(`/playgroups/${playgroup.id}/nights`) && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create invitation', exact: true }).click();
  const response = await created;
  expect(response.ok()).toBe(true);
  const { night } = await response.json();
  expect(night.eventJoinCode).toBeNull();
  expect(liveEventsCreated).toBe(0);
  expect(night.invitees.map((guest: { displayName: string }) => guest.displayName)).toEqual(['Gwen']);
  expect(night.eventSetup.tableLayouts).toEqual([{ shape: 'rectangle', seats: 4 }, { shape: 'round', seats: 2 }]);
  await expect(page).toHaveURL(new RegExp(`#/nights/${night.id}$`));
  const invitation = page.url();
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  try {
    const guest = await guestContext.newPage(); await prepareApp(guest); await guest.goto(invitation);
    await expect(guest.getByText('Event type: Classic · Duel', { exact: true })).toBeVisible();
    await expect(guest.getByText('Clubhouse, room 2', { exact: true })).toBeVisible();
    await guest.getByRole('combobox', { name: 'Choose your playgroup player', exact: true }).selectOption(guests[0].id);
    await expect(guest.getByLabel('Your name', { exact: true })).toHaveValue('Gwen');
    await guest.getByLabel('Your name', { exact: true }).fill('Stargazer');
    await guest.getByRole('button', { name: 'Save response', exact: true }).click();
    const response = guest.getByRole('region', { name: 'Who’s coming' }).getByRole('listitem').filter({ hasText: 'Stargazer' });
    await expect(response.getByText('Yes', { exact: true })).toBeVisible();
    await guest.reload();
    await expect(guest.getByLabel('Your name', { exact: true })).toHaveValue('Stargazer');
    await expect(guest.getByRole('combobox', { name: 'Choose your playgroup player', exact: true })).toHaveValue(guests[0].id);
    const downloaded = guest.waitForEvent('download');
    await guest.getByRole('button', { name: 'Add to calendar', exact: true }).click();
    const calendar = await readFile((await (await downloaded).path())!, 'utf8');
    expect(calendar.replace(/\r\n /g, '')).toContain('Classic · Duel');
    expect(calendar).toContain('LOCATION:Clubhouse\\, room 2');
    await page.getByLabel('Host PIN', { exact: true }).fill('2468');
    const launched = page.waitForResponse(response => response.url().endsWith(`/nights/${night.id}/start`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Start event', exact: true }).click();
    const result = await (await launched).json();
    expect(result.event).toMatchObject({ gameMode: 'duel', rulesFormat: 'normal' });
    const actual = (await (await page.request.get(`/api/events/${result.event.joinCode}/tables`)).json()).tables;
    expect(actual.map((table: { label: string }) => table.label)).toEqual(['Table 1 · Part A', 'Table 1 · Part B', 'Table 2']);
  } finally { await guestContext.close(); }
});
