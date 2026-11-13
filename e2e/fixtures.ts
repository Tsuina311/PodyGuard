import { test as base, expect } from '@playwright/test';

export const test = base.extend<{ diagnostics: void }>({
  diagnostics: [async ({ page }, use, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(`Browser: ${error.message}`));
    page.on('requestfailed', request => errors.push(`Network: ${request.method()} ${new URL(request.url()).pathname} ${request.failure()?.errorText}`));
    page.on('response', response => {
      if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${new URL(response.url()).pathname}`);
    });
    await use();
    if (info.status !== info.expectedStatus) {
      await info.attach('browser-errors', { body: errors.join('\n') || 'No browser/network errors captured on the primary page.', contentType: 'text/plain' });
      await info.attach('environment', { body: JSON.stringify({ project: info.project.name, retry: info.retry, baseURL: info.project.use.baseURL, node: process.version, ci: Boolean(process.env.CI) }, null, 2), contentType: 'application/json' });
    }
  }, { auto: true }],
});
export { expect };
export type { Page } from '@playwright/test';
