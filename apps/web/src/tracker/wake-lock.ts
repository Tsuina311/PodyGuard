import { useEffect } from 'react';

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (
    type: 'release',
    listener: () => void,
  ) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
};

/**
 * Keeps the screen on while the life tracker is open. Phones otherwise dim
 * mid-game when nobody is tapping. Re-requests after the tab becomes visible
 * again — iOS and Android drop the lock in the background.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) {
      return;
    }
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLock) {
      return;
    }

    let cancelled = false;
    let sentinel: WakeLockSentinelLike | null = null;

    async function request(): Promise<void> {
      if (cancelled || document.visibilityState !== 'visible') {
        return;
      }
      try {
        sentinel = await wakeLock!.request('screen');
        sentinel.addEventListener('release', () => {
          sentinel = null;
        });
      } catch {
        // Permission, low battery, or unsupported context — leave the phone alone.
      }
    }

    void request();

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        void request();
      }
    }

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (sentinel && !sentinel.released) {
        void sentinel.release().catch(() => undefined);
      }
    };
  }, [active]);
}
