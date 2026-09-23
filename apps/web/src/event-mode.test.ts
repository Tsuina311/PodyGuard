import { describe, expect, it } from 'vitest';
import {
  GAME_MODES,
  LIMITED_MODES,
  defaultLimitedEventModeConfig,
} from '@podyguard/shared';
import {
  defaultHostLimitedConfigs,
  disabledLimitedConfigs,
  eventHasLimitedQueues,
  eventPlaySurface,
  limitedConfigsForEventCreate,
} from './event-mode';

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

describe('limited create payloads', () => {
  it('disables every Limited format for constructed creates', () => {
    const configs = disabledLimitedConfigs();
    expect(configs.map((row) => row.mode)).toEqual([...LIMITED_MODES]);
    expect(configs.every((row) => row.enabled === false)).toBe(true);
    expect(eventHasLimitedQueues({ limitedModeConfigs: configs })).toBe(false);
  });

  it('defaults the host Limited form to Booster Draft only', () => {
    const configs = defaultHostLimitedConfigs();
    expect(
      configs.filter((row) => row.enabled).map((row) => row.mode),
    ).toEqual(['BOOSTER_DRAFT']);
  });

  it('never attaches host Limited defaults to a constructed create', () => {
    const payload = limitedConfigsForEventCreate(
      false,
      defaultHostLimitedConfigs(),
    );
    expect(payload.every((row) => row.enabled === false)).toBe(true);
    expect(eventPlaySurface({ limitedModeConfigs: payload })).toBe(
      'constructed',
    );
  });

  it('keeps the host Limited selection when creating a Limited event', () => {
    const host = defaultHostLimitedConfigs().map((row) => ({
      ...row,
      enabled: row.mode === 'SEALED',
    }));
    const payload = limitedConfigsForEventCreate(true, host);
    expect(
      payload.filter((row) => row.enabled).map((row) => row.mode),
    ).toEqual(['SEALED']);
    expect(eventPlaySurface({ limitedModeConfigs: payload })).toBe('limited');
  });
});

describe('event play surfaces by mode', () => {
  it.each([...GAME_MODES])(
    'constructed %s opens the constructed surface (not Limited Swiss)',
    (gameMode) => {
      void gameMode;
      const limitedModeConfigs = limitedConfigsForEventCreate(
        false,
        defaultHostLimitedConfigs(),
      );
      expect(eventPlaySurface({ limitedModeConfigs })).toBe('constructed');
      expect(eventHasLimitedQueues({ limitedModeConfigs })).toBe(false);
    },
  );

  it('duel-commander specifically must not look like Booster Draft', () => {
    // Regression: constructed creates used to send enabled: BOOSTER_DRAFT.
    const buggy = LIMITED_MODES.map((mode) => ({
      ...defaultLimitedEventModeConfig(mode),
      enabled: mode === 'BOOSTER_DRAFT',
    }));
    expect(eventPlaySurface({ limitedModeConfigs: buggy })).toBe('limited');

    const fixed = limitedConfigsForEventCreate(
      false,
      defaultHostLimitedConfigs(),
    );
    expect(eventPlaySurface({ limitedModeConfigs: fixed })).toBe(
      'constructed',
    );
  });

  it.each([...LIMITED_MODES])(
    'Limited %s opens the Limited player/host surface',
    (mode) => {
      const limitedModeConfigs = LIMITED_MODES.map((row) => ({
        ...defaultLimitedEventModeConfig(row),
        enabled: row === mode,
      }));
      expect(eventPlaySurface({ limitedModeConfigs })).toBe('limited');
    },
  );

  it('constructed tournament swiss is still constructed UI, not Limited Swiss', () => {
    const limitedModeConfigs = disabledLimitedConfigs();
    expect(eventPlaySurface({ limitedModeConfigs })).toBe('constructed');
    // Tournament status is an overlay on JoinPage; it does not flip Limited.
  });
});
