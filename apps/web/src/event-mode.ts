import {
  defaultLimitedEventModeConfig,
  LIMITED_MODES,
  type LimitedEventModeConfig,
} from '@podyguard/shared';

/** True when the event has at least one enabled Limited queue (Draft / Sealed / …). */
export function eventHasLimitedQueues(event: {
  limitedModeConfigs?: Array<{ enabled: boolean }> | null;
}): boolean {
  return event.limitedModeConfigs?.some((config) => config.enabled) === true;
}

/**
 * Player / host UI after start is gated on Limited queues — not on gameMode.
 * Constructed modes (including duel-commander) must never ship an enabled Draft.
 */
export type EventPlaySurface = 'limited' | 'constructed';

export function eventPlaySurface(event: {
  limitedModeConfigs?: Array<{ enabled: boolean }> | null;
}): EventPlaySurface {
  return eventHasLimitedQueues(event) ? 'limited' : 'constructed';
}

/** All Limited formats present but off — used when creating constructed events. */
export function disabledLimitedConfigs(): LimitedEventModeConfig[] {
  return LIMITED_MODES.map((mode) => ({
    ...defaultLimitedEventModeConfig(mode),
    enabled: false,
  }));
}

/**
 * Host Limited form default: one format selected (Booster Draft), matching play mode.
 * Never use this for constructed event creates.
 */
export function defaultHostLimitedConfigs(): LimitedEventModeConfig[] {
  return LIMITED_MODES.map((mode) => ({
    ...defaultLimitedEventModeConfig(mode),
    enabled: mode === 'BOOSTER_DRAFT',
  }));
}

/** Payload helper so constructed creates cannot accidentally enable Draft/Sealed. */
export function limitedConfigsForEventCreate(
  isLimited: boolean,
  hostLimitedConfigs: LimitedEventModeConfig[],
): LimitedEventModeConfig[] {
  return isLimited ? hostLimitedConfigs : disabledLimitedConfigs();
}
