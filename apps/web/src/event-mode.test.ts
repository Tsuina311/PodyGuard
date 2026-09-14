import { describe, expect, it } from 'vitest';
import { eventHasLimitedQueues } from './event-mode';

describe('eventHasLimitedQueues', () => {
  it('is false when Limited configs are missing or disabled', () => {
    expect(eventHasLimitedQueues({})).toBe(false);
    expect(
      eventHasLimitedQueues({
        limitedModeConfigs: [{ enabled: false }],
      }),
    ).toBe(false);
  });

  it('is true when any Limited queue is enabled', () => {
    expect(
      eventHasLimitedQueues({
        limitedModeConfigs: [
          { enabled: false },
          { enabled: true },
        ],
      }),
    ).toBe(true);
  });
});
