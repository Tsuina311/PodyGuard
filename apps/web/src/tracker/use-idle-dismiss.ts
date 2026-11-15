import { useCallback, useEffect, useRef } from 'react';

/** Seat chrome from the dial hides after this if nothing else takes over. */
export const SEAT_CONTROLS_HIDE_MS = 4000;

/**
 * Calls `onDismiss` once `idleMs` elapses with no `bump()` since activation.
 * Opening starts the clock; each bump restarts it. Inactive clears the timer.
 */
export function useIdleDismiss(
  active: boolean,
  onDismiss: () => void,
  idleMs: number,
): () => void {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const timerRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const bump = useCallback(() => {
    clear();
    if (!active) {
      return;
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onDismissRef.current();
    }, idleMs);
  }, [active, clear, idleMs]);

  useEffect(() => {
    if (!active) {
      clear();
      return;
    }
    bump();
    return clear;
  }, [active, bump, clear]);

  return bump;
}
