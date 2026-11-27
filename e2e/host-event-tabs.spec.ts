import { expect, test } from './fixtures';
import { createConstructedEvent, openHome } from './helpers';

test('event name examples follow the mode and Limited help follows BO1 and BO3', async ({ page }) => {
  await openHome(page);
  await page.getByRole('tab', { name: 'Host event' }).click();
  const name = page.getByLabel('Event name');
  await expect(name).toHaveAttribute('placeholder', 'Friday Commander');
  await name.fill('My Friday event');
  await page.getByRole('button', { name: 'Classic', exact: true }).click();
  await page.locator('label').filter({ hasText: /^Duel$/ }).click();
  await expect(name).toHaveAttribute('placeholder', 'Friday Duel Night');
  await expect(name).toHaveValue('My Friday event');

  await page.getByRole('tab', { name: 'Limited' }).click();
  await page.locator('label').filter({ hasText: /^Pick-Two Draft$/ }).click();
  await expect(name).toHaveAttribute('placeholder', 'Friday Pick-Two Draft');
  await expect(name).toHaveValue('My Friday event');
  const match = page.getByRole('combobox', { name: 'Match', exact: true });
  for (const bestOf of [1, 3]) {
    await match.selectOption(`BO${bestOf}`);
    await expect(page.getByText(`4 players per pod · 1v1, diagonals first · best of ${bestOf}`)).toBeVisible();
  }
  await page.locator('label').filter({ hasText: /^Sealed$/ }).click();
  await expect(name).toHaveAttribute('placeholder', 'Friday Sealed');
  await expect(page.getByText(/Swiss 1v1 · best of 3/)).toBeVisible();
  await page.getByRole('tab', { name: 'Constructed' }).click();
  await expect(name).toHaveValue('My Friday event');

  await page.getByRole('tab', { name: 'Start playing' }).click();
  await page.getByRole('tab', { name: 'Limited' }).click();
  await match.selectOption('BO1');
  await expect(page.getByText(/best of 1$/)).toBeVisible();
});

test('host tabs keep event operations, device display, and player joining in their own views', async ({ page, context }) => {
  await page.addInitScript(() => {
    localStorage.setItem('podyguard-theme', 'light');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => { document.documentElement.dataset.clipboardLink = value; } },
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async ({ url }: ShareData) => { document.documentElement.dataset.sharedLink = url; },
    });
  });
  const code = await createConstructedEvent(page, {
    name: 'Host tabs test night',
    baseModeLabel: 'Duel',
    commanderRules: false,
  });
  const tabs = page.getByRole('tablist', { name: 'Host desk sections' });
  await expect(tabs.getByRole('tab')).toHaveText(['Desk', 'Play', 'Overview', 'Join']);
  await expect(page.getByRole('tab', { name: 'Desk', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Match now' })).toBeVisible();

  await tabs.getByRole('tab', { name: 'Play' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Play' }).getByLabel('Display name')).toBeVisible();
  await tabs.getByRole('tab', { name: 'Play' }).press('ArrowRight');
  const overview = page.getByRole('tabpanel', { name: 'Overview' });
  await expect(overview.getByRole('heading', { name: 'Tables' })).toBeVisible();
  await expect(overview.locator('code').filter({ hasText: code })).toBeVisible();
  const manageDisplays = overview.getByText('Manage displays and announcements', { exact: true });
  const managedPairing = overview.getByRole('link', { name: 'Pair a managed display', exact: true });
  await expect(managedPairing).toBeHidden();
  await manageDisplays.click();
  await expect(managedPairing).toHaveAttribute('href', '#/display?managed=1');
  await manageDisplays.click();
  await expect(page.getByRole('heading', { name: 'Join code' })).toHaveCount(0);
  const newPage = context.waitForEvent('page');
  await overview.getByRole('link', { name: 'Open event display' }).click();
  const display = await newPage;
  await expect(display.getByRole('heading', { name: 'Host tabs test night' })).toBeVisible();
  await expect(display.getByRole('heading', { name: 'Tables' })).toBeVisible();
  await expect(display.locator('html')).toHaveAttribute('data-theme', 'light');
  await display.close();

  const copyDisplay = overview.getByRole('button', { name: 'Copy display link' });
  const hasPublicOrigin = await copyDisplay.isEnabled();
  if (hasPublicOrigin) {
    await copyDisplay.click();
    await expect(page.locator('html')).toHaveAttribute('data-clipboard-link', new RegExp(`#/display/event/${code}$`));
    await overview.getByRole('button', { name: 'Share display link' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-shared-link', new RegExp(`#/display/event/${code}$`));
  }

  await tabs.getByRole('tab', { name: 'Join' }).click();
  const join = page.getByRole('tabpanel', { name: 'Join' });
  await expect(join.getByRole('heading', { name: 'Join code' })).toBeVisible();
  await expect(join.getByText(code, { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Pair a managed display' })).toHaveCount(0);
  const copyPlayer = join.getByRole('button', { name: 'Copy player link' });
  const sharePlayer = join.getByRole('button', { name: 'Share player link' });
  if (hasPublicOrigin) {
    const playerLink = join.getByRole('link', { name: new RegExp(`join=${code}`) });
    const url = (await playerLink.getAttribute('href'))!;
    await expect(join.locator('svg').filter({ has: page.locator('title', { hasText: 'Scan to join this event' }) })).toBeVisible();
    await copyPlayer.click();
    await expect(page.locator('html')).toHaveAttribute('data-clipboard-link', url);
    await sharePlayer.click();
    await expect(page.locator('html')).toHaveAttribute('data-shared-link', url);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'share', { value: undefined });
      delete document.documentElement.dataset.clipboardLink;
    });
    await sharePlayer.click();
    await expect(page.locator('html')).toHaveAttribute('data-clipboard-link', url);
    await expect(join.getByRole('button', { name: 'Copied' })).toBeVisible();
  } else {
    await expect(copyPlayer).toBeDisabled();
    await expect(sharePlayer).toBeDisabled();
  }
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
