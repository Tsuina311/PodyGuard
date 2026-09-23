import { cx } from '../ui/cx';

/**
 * Fixed overlay geometry that matches the life-tracker board.
 *
 * When the OS will not lock landscape (every iPhone), the board CSS-rotates a
 * portrait phone into a landscape frame (`rotate-90` + swapped dvw/dvh). Any
 * overlay portaled to `document.body` must use the same frame — otherwise it
 * paints into the raw portrait viewport while the board looks sideways.
 */
export function forceRotateFrameClass(forceRotate: boolean): string {
  if (!forceRotate) {
    return 'inset-x-0 top-0 h-[100dvh] w-full';
  }
  return cx(
    'board-landscape',
    'top-1/2 left-1/2 h-[100dvw] w-[100dvh] -translate-x-1/2 -translate-y-1/2 rotate-90',
  );
}

/**
 * Full-bleed life-tracker overlay chrome for sheets that must sit on
 * `document.body` (and therefore cannot inherit the board transform). Callers
 * must not also set `inset-*` / `h-[100dvh]` — those fight the force-rotate
 * dimensions.
 *
 * Prefer {@link inBoardOverlayClass} for match menu / commander / counters —
 * those stay inside the board shell so they cannot get a second rotate.
 */
export function trackerOverlayClass(
  forceRotate: boolean,
  ...extra: Array<string | false | null | undefined>
): string {
  return cx('fixed flex', forceRotateFrameClass(forceRotate), ...extra);
}

/**
 * Overlay that lives inside the CSS-rotated board shell. Absolute fill only —
 * never add `rotate-90` here or the picker goes sideways.
 */
export function inBoardOverlayClass(
  ...extra: Array<string | false | null | undefined>
): string {
  return cx('absolute inset-0 flex', ...extra);
}

/**
 * Far-side seats flip content 180°. Must sit on an *inner* node — never on the
 * same element as `rotate-90`, or Tailwind's rotate utilities cancel the shell.
 */
export function seatFacingContentClass(facesAway: boolean): string {
  return facesAway ? 'landscape:rotate-180' : '';
}
