export interface SeededRandom {
  readonly seed: number;
  next(): number;
  integer(min: number, max: number): number;
  boolean(probability?: number): boolean;
  pick<T>(values: readonly T[]): T;
  weightedIndex(weights: readonly number[]): number;
  shuffle<T>(values: readonly T[]): T[];
}

/** Deterministic 32-bit Mulberry32 random stream. */
export class Mulberry32 implements SeededRandom {
  readonly seed: number;
  private state: number;

  constructor(seed: number) {
    if (!Number.isSafeInteger(seed)) {
      throw new Error(`Seed must be a safe integer, received ${seed}.`);
    }
    this.seed = seed;
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  integer(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min) {
      throw new Error(`Invalid integer range ${min}..${max}.`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  boolean(probability = 0.5): boolean {
    assertProbability(probability, 'probability');
    return this.next() < probability;
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) {
      throw new Error('Cannot pick from an empty collection.');
    }
    const value = values[this.integer(0, values.length - 1)];
    if (value === undefined) {
      throw new Error('Random selection failed.');
    }
    return value;
  }

  weightedIndex(weights: readonly number[]): number {
    if (weights.length === 0 || weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
      throw new Error('Weights must be a non-empty collection of finite, non-negative numbers.');
    }
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (total <= 0) {
      throw new Error('At least one weight must be positive.');
    }
    let target = this.next() * total;
    for (let index = 0; index < weights.length; index += 1) {
      target -= weights[index] ?? 0;
      if (target < 0) {
        return index;
      }
    }
    return weights.length - 1;
  }

  shuffle<T>(values: readonly T[]): T[] {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = this.integer(0, index);
      const current = result[index];
      const swap = result[swapIndex];
      if (current !== undefined && swap !== undefined) {
        result[index] = swap;
        result[swapIndex] = current;
      }
    }
    return result;
  }
}

export function createSeededRandom(seed: number): SeededRandom {
  return new Mulberry32(seed);
}

export function mulberry32(seed: number): SeededRandom {
  return createSeededRandom(seed);
}

export function assertProbability(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1, received ${value}.`);
  }
}
