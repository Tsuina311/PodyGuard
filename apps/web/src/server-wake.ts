export function shouldShowWakeScreen(input: {
  isProd: boolean;
  healthOk: boolean | null;
  waitedMs: number;
}): boolean {
  if (!input.isProd) {
    return false;
  }
  if (input.healthOk === true) {
    return false;
  }
  if (input.healthOk === false) {
    return true;
  }
  return input.waitedMs >= 800;
}
