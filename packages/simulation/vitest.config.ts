import { defineConfig } from 'vitest/config';

const configuredRuns = Number.parseInt(process.env.SIMULATION_PROPERTY_RUNS ?? '10000', 10);
const propertyRuns =
  Number.isSafeInteger(configuredRuns) && configuredRuns > 0 ? configuredRuns : 10_000;
/** Scale with heavy property runs; Vitest 3 birpc still needs the test to yield (see strategy.property.test). */
const testTimeout = Math.max(120_000, Math.ceil(propertyRuns / 10_000) * 120_000);

export default defineConfig({
  test: {
    environment: 'node',
    hookTimeout: testTimeout,
    testTimeout,
  },
});
