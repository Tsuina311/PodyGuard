import { useEffect, useRef, useState } from 'react';

type Sentinel = {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
};
export type WakeStatus = 'requesting' | 'active' | 'unavailable';

/** iPadOS may release a lock while still visible, not only on app switching. */
export function useWakeLock(active: boolean) {
  const [status, setStatus] = useState<WakeStatus>('requesting');
  const retryRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (!active) return;
    const api = (
      navigator as Navigator & {
        wakeLock?: { request(type: 'screen'): Promise<Sentinel> };
      }
    ).wakeLock;
    if (!api) {
      setStatus('unavailable');
      return;
    }
    let cancelled = false;
    let pending = false;
    let sentinel: Sentinel | null = null;
    let timer = 0;
    async function request() {
      if (
        cancelled ||
        pending ||
        (sentinel && !sentinel.released) ||
        document.visibilityState !== 'visible'
      )
        return;
      pending = true;
      setStatus('requesting');
      try {
        const lock = await api!.request('screen');
        if (cancelled) {
          await lock.release();
          return;
        }
        sentinel = lock;
        setStatus('active');
        lock.addEventListener('release', () => {
          if (sentinel !== lock) return;
          sentinel = null;
          if (cancelled) return;
          setStatus('unavailable');
          window.clearTimeout(timer);
          // One automatic retry; denial waits for a real interaction or return.
          timer = window.setTimeout(() => void request(), 1000);
        });
      } catch {
        if (!cancelled) setStatus('unavailable');
      } finally {
        pending = false;
      }
    }
    const retry = () => {
      void request();
    };
    retryRef.current = retry;
    retry();
    document.addEventListener('visibilitychange', retry);
    document.addEventListener('pointerup', retry);
    window.addEventListener('pageshow', retry);
    window.addEventListener('focus', retry);
    return () => {
      cancelled = true;
      retryRef.current = () => undefined;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', retry);
      document.removeEventListener('pointerup', retry);
      window.removeEventListener('pageshow', retry);
      window.removeEventListener('focus', retry);
      if (sentinel && !sentinel.released)
        void sentinel.release().catch(() => undefined);
    };
  }, [active]);
  return { status, retry: () => retryRef.current() };
}
