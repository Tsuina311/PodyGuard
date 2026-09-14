/** True when the event has at least one enabled Limited queue (Draft / Sealed / …). */
export function eventHasLimitedQueues(event: {
  limitedModeConfigs?: Array<{ enabled: boolean }> | null;
}): boolean {
  return event.limitedModeConfigs?.some((config) => config.enabled) === true;
}
