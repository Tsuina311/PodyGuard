import { describe, expect, it } from 'vitest';
import {
  KEEP_ALIVE_INTERVAL_MS,
  shouldSendKeepAlivePing,
  shouldShowWakeScreen,
} from './server-wake';

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

describe('keep-alive coordination', () => {
  it('pings when nothing has been recorded yet', () => {
    expect(
      shouldSendKeepAlivePing({ now: 1_000, lastPingAt: null }),
    ).toBe(true);
  });

  it('skips while the shared gap has not elapsed', () => {
    expect(
      shouldSendKeepAlivePing({
        now: KEEP_ALIVE_INTERVAL_MS - 1,
        lastPingAt: 0,
      }),
    ).toBe(false);
  });

  it('pings again once the shared gap has elapsed', () => {
    expect(
      shouldSendKeepAlivePing({
        now: KEEP_ALIVE_INTERVAL_MS,
        lastPingAt: 0,
      }),
    ).toBe(true);
  });
});
