import jsQR from 'jsqr';
import type { Browser, Page } from '@playwright/test';
import type { LinkTransferCredentials } from '@podyguard/shared';
import { expect, test } from './fixtures';
import { prepareApp } from './helpers';

async function waitingScreen(page: Page) {
  await prepareApp(page);
  await page.goto('/#/display');
  const created = page.waitForResponse(response => response.url().endsWith('/api/link-transfers') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Show connection QR', exact: true }).click();
  const credentials = await (await created).json() as LinkTransferCredentials;
  const svg = page.locator('svg').filter({ has: page.locator('title', { hasText: 'Scan to send a link to this screen' }) });
  await expect(svg).toBeVisible();
  const pixels = await svg.evaluate(async element => {
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(element)], { type: 'image/svg+xml' }));
    try {
      const img = new Image(); img.src = url; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 280;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 280, 280); ctx.drawImage(img, 20, 20, 240, 240);
      return Array.from(ctx.getImageData(0, 0, 280, 280).data);
    } finally { URL.revokeObjectURL(url); }
  });
  const qr = jsQR(new Uint8ClampedArray(pixels), 280, 280)?.data;
  expect(qr).toBeTruthy();
  expect(qr).toContain(credentials.sendToken);
  expect(qr).not.toContain(credentials.receiveToken);
  expect(qr).not.toContain('destination');
  return { credentials, qr: qr! };
}

async function fakeCamera(page: Page, qr: string) {
  await page.addInitScript(raw => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } });
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, get: () => null, set() {} });
    Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: async () => {} });
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 });
    Object.defineProperty(window, 'BarcodeDetector', { configurable: true, value: class {
      async detect() { return [{ rawValue: raw }]; }
    } });
  }, qr);
}

async function phoneSession(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const phone = await context.newPage(); await prepareApp(phone);
  return { context, phone };
}

test('a phone scans the real screen QR and sends an event without sharing its login', async ({ page: screen, browser }) => {
  const { credentials, qr } = await waitingScreen(screen);
  await screen.screenshot({ path: test.info().outputPath('screen-waiting-qr.png'), fullPage: true });
  const { context, phone } = await phoneSession(browser);
  try {
    await fakeCamera(phone, qr);
    const created = await phone.request.post('/api/events', { data: { name: 'QR monitor night', hostPin: '2468', tableCount: 1 } });
    const { event, hostToken } = await created.json();
    await phone.goto('/');
    await phone.evaluate(({ code, token }) => localStorage.setItem(`podyguard.host.${code}`, token), { code: event.joinCode, token: hostToken });
    await phone.goto(`/#/host/${event.joinCode}`);
    await phone.getByRole('button', { name: 'Navigation menu', exact: true }).click();
    await phone.getByRole('button', { name: 'Send to screen', exact: true }).click();
    await phone.getByRole('button', { name: 'Scan screen QR', exact: true }).click();
    await expect(phone.getByText('Sent. The screen will open the link.', { exact: true })).toBeVisible();
    await expect(screen).toHaveURL(new RegExp(`#/display/event/${event.joinCode}$`));
    await expect(screen.getByRole('heading', { name: 'QR monitor night', exact: true })).toBeVisible();
    expect(await screen.evaluate(code => localStorage.getItem(`podyguard.host.${code}`), event.joinCode)).toBeNull();
    expect(await screen.evaluate(() => localStorage.getItem('podyguard.account.session'))).toBeNull();
    const duplicate = await phone.request.post(`/api/link-transfers/${credentials.id}`, {
      headers: { Authorization: `Bearer ${credentials.sendToken}` }, data: { destination: '/tools' },
    });
    expect(await duplicate.json()).toEqual({ accepted: false });
    const retained = await screen.request.get(`/api/link-transfers/${credentials.id}`, { headers: { Authorization: `Bearer ${credentials.receiveToken}` } });
    expect(await retained.json()).toMatchObject({ destination: `/display/event/${event.joinCode}` });
    await expect(screen).toHaveURL(new RegExp(`#/display/event/${event.joinCode}$`));
  } finally { await context.close(); }
});

test('a dropped receive response and screen reload preserve the accepted query and hash', async ({ page: screen, browser }) => {
  // No socket notifications: exercise the cross-instance/reconnect polling path.
  await screen.route('**/socket.io/**', route => route.abort());
  await screen.routeWebSocket('**/socket.io/**', socket => socket.close());
  const { credentials, qr } = await waitingScreen(screen);
  let drop = true;
  let resolveDropped!: () => void;
  const dropped = new Promise<void>(resolve => { resolveDropped = resolve; });
  await screen.route(`**/api/link-transfers/${credentials.id}`, async route => {
    const response = await route.fetch(); const body = await response.json();
    if (drop && body.status === 'ACCEPTED') { drop = false; await route.abort(); resolveDropped(); }
    else await route.fulfill({ response });
  });
  const { context, phone } = await phoneSession(browser);
  try {
    await phone.goto(qr);
    const destination = '/tools?tab=cards&q=Sol%20Ring#card';
    await phone.getByLabel('Event code or app share link').fill(destination);
    await phone.getByRole('button', { name: 'Send link', exact: true }).click();
    await dropped;
    await screen.reload();
    await expect(screen).toHaveURL(url => url.hash === `#${destination}`);
    expect(await screen.evaluate(() => sessionStorage.getItem('podyguard.link-transfer.receiver'))).toBeNull();
  } finally { await context.close(); }
});

test('external URLs are rejected and sending a host link does not unlock the host on the screen', async ({ page: screen, browser }) => {
  const { credentials, qr } = await waitingScreen(screen);
  const { context, phone } = await phoneSession(browser);
  try {
    const external = await phone.request.post(`/api/link-transfers/${credentials.id}`, {
      headers: { Authorization: `Bearer ${credentials.sendToken}` }, data: { destination: 'https://evil.example/#/tools' },
    });
    expect(external.status()).toBe(400);
    const created = await phone.request.post('/api/events', { data: { name: 'Protected QR desk', hostPin: '2468', tableCount: 1 } });
    const { event } = await created.json();
    await phone.goto(qr);
    await phone.getByLabel('Event code or app share link').fill(`/host/${event.joinCode}?tab=overview`);
    await phone.getByRole('button', { name: 'Send link', exact: true }).click();
    await expect(screen).toHaveURL(new RegExp(`#/host/${event.joinCode}\\?tab=overview$`));
    await expect(screen.getByLabel('Host PIN', { exact: true })).toBeVisible();
    expect(await screen.evaluate(code => localStorage.getItem(`podyguard.host.${code}`), event.joinCode)).toBeNull();
  } finally { await context.close(); }
});
