import { describe, expect, it } from 'vitest';
import { isJoinCodeFormat, normalizeJoinCode } from './join-code';

describe('join codes', () => {
  it('normalizes typed codes', () => {
    expect(normalizeJoinCode(' ab-c12 ')).toBe('ABC12');
  });

  it('accepts generated alphabet only', () => {
    expect(isJoinCodeFormat('AB23CD')).toBe(true);
    expect(isJoinCodeFormat('AB01CD')).toBe(false);
  });
});
