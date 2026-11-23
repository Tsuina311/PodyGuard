import { useEffect, useState } from 'react';
import { listSavedPlayerEvents } from './player-sessions';

/** Refresh after another tab joins/leaves, and after mobile browser page restoration. */
export function useSavedPlayers() {
  const [events, setEvents] = useState(listSavedPlayerEvents);
  useEffect(() => {
    const refresh = () => setEvents(listSavedPlayerEvents());
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    const names = ['storage', 'focus', 'pageshow', 'podyguard:player-sessions'];
    names.forEach(name => window.addEventListener(name, refresh));
    document.addEventListener('visibilitychange', visible);
    refresh();
    return () => {
      names.forEach(name => window.removeEventListener(name, refresh));
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  return events;
}
