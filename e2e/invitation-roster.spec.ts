import { expect, test } from './fixtures';
import { prepareApp } from './helpers';

test('light mode shows the invitation roster and confirmed seats', async ({ page, request }, info) => {
  const demo = await (await request.get('/test/demo')).json();
  const created = await request.post(`/api/playgroups/${demo.playgroup.id}/nights`, {
    headers: { Authorization: `Bearer ${demo.token}` },
    data: {
      name: `Draft invitation roster (${info.project.name}, ${info.retry})`,
      startsAt: new Date(Date.now() + 86400_000).toISOString(),
      timeZone: 'Europe/Brussels',
      location: '',
      seatTarget: 2,
      agreement: {},
    },
  });
  expect(created.ok()).toBe(true);
  const { night } = await created.json();
  for (const [displayName, response, secret] of [
    ['Gwen', 'yes', 'a'], ['Bea', 'maybe', 'b'], ['Cal', 'no', 'c'],
  ]) {
    const saved = await request.post(`/api/nights/${night.id}/rsvp`, {
      data: { displayName, response, rsvpToken: secret!.repeat(32) },
    });
    expect(saved.ok()).toBe(true);
  }

  await prepareApp(page);
  await page.addInitScript(() => localStorage.setItem('podyguard-theme', 'light'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#/nights/${night.id}`);
  const roster = page.getByRole('region', { name: 'Who’s coming' });
  const progress = roster.getByRole('progressbar', { name: 'Confirmed seats' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  await expect(progress).toHaveAttribute('aria-valuemax', '2');
  for (const [name, status] of [['Gwen', 'Yes'], ['Bea', 'Maybe'], ['Cal', 'No']]) {
    const row = roster.getByRole('listitem').filter({ hasText: name });
    await expect(row.getByText(status!, { exact: true })).toBeVisible();
  }
  await expect(roster.getByText('Full', { exact: true })).toHaveCount(0);

  await page.getByLabel('Your name', { exact: true }).fill('Max');
  await page.getByRole('button', { name: 'Save response' }).click();
  const max = roster.getByRole('listitem').filter({ hasText: 'Max' });
  await expect(max.getByText('Yes', { exact: true })).toBeVisible();
  await expect(progress).toHaveAttribute('aria-valuenow', '2');
  await expect(roster.getByText('Full', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(max.getByText('Yes', { exact: true })).toBeVisible();
});
