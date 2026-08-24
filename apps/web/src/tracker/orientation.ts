import { useEffect, useState } from 'react';

/**
 * True while the device is on its side.
 *
 * Some of the board is geometry rather than styling — a rotated card's viewBox,
 * for one — so the orientation has to be readable from JavaScript and not only
 * from a `landscape:` class.
 */
export function useLandscape(): boolean {
  const [landscape, setLandscape] = useState(
    () => window.matchMedia('(orientation: landscape)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(orientation: landscape)');
    function update(event: MediaQueryListEvent) {
      setLandscape(event.matches);
    }
    setLandscape(query.matches);
    query.addEventListener('change', update);
    return () => {
      query.removeEventListener('change', update);
    };
  }, []);

  return landscape;
}

/**
 * Turns the phone on its side for as long as the board is up, where the browser
 * allows it.
 *
 * Chrome only grants the lock to a document in element-level fullscreen, and
 * fullscreen only off a user gesture, so the two are asked for together. The
 * gesture that opened the board pays for the first attempt; if it has already
 * been spent by the time this runs, the next tap pays for a retry. Hiding the
 * browser chrome is the other half of what fullscreen buys, which is worth
 * having on its own.
 *
 * WebKit has neither this lock nor the manifest's orientation, so on an iPhone
 * nothing here fires and the board asks to be turned by hand instead.
 */
export function useLandscapeLock(): void {
  useEffect(() => {
    /*
      The lock is absent from the DOM types this project builds against and from
      WebKit at runtime, so it is described here and looked for before it is
      called.
    */
    type LockableOrientation = ScreenOrientation & {
      lock?: (orientation: 'landscape') => Promise<void>;
      unlock?: () => void;
    };

    /*
      A desktop browser would honour the fullscreen half and refuse the lock,
      leaving a developer staring at a fullscreen window they never asked for.
      Only a touch device is trying to be a game board.
    */
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

    async function lockLandscape(): Promise<void> {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen({
            navigationUI: 'hide',
          });
        }
        if (cancelled) {
          return;
        }
        await lockLandscapeOrientation('landscape');
        locked = true;
        window.removeEventListener('pointerdown', retry);
      } catch {
        /* A browser that refuses either half leaves the phone as it is held. */
      }
    }

    /*
      One retry, and only from a tap, which always carries a gesture: if the
      browser refuses that too it is never going to agree, and every later tap
      would pay for a rejected promise to learn the same thing.
    */
    function retry(): void {
      window.removeEventListener('pointerdown', retry);
      if (!locked) {
        void lockLandscape();
      }
    }

    void lockLandscape();
    window.addEventListener('pointerdown', retry);

    return () => {
      cancelled = true;
      window.removeEventListener('pointerdown', retry);
      orientation.unlock?.();
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, []);
}
