import { describe, expect, it } from 'vitest';
import { computeFlexDelta, flexScore } from './flex.js';

describe('flex credits', () => {
  it('awards credits only for actual concessions', () => {
    expect(
      computeFlexDelta({ concession: false, podSize: 4, flexCredits: 0 }),
    ).toBe(0);
    expect(
      computeFlexDelta({ concession: true, podSize: 4, flexCredits: 0 }),
    ).toBe(2);
    expect(
      computeFlexDelta({ concession: false, podSize: 3, flexCredits: 0 }),
    ).toBe(3);
    expect(
      computeFlexDelta({ concession: false, podSize: 5, flexCredits: 0 }),
    ).toBe(2);
    expect(
      computeFlexDelta({ concession: true, podSize: 3, flexCredits: 0 }),
    ).toBe(5);
  });

  it('spends credits on a clean preferred 4-pod', () => {
    expect(
      computeFlexDelta({ concession: false, podSize: 4, flexCredits: 5 }),
    ).toBe(-3);
    expect(
      computeFlexDelta({ concession: false, podSize: 4, flexCredits: 2 }),
    ).toBe(-2);
  });

  it('treats a leftover 4 as a concession when 5 is preferred', () => {
    expect(
      computeFlexDelta({
        concession: false,
        podSize: 5,
        flexCredits: 0,
        preferredSize: 5,
      }),
    ).toBe(0);
    expect(
      computeFlexDelta({
        concession: false,
        podSize: 4,
        flexCredits: 0,
        preferredSize: 5,
      }),
    ).toBe(2);
  });

  it('keeps wait-time dominance in the score weight', () => {
    expect(flexScore(6)).toBeLessThan(1);
  });
});
