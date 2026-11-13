import { expect, test } from './fixtures';
import { prepareApp } from './helpers';

const googleScript = `
window.google = { accounts: { id: {
  initialize(options) { this.options = options; },
  renderButton(parent) {
    const button = document.createElement('button');
    button.textContent = 'Continue with Google';
    button.onclick = () => this.options.callback({credential: 'test-google-credential'});
    parent.append(button);
  }
} } };
`;

test('Google login saves the account, restores playgroups on reload, and can sign in again after logout', async ({ page, request }) => {
  const demo = await (await request.get('/test/demo')).json();
  let challenge = 0;
  let logins = 0;
  await prepareApp(page);
  // Stub only the external identity boundary; the account dashboard and group
  // data still come from the real isolated application server. RSA verification
  // and migration are exercised separately in server tests with signed tokens.
  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'application/javascript', body: googleScript }));
  await page.route('**/api/auth/google/config', route => route.fulfill({ json: { enabled: true, clientId: 'test-client', nonce: `nonce-${++challenge}` } }));
  await page.route('**/api/auth/google', route => {
    expect(route.request().postDataJSON()).toEqual({ credential: 'test-google-credential', nonce: `nonce-${challenge}` });
    logins++;
    return route.fulfill({ json: { account: demo.account, token: demo.token, playgroups: [demo.playgroup] } });
  });
  await page.goto('/#/account');
  await expect(page.getByRole('button', { name: 'Continue with email' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByText('Demo Friday Friends', { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText('Demo Friday Friends', { exact: true }).first()).toBeVisible();
  expect(logins).toBe(1);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByText('Demo Friday Friends', { exact: true }).first()).toBeVisible();
  expect(logins).toBe(2);
});

test('failed Google login shows an error and retries with a fresh challenge', async ({ page, request }) => {
  const demo = await (await request.get('/test/demo')).json();
  let challenges = 0;
  let calls = 0;
  await prepareApp(page);
  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({ contentType: 'application/javascript', body: googleScript }));
  await page.route('**/api/auth/google/config', route => route.fulfill({ json: { enabled: true, clientId: 'test-client', nonce: `nonce-${++challenges}` } }));
  await page.route('**/api/auth/google', route => ++calls === 1
    ? route.fulfill({ status: 401, json: { error: { code: 'GOOGLE_SIGN_IN_INVALID', message: 'Sign-in expired. Please try again.' } } })
    : route.fulfill({ json: { account: demo.account, token: demo.token, playgroups: [demo.playgroup] } }));
  await page.goto('/#/account');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('alert')).toContainText('Sign-in expired');
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByText('Demo Friday Friends', { exact: true }).first()).toBeVisible();
  expect(challenges).toBe(2);
});

test('unconfigured or blocked Google sign-in explains the problem without offering an insecure fallback', async ({ page }) => {
  await prepareApp(page);
  let enabled = false;
  await page.route('**/api/auth/google/config', route => route.fulfill({ json: enabled
    ? { enabled: true, clientId: 'test-client', nonce: 'nonce' }
    : { enabled: false } }));
  await page.route('https://accounts.google.com/gsi/client', route => route.abort());
  await page.goto('/#/account');
  await expect(page.getByRole('alert')).toContainText('not available yet');
  enabled = true;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('alert')).toContainText('Google sign-in could not load');
  await expect(page.getByRole('button', { name: 'Continue with email' })).toHaveCount(0);
});
