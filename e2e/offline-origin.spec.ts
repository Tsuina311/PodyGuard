import { expect, test } from './fixtures';
import { prepareOfflineGame, expectRecoveredGame } from './offline-game';
import { createOutageOrigin } from './origin-outage';

// PWA checks deliberately run real service workers in both engines.
test.use({ serviceWorkers: 'allow' });

test('a saved local game cold-starts when its origin becomes unreachable', async ({
  page,
  request,
  baseURL,
}) => {
  const origin = await createOutageOrigin(baseURL!);
  try {
    await prepareOfflineGame(page, origin.url);
    await origin.disconnect();
    // Prove the browser-facing server really stopped; no request interception
    // supplies a fake successful document or asset response.
    await expect(
      request.get(origin.url, { timeout: 2000, maxRetries: 0 }),
    ).rejects.toThrow();
    await page.reload();
    await expectRecoveredGame(page);
  } finally {
    await origin.disconnect();
  }
});
