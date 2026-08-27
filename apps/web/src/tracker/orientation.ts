import { useEffect, useState } from 'react';

/**
 * True while the device is on its side.
 *
 * Some of the board is geometry rather than styling — a rotated card's viewBox,
 * for one — so the orientation has to be readable from JavaScript and not only
 * from a `landscape:` class. Re-checks on focus/visibility because returning
 * from another app can leave a stale matchMedia result.
 */
export function useLandscape(): boolean {
  const [landscape, setLandscape] = useState(
    () => window.matchMedia('(orientation: landscape)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(orientation: landscape)');
    function sync() {
      setLandscape(query.matches);
    }
    sync();
    query.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pageshow', sync);
    window.addEventListener('focus', sync);
    return () => {
      query.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('pageshow', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  return landscape;
}

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(
    () => window.matchMedia('(pointer: coarse)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    function sync() {
      setCoarse(query.matches);
    }
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  return coarse;
}

/**
 * Board layout orientation. On a phone held upright, WebKit cannot lock the
 * OS orientation, so the board pretends it is landscape and CSS rotates the
 * shell — `forceRotate` is the signal for that transform.
 */
export function useBoardLandscape(): {
  landscape: boolean;
  forceRotate: boolean;
} {
  const natural = useLandscape();
  const coarse = useCoarsePointer();
  const forceRotate = coarse && !natural;
  return {
    landscape: natural || forceRotate,
    forceRotate,
  };
}

/**
 * Turns the phone on its side for as long as the life tracker board is up,
 * where the browser allows it. Pass `enabled` false during pre-game deal /
 * seating screens so those stay portrait.
 *
 * Chrome only grants the lock to a document in element-level fullscreen, and
 * fullscreen only off a user gesture, so the two are asked for together. The
 * gesture that opened the board pays for the first attempt; later taps retry
 * until it sticks. Coming back from another app unlocks the phone, so
 * visibility/focus also re-arms the lock.
 *
 * WebKit has neither this lock nor a per-page manifest orientation, so on an
 * iPhone nothing here fires and `useBoardLandscape` rotates the board instead.
 *
 * Desktop Chrome with the phone emulator reports a coarse pointer and can enter
 * fullscreen, but orientation.lock still rejects — without a bail-out every
 * click would keep toggling fullscreen. Once fullscreen is entered and lock
 * still fails, we stop and leave the window alone.
 */
export function useLandscapeLock(enabled = true): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    type LockableOrientation = ScreenOrientation & {
      lock?: (orientation: 'landscape') => Promise<void>;
      unlock?: () => void;
    };

    if (!window.matchMedia('(pointer: coarse)').matches) {
      return;
    }
    const orientation: LockableOrientation | undefined = screen.orientation;
    if (!orientation || typeof orientation.lock !== 'function') {
      return;
    }
    const lockLandscapeOrientation = orientation.lock.bind(orientation);

    let cancelled = false;
    let locked = false;
    let inflight = false;
    let unsupported = false;

    async function lockLandscape(): Promise<void> {
      if (cancelled || locked || inflight || unsupported) {
        return;
      }
      inflight = true;
      let enteredFullscreen = false;
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen({
            navigationUI: 'hide',
          });
          enteredFullscreen = Boolean(document.fullscreenElement);
        }
        if (cancelled) {
          return;
        }
        await lockLandscapeOrientation('landscape');
        locked = true;
      } catch {
        locked = false;
        // Fullscreen without a working orientation lock is desktop / DevTools
        // noise: exit and do not ask again on every pointerdown.
        if (enteredFullscreen || document.fullscreenElement) {
          unsupported = true;
          if (document.fullscreenElement) {
            void document.exitFullscreen().catch(() => undefined);
          }
        }
      } finally {
        inflight = false;
      }
    }

    function retryFromGesture(): void {
      if (!locked && !unsupported) {
        void lockLandscape();
      }
    }

    function onVisible(): void {
      if (document.visibilityState !== 'visible') {
        locked = false;
        return;
      }
      void lockLandscape();
    }

    void lockLandscape();
    window.addEventListener('pointerdown', retryFromGesture);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', retryFromGesture);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
      window.removeEventListener('focus', onVisible);
      orientation.unlock?.();
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [enabled]);
}
