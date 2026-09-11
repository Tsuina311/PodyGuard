import { describe, expect, it } from 'vitest';
import {
  defaultLimitedEventModeConfig,
  LIMITED_MODES,
} from '@podyguard/shared';
import {
  focusedHostLimitedConfig,
  limitedCohortSummary,
  selectExclusiveHostLimitedMode,
} from './LimitedFormatPicker';

describe('limited format picker helpers', () => {
  it('treats sealed as a 4-player Swiss 1v1 cohort', () => {
    expect(limitedCohortSummary('SEALED', 4)).toEqual({
      players: 4,
      pairing: 'swiss-1v1',
    });
  });

  it('selects exactly one host limited format like play mode', () => {
    const configs = LIMITED_MODES.map((mode) => ({
      ...defaultLimitedEventModeConfig(mode),
      enabled: false,
    }));
    const next = selectExclusiveHostLimitedMode(configs, 'SEALED');
    expect(next.filter((row) => row.enabled).map((row) => row.mode)).toEqual([
      'SEALED',
    ]);
    expect(focusedHostLimitedConfig(next)?.mode).toBe('SEALED');
  });
});
