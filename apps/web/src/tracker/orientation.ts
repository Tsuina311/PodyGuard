import { useEffect, useRef, useState } from 'react';

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

export type OrientationTarget = 'landscape' | 'portrait';

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: OrientationTarget) => Promise<void>;
  unlock?: () => void;
};

/**
 * The lock, when this browser has one to give. Desktop keeps its window: the
 * coarse pointer is the closest thing to "this is a phone" the platform offers.
 */
function orientationLocker(): {
  lock: (target: OrientationTarget) => Promise<void>;
  unlock: () => void;
} | null {
  if (!window.matchMedia('(pointer: coarse)').matches) {
    return null;
  }
  const orientation: LockableOrientation | undefined = screen.orientation;
  if (!orientation || typeof orientation.lock !== 'function') {
    return null;
  }
  const lock = orientation.lock.bind(orientation);
  const unlock = orientation.unlock?.bind(orientation);
  return { lock, unlock: unlock ?? (() => undefined) };
}

/**
 * Holds the phone at `target` for as long as one is asked for, where the browser
 * allows it. Pass null during pre-game deal / seating screens so those keep
 * whichever way the phone is already held.
 *
 * Chrome Android only grants the lock in element-level fullscreen, and
 * fullscreen only off a user gesture, so a failed lock that asks for fullscreen
 * is retried after `requestFullscreen`. The gesture that opened the board pays
 * for the first attempt; later taps retry until it sticks. Coming back from
 * another app unlocks the phone, so visibility/focus also re-arms the lock.
 *
 * Fullscreen is held across a change of target and only handed back on the way
 * out, because re-entering it costs another gesture — turning the phone for a
 * card and back again must not spend one.
 *
 * WebKit has neither this lock nor a per-page manifest orientation, so on an
 * iPhone nothing here fires and `useBoardLandscape` rotates the board instead.
 *
 * Desktop Chrome (and DevTools phone mode) exposes `orientation.lock` but always
 * rejects with NotSupportedError. Asking for fullscreen first made every dial
 * tap enter/exit fullscreen. Try the lock bare first; only enter fullscreen when
 * the refusal is the mobile “need fullscreen” error, and never again once the
 * platform has said the lock is unavailable.
 */
export function useOrientationLock(target: OrientationTarget | null): void {
  const unsupported = useRef(false);

  useEffect(
    () => () => {
      orientationLocker()?.unlock();
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
    },
    [],
  );

  useEffect(() => {
    const locker = orientationLocker();
    if (!locker) {
      return;
    }
    if (!target) {
      locker.unlock();
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
      return;
    }

    const requested = target;
    const { lock } = locker;
    let cancelled = false;
    let locked = false;
    let inflight = false;

    async function lockOrientation(): Promise<void> {
      if (cancelled || locked || inflight || unsupported.current) {
        return;
      }
      inflight = true;
      let enteredFullscreen = false;
      try {
        try {
          await lock(requested);
          locked = true;
          return;
        } catch (error) {
          if (cancelled) {
            return;
          }
          if (orientationLockUnavailable(error)) {
            unsupported.current = true;
            return;
          }
          if (!orientationLockNeedsFullscreen(error)) {
            unsupported.current = true;
            return;
          }
        }
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen({
            navigationUI: 'hide',
          });
          enteredFullscreen = Boolean(document.fullscreenElement);
        }
        if (cancelled) {
          return;
        }
        await lock(requested);
        locked = true;
      } catch (error) {
        locked = false;
        if (orientationLockUnavailable(error) || enteredFullscreen) {
          unsupported.current = true;
        }
        if (enteredFullscreen && document.fullscreenElement) {
          void document.exitFullscreen().catch(() => undefined);
        }
      } finally {
        inflight = false;
      }
    }

    function retryFromGesture(): void {
      if (!locked && !unsupported.current) {
        void lockOrientation();
      }
    }

    function onVisible(): void {
      if (document.visibilityState !== 'visible') {
        locked = false;
        return;
      }
      void lockOrientation();
    }

    void lockOrientation();
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
    };
  }, [target]);
}

/** Desktop browsers: lock exists but will never succeed on this device. */
function orientationLockUnavailable(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    return false;
  }
  if (error.name === 'NotSupportedError') {
    return true;
  }
  return /not available on this device/i.test(error.message);
}

/** Mobile Chrome: lock is supported once the document is fullscreen. */
function orientationLockNeedsFullscreen(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    return false;
  }
  if (error.name === 'NotAllowedError') {
    return true;
  }
  if (error.name === 'SecurityError') {
    return /fullscreen/i.test(error.message);
  }
  return false;
}
