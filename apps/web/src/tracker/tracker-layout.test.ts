import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MATCH_DIAL_Z,
  SEAT_SPOTLIGHT_Z,
  boardGridStackClass,
  commanderDamageChipPaddingClass,
  commanderSheetClass,
  lifeTapGlyph,
  matchDialStackClass,
  matchMenuBodyClass,
  seatSpotlightClass,
  tabletCounterBadgeClass,
  tabletDialClass,
  tabletDungeonButtonClass,
  tabletLifeGlyphClass,
  tabletMenuButtonClass,
  tabletMenuButtonLargeClass,
  tabletMenuGridClass,
  tabletMenuStackButtonClass,
  tabletSeatIconClass,
  tabletSeatRailClass,
} from './tracker-layout';

const trackerSource = readFileSync(
  new URL('./TrackerView.tsx', import.meta.url),
  'utf8',
);

describe('life tracker stacking', () => {
  it('keeps the center clock above a highlighted seat', () => {
    expect(MATCH_DIAL_Z).toBeGreaterThan(SEAT_SPOTLIGHT_Z);
    expect(matchDialStackClass()).toContain('z-30');
    expect(matchDialStackClass()).toContain('absolute');
    expect(boardGridStackClass()).toContain('z-0');
    expect(seatSpotlightClass()).toContain('z-20');
    expect(trackerSource).toContain('matchDialStackClass()');
    expect(trackerSource).toContain('boardGridStackClass()');
  });
});

describe('commander damage chip', () => {
  it('keeps vertical padding on the chip hit target', () => {
    expect(commanderDamageChipPaddingClass()).toContain('py-2');
    expect(commanderDamageChipPaddingClass()).toContain('tablet:py-3');
    expect(commanderDamageChipPaddingClass()).not.toMatch(/\bpy-1\b/);
    expect(trackerSource).toContain('commanderDamageChipPaddingClass()');
  });

  it('hides a closed sheet instead of painting it behind the seats', () => {
    const open = 'absolute inset-0 flex z-50';
    expect(commanderSheetClass(false, open)).toBe('hidden');
    expect(commanderSheetClass(true, open)).toBe(open);
    expect(commanderSheetClass(true, open)).not.toContain('rotate-90');
    expect(trackerSource).toContain('commanderSheetClass(');
    expect(trackerSource).not.toContain('life-flowers');
  });
});

describe('life tap', () => {
  it('draws a plain plus or minus and never a flower image', () => {
    expect(lifeTapGlyph(1)).toBe('+');
    expect(lifeTapGlyph(-1)).toBe('-');
    expect(lifeTapGlyph(1)).not.toMatch(/flower|img|http/i);
    expect(trackerSource).toContain('lifeTapGlyph(');
    expect(trackerSource).not.toContain('life-flowers');
  });
});

describe('match menu time', () => {
  it('pins the clock with the TIME title instead of centering it in the pane', () => {
    expect(matchMenuBodyClass('start', false)).toBe('justify-start');
    expect(matchMenuBodyClass('center', false)).toBe('justify-center');
    expect(trackerSource).toContain('align="start"');
    expect(trackerSource).toContain('matchMenuBodyClass(');
  });
});

describe('tablet controls', () => {
  it('grows menu buttons only when both sides of the screen are tablet-sized', () => {
    const styles = readFileSync(
      new URL('../styles.css', import.meta.url),
      'utf8',
    );
    expect(styles).toContain(
      '@media (min-width: 700px) and (min-height: 700px)',
    );
    expect(tabletMenuButtonClass()).toContain('tablet:min-h-16');
    expect(tabletMenuButtonClass().startsWith('tablet:')).toBe(true);
    expect(tabletMenuGridClass()).toContain('tablet:[&_button]:h-full');
    expect(tabletMenuStackButtonClass()).toContain('tablet:flex-1');
    expect(tabletMenuButtonLargeClass()).toContain('tablet:min-h-20');
    expect(tabletDialClass()).toBe('tablet:size-32');
    expect(trackerSource).toContain('h-9');
    expect(trackerSource).toContain('tabletMenuButtonClass()');
    expect(trackerSource).toContain('tabletMenuGridClass()');
    expect(trackerSource).toContain('tabletDialClass()');
    expect(tabletSeatRailClass()).toContain('tablet:w-20');
    expect(tabletSeatIconClass()).toContain('tablet:size-16');
    expect(tabletDungeonButtonClass()).toContain('tablet:w-16');
    expect(tabletLifeGlyphClass()).toBe('tablet:text-5xl');
    expect(tabletCounterBadgeClass()).toContain('tablet:text-sm');
    expect(tabletSeatIconClass().startsWith('tablet:')).toBe(true);
    expect(trackerSource).toContain('size-9');
    expect(trackerSource).toContain('w-9');
    expect(trackerSource).toContain('text-2xl');
    expect(trackerSource).toContain('tabletSeatIconClass()');
    expect(trackerSource).toContain('tabletSeatRailClass()');
    expect(trackerSource).toContain('tabletLifeGlyphClass()');
  });
});
