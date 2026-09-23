/**
 * Commander-damage chip visibility / tap rules.
 *
 * Zero damage stays gated behind the dial like other seat chrome. Once any
 * damage is on the board the chip stays visible AND tappable so you can open
 * the sheet without waking the rest of the seat controls.
 */
export function commanderDamageChipState(input: {
  revealed: boolean;
  damage: number;
}): { hidden: boolean; interactive: boolean } {
  const hidden = !input.revealed && input.damage <= 0;
  return {
    hidden,
    interactive: !hidden,
  };
}
