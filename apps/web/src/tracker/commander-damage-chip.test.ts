import { describe, expect, it } from 'vitest';
import { commanderDamageChipState } from './commander-damage-chip';

describe('commanderDamageChipState', () => {
  it('hides and blocks taps while dial chrome is asleep and damage is zero', () => {
    expect(
      commanderDamageChipState({ revealed: false, damage: 0 }),
    ).toEqual({ hidden: true, interactive: false });
  });

  it('shows a tappable zero chip once the dial reveals seat chrome', () => {
    expect(
      commanderDamageChipState({ revealed: true, damage: 0 }),
    ).toEqual({ hidden: false, interactive: true });
  });

  it('keeps a damage chip visible and tappable without waking the dial', () => {
    expect(
      commanderDamageChipState({ revealed: false, damage: 3 }),
    ).toEqual({ hidden: false, interactive: true });
  });

  it('stays tappable with damage while seat chrome is also revealed', () => {
    expect(
      commanderDamageChipState({ revealed: true, damage: 12 }),
    ).toEqual({ hidden: false, interactive: true });
  });
});
