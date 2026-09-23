import { expect, type Page } from '@playwright/test';

/** Force English UI copy so assertions stay stable on fr-FR machines. */
export async function prepareApp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('podyguard-lang', 'en');
  });
}

export async function dismissWakeIfPresent(page: Page): Promise<void> {
  const wake = page.getByRole('heading', { name: 'Waking the tables' });
  if (await wake.count()) {
    await expect(wake).toHaveCount(0, { timeout: 45_000 });
  }
}

export async function openHome(page: Page): Promise<void> {
  await prepareApp(page);
  await page.goto('/');
  await dismissWakeIfPresent(page);
  await expect(page.getByRole('tab', { name: 'Host event' })).toBeVisible({
    timeout: 30_000,
  });
}

async function pickConstructedMode(
  page: Page,
  options: { baseModeLabel: string; commanderRules: boolean },
): Promise<void> {
  if (options.commanderRules) {
    await page.getByRole('button', { name: 'Commander', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Classic', exact: true }).click();
  }
  await page
    .locator('label')
    .filter({
      has: page.locator(
        'input[name="hostBaseMode"], input[name="trackerBaseMode"]',
      ),
    })
    .filter({ hasText: new RegExp(`^${options.baseModeLabel}$`) })
    .click();
}

/**
 * Home → Start playing → constructed mode → Game setup (`#/match-config`).
 */
export async function openQuickPlaySetup(
  page: Page,
  options: {
    baseModeLabel: string;
    commanderRules: boolean;
  },
): Promise<void> {
  await openHome(page);
  await page.getByRole('tab', { name: 'Start playing' }).click();
  await page.getByRole('tab', { name: 'Constructed' }).click();
  await pickConstructedMode(page, options);
  await page.getByRole('button', { name: 'Start a game' }).click();
  await page.waitForURL(/#\/match-config/);
  await expect(page.getByRole('heading', { name: 'Game setup' })).toBeVisible();
}

/** Host tab → fill name/PIN → create. Leaves the browser on `/host/:code`. */
export async function createConstructedEvent(
  page: Page,
  options: {
    name: string;
    /** Grid label under Constructed (e.g. "Duel", "Multiplayer"). */
    baseModeLabel: string;
    commanderRules: boolean;
    pin?: string;
  },
): Promise<string> {
  const pin = options.pin ?? '2468';
  await openHome(page);
  await page.getByRole('tab', { name: 'Host event' }).click();
  await page.getByRole('tab', { name: 'Constructed' }).click();
  await pickConstructedMode(page, options);
  await page.getByLabel('Event name').fill(options.name);
  await page.getByLabel('Host PIN').fill(pin);

  const createResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/events') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create event' }).click();
  const response = await createResponse;
  expect(response.ok(), `create event failed: ${response.status()}`).toBe(true);

  await page.waitForURL(/\/host\/[A-Z0-9]+/i);
  await expect(page.getByRole('heading', { name: options.name })).toBeVisible();
  const match = page.url().match(/\/host\/([A-Z0-9]+)/i);
  expect(match?.[1]).toBeTruthy();
  return match![1]!.toUpperCase();
}

export async function createLimitedEvent(
  page: Page,
  options: {
    name: string;
    formatLabel: 'Booster Draft' | 'Pick-Two Draft' | 'Sealed';
    pin?: string;
  },
): Promise<string> {
  const pin = options.pin ?? '2468';
  await openHome(page);
  await page.getByRole('tab', { name: 'Host event' }).click();
  await page.getByRole('tab', { name: 'Limited' }).click();
  await page
    .locator('label')
    .filter({ has: page.locator('input[name="hostLimitedMode"]') })
    .filter({ hasText: new RegExp(`^${options.formatLabel}$`) })
    .click();
  await page.getByLabel('Event name').fill(options.name);
  await page.getByLabel('Host PIN').fill(pin);

  const createResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/events') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create event' }).click();
  const response = await createResponse;
  expect(response.ok(), `create event failed: ${response.status()}`).toBe(true);

  await page.waitForURL(/\/host\/[A-Z0-9]+/i);
  await expect(page.getByRole('heading', { name: options.name })).toBeVisible();
  const match = page.url().match(/\/host\/([A-Z0-9]+)/i);
  expect(match?.[1]).toBeTruthy();
  return match![1]!.toUpperCase();
}

export async function joinAsPlayer(
  page: Page,
  joinCode: string,
  displayName: string,
): Promise<void> {
  await prepareApp(page);
  await page.goto(`/#/e/${joinCode}`);
  await page.waitForURL(/#\/e\//i);
  await dismissWakeIfPresent(page);
  await expect(page.getByLabel('Display name')).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Display name').fill(displayName);
  await page.getByRole('button', { name: 'Join event' }).click();
  await expect(page.getByText(displayName).first()).toBeVisible();
}

/** Classic (non-commander) join already has a default pool deck — mark ready. */
export async function markPlayerReady(page: Page): Promise<void> {
  await page.getByRole('button', { name: "I'm ready" }).click();
  await expect(page.getByText(/Ready/i).first()).toBeVisible();
}
