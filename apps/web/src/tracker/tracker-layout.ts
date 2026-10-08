/**
 * Stacking and press rules for the life tracker. Seats, the center clock, and
 * life taps have each covered or replaced the other; these strings are the
 * contract so a later edit cannot quietly undo that.
 */

/** A highlighted seat. The center clock must stay above this. */
export const SEAT_SPOTLIGHT_Z = 20;

/** Center clock and the pre-game Start control. */
export const MATCH_DIAL_Z = 30;

/** Seats stay in this layer so a spotlighted card cannot cover the clock. */
export function boardGridStackClass(): string {
  return 'relative z-0';
}

/** Center clock / Start. Above every seat, including a spotlighted one. */
export function matchDialStackClass(): string {
  return 'absolute z-30';
}

export function seatSpotlightClass(): string {
  return 'z-20 border-neon';
}

/**
 * Commander-damage chip. Vertical padding is part of the hit target; do not
 * collapse it back to a single unit.
 */
export function commanderDamageChipPaddingClass(): string {
  return 'px-1.5 py-2 tablet:min-h-14 tablet:gap-1.5 tablet:px-3 tablet:py-3 tablet:text-xl tablet:[&_svg]:size-7';
}

/** Side rails for seat icons. Phone stays `w-9`. */
export function tabletSeatRailClass(): string {
  return 'tablet:w-20 tablet:gap-2';
}

/** Counters, monarch, story, city. Phone stays `size-9`. */
export function tabletSeatIconClass(): string {
  return 'tablet:size-16 tablet:[&_svg]:size-8';
}

/** Dungeon button. Phone stays `min-h-9 w-9`. */
export function tabletDungeonButtonClass(): string {
  return 'tablet:min-h-16 tablet:w-16 tablet:gap-1 tablet:[&_svg]:size-8';
}

/** Plus / minus on a life half. Phone stays `text-2xl`. */
export function tabletLifeGlyphClass(): string {
  return 'tablet:text-5xl';
}

/** Counter pills along the bottom of a seat. Phone stays the small readout. */
export function tabletCounterBadgeClass(): string {
  return 'tablet:gap-1 tablet:px-2.5 tablet:py-1.5 tablet:text-sm tablet:[&_svg]:size-5';
}

/**
 * Glyph drawn on a life tap. Color flash only — a flower image was never
 * shipped and the broken `<img>` painted a question mark.
 */
export function lifeTapGlyph(delta: number): '+' | '-' {
  return delta > 0 ? '+' : '-';
}

/** Time pane pins the clock to the title row; other panes stay centered. */
export function matchMenuBodyClass(
  align: 'start' | 'center',
  footer: boolean,
): string {
  if (footer) {
    return 'justify-between';
  }
  return align === 'start' ? 'justify-start' : 'justify-center';
}

/**
 * Commander-damage sheet while it is not the one on top. `hidden` so the
 * columns do not show through the seat gaps. Never a second `rotate-90`.
 */
export function commanderSheetClass(open: boolean, openClass: string): string {
  return open ? openClass : 'hidden';
}

/**
 * Match-menu controls on a tablet. Phone classes (`h-9`, `h-11`) stay in
 * place; these only apply when both viewport sides are at least 700px, so a
 * landscape phone does not grow.
 */
export function tabletMenuButtonClass(): string {
  return 'tablet:min-h-16 tablet:text-lg tablet:px-4 tablet:[&_svg]:size-6';
}

/** Stacked menu actions share the pane height on a tablet. */
export function tabletMenuStackButtonClass(): string {
  return 'tablet:h-auto tablet:min-h-16 tablet:flex-1 tablet:text-lg tablet:px-5 tablet:[&_svg]:size-6';
}

/**
 * A 2-column menu grid fills its pane on a tablet, and each button fills its
 * cell. Phone grids stay content-sized.
 */
export function tabletMenuGridClass(): string {
  return 'tablet:min-h-0 tablet:flex-1 tablet:auto-rows-fr tablet:gap-3 tablet:[&_button]:h-full';
}

export function tabletMenuButtonLargeClass(): string {
  return 'tablet:h-auto tablet:min-h-20 tablet:flex-1 tablet:text-xl tablet:px-5 tablet:[&_svg]:size-7';
}

/** Center clock. Phone stays `size-16`. */
export function tabletDialClass(): string {
  return 'tablet:size-32';
}
