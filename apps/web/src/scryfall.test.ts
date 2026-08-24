import { describe, expect, it } from 'vitest';
import { canHaveSecondCommander } from './scryfall';

const card = (
  oracleText: string,
  typeLine = 'Legendary Creature',
  keywords: string[] = [],
) => ({ oracleText, typeLine, keywords });

describe('commander pairing affordance', () => {
  it('allows the supported partner variants', () => {
    expect(canHaveSecondCommander(card('Partner', 'Legendary Creature', ['Partner']))).toBe(
      true,
    );
    expect(canHaveSecondCommander(card('Choose a Background'))).toBe(true);
    expect(canHaveSecondCommander(card("Doctor's companion"))).toBe(true);
    expect(canHaveSecondCommander(card('', 'Legendary Enchantment — Background'))).toBe(
      true,
    );
    expect(canHaveSecondCommander(card('', 'Legendary Creature — Time Lord Doctor'))).toBe(
      true,
    );
  });

  it('does not offer a second slot for a normal commander', () => {
    expect(canHaveSecondCommander(card('Flying, vigilance'))).toBe(false);
  });
});
