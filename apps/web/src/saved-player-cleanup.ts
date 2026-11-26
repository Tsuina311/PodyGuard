import { ApiError, getEvent } from './api';
import { clearPlayerSession, listSavedPlayerEvents } from './player-sessions';

// Share checks between the home shortcut, recent events and the recovery page.
// Failed requests never destroy identities: an offline phone must remain recoverable.
const checked = new Map<string, number>();
const pending = new Map<string, Promise<void>>();
export async function pruneInactiveSavedPlayers(now = Date.now()): Promise<void> {
  const events = listSavedPlayerEvents();
  for (let offset = 0; offset < events.length; offset += 4) {
    await Promise.all(events.slice(offset, offset + 4).map(({ joinCode }) => {
      if (pending.has(joinCode)) return pending.get(joinCode);
      if (now - (checked.get(joinCode) ?? 0) < 60_000) return;
      const check = (async () => {
        let inactive = false;
        try {
          const event = await getEvent(joinCode);
          inactive = event.status === 'closed' || Date.parse(event.expiresAt) <= now;
        } catch (error) {
          // The API returns 404 for expired/deleted events too. Never treat an
          // authentication error, sleeping server or network failure as expiry.
          inactive = error instanceof ApiError && error.status === 404 && error.code === 'EVENT_NOT_FOUND';
        }
        checked.set(joinCode, now);
        if (inactive) {
          // Re-enumerate after the request so seats opened in another tab are
          // included. Keep tracker data and unsent actions for manual recovery.
          const saved = listSavedPlayerEvents().find(event => event.joinCode === joinCode);
          saved?.players.forEach(player => clearPlayerSession(joinCode, player.scope));
        }
      })().finally(() => pending.delete(joinCode));
      pending.set(joinCode, check);
      return check;
    }));
  }
}
