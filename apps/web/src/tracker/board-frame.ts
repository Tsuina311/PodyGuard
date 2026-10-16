import { cx } from '../ui/cx';

/**
 * The life tracker fills the viewport it is given. Seats reflow with that
 * rectangle. The shell is never rotated to imitate another orientation.
 */
export function boardFrameClass(): string {
  return 'inset-x-0 top-0 h-[100dvh] w-full';
}

/**
 * Full-bleed overlay chrome for sheets portaled to `document.body`.
 * Callers must not also set `inset-*` / `h-[100dvh]`.
 *
 * Prefer {@link inBoardOverlayClass} for match menu / commander / counters —
 * those stay inside the board shell.
 */
export function trackerOverlayClass(
  ...extra: Array<string | false | null | undefined>
): string {
  return cx('fixed flex', boardFrameClass(), ...extra);
}

/**
 * Overlay that lives inside the board shell. Absolute fill only.
 */
export function inBoardOverlayClass(
  ...extra: Array<string | false | null | undefined>
): string {
  return cx('absolute inset-0 flex', ...extra);
}
