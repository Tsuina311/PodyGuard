import { useEffect, useState } from 'react';

/**
 * True while the viewport is wider than it is tall.
 *
 * Ally arrows remeasure from this. The board itself does not rotate or lock
 * the phone; grids use the same fact through the `landscape:` variant.
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
