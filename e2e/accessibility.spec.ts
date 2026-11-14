import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';
import { createConstructedEvent, prepareApp } from './helpers';
test('the player join screen has accessible form controls', async ({
  page,
  browser,
  baseURL,
}) => {
  const code = await createConstructedEvent(page, {
    name: 'Accessible join',
    baseModeLabel: 'Duel',
    commanderRules: false,
  });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const guest = await context.newPage();
    await prepareApp(guest);
    await guest.goto(`${baseURL}/#/e/${code}`);
    await expect(guest.getByLabel('Display name')).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page: guest })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await guest.getByLabel('Display name').focus();
    await guest.keyboard.type('Ada');
    await expect(guest.getByLabel('Display name')).toHaveValue('Ada');
  } finally {
    await context.close();
  }
});
