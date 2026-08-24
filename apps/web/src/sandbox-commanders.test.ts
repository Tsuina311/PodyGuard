import { describe, expect, it } from 'vitest';
import { randomSandboxCommanders } from './sandbox-commanders';

describe('sandbox commanders', () => {
  it('seats two different partner pairs and fills the rest solo', () => {
    const seats = randomSandboxCommanders(6);
    expect(seats).toHaveLength(6);
    expect(seats.slice(0, 2).map((seat) => seat.length)).toEqual([2, 2]);
    expect(seats.slice(2).every((seat) => seat.length === 1)).toBe(true);

    const cardIds = seats.flat().map((commander) => commander.cardId);
    expect(new Set(cardIds).size).toBe(cardIds.length);
  });

  it('keeps both paired seats at the smallest pod size', () => {
    expect(randomSandboxCommanders(2).map((seat) => seat.length)).toEqual([2, 2]);
  });
});
