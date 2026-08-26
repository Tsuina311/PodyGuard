import { describe, expect, it } from 'vitest';
import { shouldShowWakeScreen } from './server-wake';

describe('wake screen', () => {
  it('stays hidden in local development', () => {
    expect(
      shouldShowWakeScreen({ isProd: false, healthOk: false, waitedMs: 10_000 }),
    ).toBe(false);
  });

  it('waits a beat before covering a warm start', () => {
    expect(
      shouldShowWakeScreen({ isProd: true, healthOk: null, waitedMs: 200 }),
    ).toBe(false);
  });

  it('covers a sleeping host after the beat, and while health is down', () => {
    expect(
      shouldShowWakeScreen({ isProd: true, healthOk: null, waitedMs: 800 }),
    ).toBe(true);
    expect(
      shouldShowWakeScreen({ isProd: true, healthOk: false, waitedMs: 0 }),
    ).toBe(true);
    expect(
      shouldShowWakeScreen({ isProd: true, healthOk: true, waitedMs: 5_000 }),
    ).toBe(false);
  });
});
