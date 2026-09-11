import { defineConfig } from 'vitest/config';

const configuredRuns = Number.parseInt(process.env.SIMULATION_PROPERTY_RUNS ?? '400', 10);
const propertyRuns =
  Number.isSafeInteger(configuredRuns) && configuredRuns > 0 ? configuredRuns : 400;
const testTimeout = Math.max(120_000, Math.ceil(propertyRuns / 400) * 120_000);

export default defineConfig({
  test: {
    environment: 'node',
    hookTimeout: testTimeout,
    testTimeout,
  },
});
