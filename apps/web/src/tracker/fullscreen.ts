import { useEffect } from 'react';

/** A browser may require a fresh gesture when the tracker is opened from a saved game. */
export function useTrackerFullscreen(active: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    if (!active || !document.fullscreenEnabled || !root.requestFullscreen || document.fullscreenElement) {
      return;
    }

    let mounted = true;
    let pending = false;
    let entered = false;

    function exitOwnedFullscreen() {
      if (document.fullscreenElement === root) {
        void document.exitFullscreen().catch(() => undefined);
      }
    }

    async function enter() {
      if (!mounted || pending || entered || document.fullscreenElement) return;
      pending = true;
      try {
        // The root keeps dialogs portaled to the document body visible.
        await root.requestFullscreen();
        entered = true;
        document.removeEventListener('click', onClick, true);
        if (!mounted) exitOwnedFullscreen();
      } catch {
        // A browser that rejects this request can still accept a later gesture.
      } finally {
        pending = false;
      }
    }

    function onClick(event: MouseEvent) {
      if (event.isTrusted) void enter();
    }

    document.addEventListener('click', onClick, true);
    if (navigator.userActivation?.isActive) void enter();
    return () => {
      mounted = false;
      document.removeEventListener('click', onClick, true);
      if (entered) exitOwnedFullscreen();
    };
  }, [active]);
}
