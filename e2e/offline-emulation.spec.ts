import { test } from './fixtures';
import { prepareOfflineGame, expectRecoveredGame } from './offline-game';

// Chromium's network-offline emulation covers the browser flag as well as
// failing fetches. WebKit's emulated offline reload crashes before app code;
// its cache recovery is checked against a real origin outage in quick-play.
test('a local game cold-starts with browser network-offline emulation', async ({
  page,
  context,
}) => {
  await prepareOfflineGame(page);
  await context.setOffline(true);
  try {
    await page.reload();
    await expectRecoveredGame(page);
  } finally {
    await context.setOffline(false);
  }
});
