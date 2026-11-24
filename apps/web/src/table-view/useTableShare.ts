import { useEffect, useRef, useState } from 'react';
import type { TableViewState } from '@podyguard/shared';
import { ApiError, request } from '../api';
import { readStored, removeStored, writeStored } from '../device-storage';
import type { TrackerState } from '../tracker/engine';
type Credentials = { id: string; readToken: string; writeToken: string };
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
export function publicTableState(state: TrackerState): TableViewState {
  return {
    format: `${state.gameMode} · ${state.rulesFormat}`,
    startedAt: state.startedAt,
    paused: Boolean(state.pausedAt),
    winnerId: state.winnerId,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      life: p.life,
      poison: p.poison,
      commanders: p.commanders.map((c) => ({ id: c.id, name: c.name })),
      commanderDamage: { ...p.commanderDamage },
    })),
  };
}
export function useTableShare(
  storageKey: string,
  state: TrackerState,
  eventContext?: { joinCode: string; token: string },
  eventViewUrl?: string,
) {
  const key = `${storageKey}:view-session`;
  const [credentials, setCredentials] = useState<Credentials | null>(() => {
    try {
      const value = JSON.parse(readStored(key) ?? 'null');
      return value &&
        ['id', 'readToken', 'writeToken'].every(
          (k) =>
            typeof value[k] === 'string' && /^[a-f0-9]{64}$/.test(value[k]),
        )
        ? value
        : null;
    } catch {
      return null;
    }
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    if (!credentials || eventViewUrl) return;
    let cancelled = false;
    let timer = 0;
    const controller = new AbortController();
    async function publish() {
      try {
        await request(`/tracker-shares/${credentials!.id}`, {
          method: 'PUT',
          headers: auth(credentials!.writeToken),
          body: JSON.stringify(publicTableState(latest.current)),
          signal: controller.signal,
        });
        if (!cancelled) setError('');
      } catch (e) {
        if (!cancelled) {
          if (e instanceof ApiError && e.status === 404) {
            removeStored(key);
            setCredentials(null);
            setError(
              'Viewing link expired. Start sharing again to get a new link.',
            );
            return;
          }
          setError(
            'Updates are offline. Viewers will see a warning until the main device reconnects.',
          );
        }
      }
      if (!cancelled) timer = window.setTimeout(() => void publish(), 1000);
    }
    void publish();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [credentials, key, eventViewUrl]);
  async function start() {
    if (eventViewUrl) return;
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const value = await request<Credentials>('/tracker-shares', {
        method: 'POST',
        ...(eventContext ? { headers: auth(eventContext.token) } : {}),
        body: JSON.stringify({
          ...publicTableState(latest.current),
          ...(eventContext ? { eventCode: eventContext.joinCode } : {}),
        }),
      });
      writeStored(key, JSON.stringify(value));
      setCredentials(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not share this game.');
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    if (eventViewUrl) return;
    if (!credentials || busy) return;
    setBusy(true);
    setError('');
    try {
      await request(`/tracker-shares/${credentials.id}`, {
        method: 'DELETE',
        headers: auth(credentials.writeToken),
      });
      removeStored(key);
      setCredentials(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not stop sharing.');
    } finally {
      setBusy(false);
    }
  }
  return {
    required: Boolean(eventViewUrl),
    url: eventViewUrl ?? (credentials
      ? `${window.location.origin}${window.location.pathname}#/watch/${credentials.id}?token=${credentials.readToken}`
      : null),
    busy,
    error,
    start,
    stop,
  };
}
