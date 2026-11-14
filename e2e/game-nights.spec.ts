import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { prepareApp } from './helpers';

test('friends plan a night, change an RSVP, export a calendar and start with the agreement', async ({
  page,
  browser,
  request,
}) => {
  const demo = await (await request.get('/test/demo')).json();
  await prepareApp(page);
  await page.addInitScript(
    (session) =>
      localStorage.setItem(
        'podyguard.account.session',
        JSON.stringify(session),
      ),
    { token: demo.token, account: demo.account },
  );
  await page.goto(`/#/playgroups/${demo.playgroup.id}`);
  await page.getByLabel('Night name').fill('Friends next Friday');
  const date = new Date(Date.now() + 3 * 86400_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
  await page.getByLabel(/^Date and time/).fill(local);
  await page.getByLabel('Location note').fill('Kitchen table');
  await page.getByText('Optional pregame agreement', { exact: true }).click();
  await page.getByLabel('Pace', { exact: true }).selectOption('relaxed');
  await page.getByLabel('Target game length (minutes)').fill('90');
  await page
    .getByLabel('Table preferences')
    .fill('Discuss infinite combos first.');
  await page.getByRole('button', { name: 'Create invitation' }).click();
  await page
    .getByRole('link', { name: 'Friends next Friday', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Before we play' }),
  ).toBeVisible();
  const invite = page.url();
  const guestContext = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const guest = await guestContext.newPage();
    await prepareApp(guest);
    await guest.goto(invite);
    await guest.getByLabel('Your name').fill('Ada');
    await guest.getByRole('button', { name: 'Save response' }).click();
    await expect(guest.getByRole('status')).toContainText('Response saved');
    await guest.reload();
    await expect(guest.getByLabel('Your name')).toHaveValue('Ada');
    await guest.getByLabel('Your response').selectOption('maybe');
    await guest.getByRole('button', { name: 'Save response' }).click();
    await expect(guest.getByText('Ada: maybe', { exact: true })).toBeVisible();
    await expect(guest.getByText('Ada: yes', { exact: true })).toHaveCount(0);
    await expect(
      guest.getByRole('button', { name: 'Start event', exact: true }),
    ).toHaveCount(0);
    const download = guest.waitForEvent('download');
    await guest.getByRole('button', { name: 'Add to calendar' }).click();
    expect((await download).suggestedFilename()).toBe('podyguard-night.ics');
    const accessibility = await new AxeBuilder({ page: guest })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations).toEqual([]);
    await page.getByRole('button', { name: 'Refresh responses' }).click();
    await expect(page.getByText('Ada: maybe', { exact: true })).toBeVisible();
    await page.getByLabel('Host PIN', { exact: true }).fill('2468');
    await page
      .getByRole('button', { name: 'Start event', exact: true })
      .click();
    await expect(page).toHaveURL(/#\/host\//);
    await expect(
      page.getByRole('heading', { name: 'Before we play' }),
    ).toBeVisible();
    await guest.reload();
    await expect(
      guest.getByRole('link', { name: 'Join event', exact: true }),
    ).toBeVisible();
    await guest.getByRole('link', { name: 'Join event', exact: true }).click();
    await expect(
      guest.getByText('Discuss infinite combos first.', { exact: true }),
    ).toBeVisible();
  } finally {
    await guestContext.close();
  }
});

test('a canceled invitation cannot accept an RSVP', async ({
  page,
  request,
}) => {
  const demo = await (await request.get('/test/demo')).json();
  const created = await request.post(
    `/api/playgroups/${demo.playgroup.id}/nights`,
    {
      headers: { Authorization: `Bearer ${demo.token}` },
      data: {
        name: 'Canceled night',
        startsAt: new Date(Date.now() + 86400_000).toISOString(),
        timeZone: 'Europe/Paris',
        location: '',
        seatTarget: 4,
        agreement: {},
      },
    },
  );
  expect(created.ok()).toBe(true);
  const { night } = await created.json();
  expect(
    (
      await request.post(`/api/nights/${night.id}/cancel`, {
        headers: { Authorization: `Bearer ${demo.token}` },
      })
    ).ok(),
  ).toBe(true);
  await prepareApp(page);
  await page.goto(`/#/nights/${night.id}`);
  await expect(page.getByRole('status')).toHaveText(
    'This night was cancelled.',
  );
  await expect(page.getByRole('button', { name: 'Save response' })).toHaveCount(
    0,
  );
});
