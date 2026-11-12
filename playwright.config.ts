import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 4173);
const host = process.env.E2E_HOST ?? '127.0.0.1';
const baseURL = `http://${host}:${String(port)}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'reports/e2e.xml' }]],
  use: {
    baseURL,
    locale: 'en-US',
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        locale: 'en-US',
        // Use the same bundled browser locally and in CI. Opt into system Chrome
        // explicitly with E2E_CHANNEL=chrome when diagnosing browser differences.
        ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL as 'chrome' } : {}),
      },
    },
  ],
  webServer: {
    command: 'node --import tsx e2e/serve.mjs',
    // Prefer `/` over `/health`: production `/health` probes Postgres, while
    // e2e is memory-only. serve.mjs still fakes a healthy `/health` so the
    // prod wake screen can dismiss once Playwright starts navigating.
    url: `${baseURL}/`,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
