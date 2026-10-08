import { describe, expect, it } from 'vitest';
import {
  clearSeatLifeFlash,
  fadeSeatLifeFlash,
  noteSeatLifeFlash,
} from './life-flash';

describe('seat life flashes', () => {
  it('keeps each player’s recent total when someone else taps', () => {
    let flashes = noteSeatLifeFlash({}, 'ada', -1);
    flashes = noteSeatLifeFlash(flashes, 'ada', -1);
    flashes = noteSeatLifeFlash(flashes, 'bea', -1);

    expect(flashes.ada).toEqual({ amount: -2, fading: false });
    expect(flashes.bea).toEqual({ amount: -1, fading: false });
  });

  it('accumulates only the seat that was tapped', () => {
    const flashes = noteSeatLifeFlash(
      { ada: { amount: -4, fading: false } },
      'bea',
      2,
    );
    expect(flashes.ada?.amount).toBe(-4);
    expect(flashes.bea?.amount).toBe(2);
  });

  it('fades and clears one seat without touching the others', () => {
    const noted = {
      ada: { amount: -3, fading: false },
      bea: { amount: -1, fading: false },
    };
    const fading = fadeSeatLifeFlash(noted, 'ada');
    expect(fading.ada).toEqual({ amount: -3, fading: true });
    expect(fading.bea?.fading).toBe(false);

    const cleared = clearSeatLifeFlash(fading, 'ada');
    expect(cleared.ada).toBeUndefined();
    expect(cleared.bea?.amount).toBe(-1);
  });
});
