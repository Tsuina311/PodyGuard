import { PREFERRED_POD_SIZE } from './types.js';

/** Cap so flex never outweighs a meaningful wait gap. */
export const FLEX_CAP = 6;

export const SECONDARY_POOL_FLEX = 2;
export const THREE_POD_FLEX = 3;
export const FIVE_POD_FLEX = 2;
export const CLEAN_FOUR_SPEND = 3;

/** One wait-step (1) must beat max flex (6 * this). */
export const FLEX_SCORE_WEIGHT = 0.05;

export function boundedFlex(credits: number): number {
  if (!Number.isFinite(credits)) {
    return 0;
  }
  return Math.max(0, Math.min(FLEX_CAP, credits));
}

export function flexScore(credits: number): number {
  return boundedFlex(credits) * FLEX_SCORE_WEIGHT;
}

export function computeFlexDelta(input: {
  concession: boolean;
  podSize: number;
  flexCredits: number;
  preferredSize?: number;
}): number {
  let delta = 0;
  if (input.concession) {
    delta += SECONDARY_POOL_FLEX;
  }
  const preferredSize = input.preferredSize ?? PREFERRED_POD_SIZE;
  if (input.podSize !== preferredSize) {
    delta += input.podSize === 3 ? THREE_POD_FLEX : FIVE_POD_FLEX;
  }
  if (
    input.podSize === preferredSize &&
    !input.concession &&
    input.flexCredits > 0
  ) {
    delta -= Math.min(boundedFlex(input.flexCredits), CLEAN_FOUR_SPEND);
  }
  return delta;
}
