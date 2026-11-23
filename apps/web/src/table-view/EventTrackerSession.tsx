import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { validEventTrackerState, type EventTrackerSnapshot, type GameMode, type RulesFormat, type PublicParticipant } from '@podyguard/shared';
import { ApiError, request } from '../api';
import { readStored, writeStored } from '../device-storage';
import { createPlayerScope } from '../player-sessions';
import { createTracker, type TrackerSeed, type TrackerState } from '../tracker/engine';
import type { TrackerHistory } from '../tracker/TrackerView';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { ReadOnlyTracker } from './ReadOnlyTracker';

export type TrackerIntent = { mode: 'claim' | 'view' | 'transfer'; generation?: number; id?: string };
export type ControllerSession = {
  initialHistory: TrackerHistory; onHistory: (history: TrackerHistory) => void;
  canEdit: () => boolean; viewUrl: string;
  finish: (winnerParticipantId: string, durationSeconds: number) => Promise<{ participant: PublicParticipant }>;
};
type Cache = { snapshot: EventTrackerSnapshot; history: TrackerHistory; dirty: boolean; handingOff: boolean };
async function trackerRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try { return await request<T>(path, { ...init, signal: controller.signal }); }
  finally { window.clearTimeout(timeout); }
}

export function EventTrackerSession({ joinCode, token, storageKey, players, gameMode, rulesFormat, gameId, intent, onClose, children }: {
  joinCode: string; token: string; storageKey: string; players: TrackerSeed[]; gameMode: GameMode;
  rulesFormat: RulesFormat; gameId: string; intent: TrackerIntent; onClose: () => void;
  children: (session: ControllerSession) => ReactNode;
}) {
  const { t } = useTranslation();
  const [device] = useState(() => {
    const key = `${storageKey}:controller-device`;
    const value = readStored(key) || createPlayerScope();
    writeStored(key, value);
    return value;
  });
  const endpoint = `/events/${encodeURIComponent(joinCode)}/tracker`;
  const cacheKey = `${storageKey}:controller-cache`;
  const [snapshot, setSnapshot] = useState<EventTrackerSnapshot | null>(null);
  const current = useRef<EventTrackerSnapshot | null>(null);
  const latest = useRef<TrackerHistory | null>(null);
  const dirty = useRef(false);
  const handingOff = useRef(false);
  const alive = useRef(false);
  const saving = useRef<Promise<void> | null>(null);
  const debounce = useRef(0);
  const firstDirtyAt = useRef(0);
  const [error, setError] = useState('');
  const [instance, setInstance] = useState(0);
  const [viewing, setViewing] = useState(intent.mode === 'view');
  const [retry, setRetry] = useState(0);
  const [waiting, setWaiting] = useState(intent.mode === 'transfer');
  function persist() {
    if (!current.current?.owned || !latest.current) return;
    writeStored(cacheKey, JSON.stringify({ snapshot: current.current, history: latest.current, dirty: dirty.current, handingOff: handingOff.current } satisfies Cache));
    writeStored(storageKey, JSON.stringify(latest.current.present));
    writeStored(`${storageKey}:controller-game`, gameId);
  }
  const post = useCallback(async (op: string, body: object) => (await trackerRequest<{ tracker: EventTrackerSnapshot }>(`${endpoint}/${op}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ device, gameId, ...body }),
  })).tracker, [endpoint, token, device, gameId]);
  function accept(next: EventTrackerSnapshot, reset = false) {
    if (!alive.current || next.gameId !== gameId) return;
    const before = current.current;
    if (before && (next.generation < before.generation || (next.generation === before.generation && next.revision < before.revision))) return;
    const changed = before && next.generation !== before.generation;
    current.current = next;
    if (reset || changed) {
      latest.current = (next.history as unknown as TrackerHistory) ?? null;
      dirty.current = false;
      handingOff.current = false;
      setInstance(n => n + 1);
    }
    setSnapshot(next);
    persist();
  }
  const flush = useCallback(async () => {
    window.clearTimeout(debounce.current);
    if (saving.current) return saving.current;
    const work = async () => {
      try {
        while (alive.current && current.current?.owned && dirty.current && latest.current && !handingOff.current) {
          const row = current.current;
          const history = latest.current;
          const next = await post('update', { id: row.id, generation: row.generation, revision: row.revision, history });
          if (latest.current === history) dirty.current = false;
          accept(next);
          firstDirtyAt.current = 0;
          if (alive.current) setError('');
        }
      } catch (e) {
        if (!alive.current) return;
        if (e instanceof ApiError && (e.status === 403 || e.status === 409)) {
          handingOff.current = true;
          persist();
          setError(t('eventTracker.moved'));
        } else setError(t('eventTracker.offline'));
      }
    };
    saving.current = work();
    try { await saving.current; } finally { saving.current = null; }
  }, [post, t]);
  const onHistory = useCallback((history: TrackerHistory) => {
    if (!current.current?.owned || handingOff.current) return;
    if (JSON.stringify(history) === JSON.stringify(latest.current)) return;
    latest.current = history;
    dirty.current = true;
    persist(); // Every tap is saved locally; only network writes are debounced.
    firstDirtyAt.current ||= Date.now();
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void flush(), Math.max(0, Math.min(400, 1200 - (Date.now() - firstDirtyAt.current))));
  }, [flush]);

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    let timer = 0;
    let cached: Cache | null = null;
    try {
      const value = JSON.parse(readStored(cacheKey) ?? 'null') as Cache | null;
      if (value?.snapshot.gameId === gameId && value.snapshot.owned && validEventTrackerState(value.history.present)) cached = value;
    } catch { /* Ignore malformed storage. */ }
    async function get() {
      return (await trackerRequest<{ tracker: EventTrackerSnapshot | null }>(`${endpoint}?device=${device}&gameId=${encodeURIComponent(gameId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })).tracker;
    }
    async function poll() {
      try {
        let next = await get();
        if (cancelled || !next) return;
        if (next.owned) {
          if (!current.current?.owned || current.current.generation !== next.generation) {
            accept(next, true);
            setViewing(false);
          }
          if (handingOff.current) {
            // Resolve an interrupted handoff atomically before allowing edits.
            next = await post('cancel-transfer', { id: next.id, generation: next.generation });
            handingOff.current = false;
            accept(next, !dirty.current);
          }
          await flush();
          if (dirty.current || handingOff.current) return;
          if (next.transfer) {
            // Input is locked only for the live handshake, after pending taps were saved.
            handingOff.current = true;
            persist();
            const row = current.current!;
            const handed = await post('handoff', { id: row.id, generation: row.generation, revision: row.revision,
              transferId: next.transfer.id, history: latest.current });
            accept(handed, true);
            setViewing(true);
            setWaiting(false);
          } else {
            const row = current.current ?? next;
            accept(await post('heartbeat', { id: row.id, generation: row.generation }));
          }
        } else {
          accept(next);
          if (!next.transfer) setWaiting(false);
        }
        if (next.owned && current.current?.owned) setWaiting(false);
        setError('');
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError && e.status === 403 ? t('eventTracker.moved') : t('eventTracker.offline'));
      } finally { if (!cancelled) timer = window.setTimeout(() => void poll(), 1500); }
    }
    async function open() {
      try {
        let next: EventTrackerSnapshot | null;
        if (intent.mode === 'claim') {
          let state = createTracker(players, Date.now(), { gameMode, rulesFormat });
          // Upgrade an ongoing local tracker without resetting its life totals or starting player.
          // An existing server tracker always wins: claim never overwrites it.
          try {
            const saved: unknown = JSON.parse(readStored(storageKey) ?? 'null');
            const savedGame = readStored(`${storageKey}:controller-game`);
            if ((!savedGame || savedGame === gameId) && validEventTrackerState(saved) &&
                saved.gameMode === gameMode && saved.rulesFormat === rulesFormat &&
                (saved.players as TrackerSeed[]).map(p => p.id).sort().join(':') === players.map(p => p.id).sort().join(':')) {
              state = saved as unknown as TrackerState;
            }
          } catch { /* Invalid local storage cannot seed the shared tracker. */ }
          next = await post('claim', { history: { present: state, past: [] } });
        } else if (intent.mode === 'transfer' && retry === 0) {
          next = await post('transfer', { id: intent.id, generation: intent.generation });
        } else next = await get();
        if (cancelled) return;
        if (!next) throw new Error(t('eventTracker.notStarted'));
        accept(next, true);
        if (cached && next.owned && cached.snapshot.id === next.id && cached.snapshot.generation === next.generation && (cached.dirty || cached.handingOff)) {
          latest.current = cached.history;
          dirty.current = cached.dirty;
          handingOff.current = cached.handingOff;
          current.current = { ...next, history: cached.history as unknown as EventTrackerSnapshot['history'] };
          setSnapshot(current.current);
          setInstance(n => n + 1);
          persist();
        }
      } catch {
        if (cancelled) return;
        if (cached && intent.mode === 'claim') {
          current.current = cached.snapshot;
          latest.current = cached.history;
          dirty.current = cached.dirty;
          handingOff.current = cached.handingOff;
          setSnapshot({ ...cached.snapshot, history: cached.history as unknown as EventTrackerSnapshot['history'] });
        }
        setError(t('eventTracker.offline'));
      }
      if (!cancelled) void poll();
    }
    void open();
    const offline = () => setError(t('eventTracker.offline'));
    window.addEventListener('offline', offline);
    return () => {
      cancelled = true;
      alive.current = false;
      persist();
      window.clearTimeout(timer);
      window.clearTimeout(debounce.current);
      window.removeEventListener('offline', offline);
    };
    // The caller keys this component by game and intent; roster changes must not restart it.
  }, [post, retry]);

  async function transfer() {
    if (!snapshot || waiting) return;
    setWaiting(true);
    try {
      accept(await post('transfer', { id: snapshot.id, generation: snapshot.generation }));
      setError('');
    } catch (e) { setWaiting(false); setError(e instanceof Error ? e.message : t('eventTracker.offline')); }
  }
  if (snapshot?.owned && !viewing && snapshot.history) return <div key={`${snapshot.generation}:${instance}`}>
    {error && <p role="status" className="pointer-events-none fixed inset-x-4 bottom-2 z-[80] rounded-xl bg-hull p-2 text-center text-sm text-warning">{handingOff.current ? t('eventTracker.confirming') : error}</p>}
    {children({ initialHistory: snapshot.history as unknown as TrackerHistory, onHistory,
      canEdit: () => Boolean(alive.current && current.current?.owned && !handingOff.current),
      viewUrl: `${window.location.origin}${window.location.pathname}#/watch/event-${snapshot.id}?token=${snapshot.readToken}`,
      finish: async (winnerParticipantId, durationSeconds) => {
        await flush();
        if (dirty.current || handingOff.current || !current.current?.owned) throw new Error(t('eventTracker.offline'));
        return request(`${endpoint}/finish`, { method: 'POST', headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ device, gameId, id: current.current.id, generation: current.current.generation, winnerParticipantId, durationSeconds }) });
      } })}
  </div>;
  if (snapshot && viewing) return <ReadOnlyTracker state={snapshot.state as unknown as TrackerState} ownerName={snapshot.ownerName}
    stale={Boolean(error) || Date.now() - snapshot.updatedAt > 10_000} error={waiting ? t('eventTracker.waiting') : error ? t('eventTracker.stale') : ''}
    onClose={onClose} onTransfer={!snapshot.owned && !waiting ? () => void transfer() : undefined} />;
  return <Panel title={snapshot ? t('eventTracker.trackedBy', { name: snapshot.ownerName }) : t('eventTracker.opening')}>
    {(error || waiting) && <p role="status" className="mb-3 text-sm text-warning">{waiting ? t('eventTracker.waiting') : error}</p>}
    <div className="flex flex-wrap gap-2">
      {snapshot && <>
        <Button variant="outline" onClick={() => setViewing(true)}>{t('eventTracker.readOnly')}</Button>
        <Button disabled={waiting} onClick={() => void transfer()}>{t('eventTracker.transfer')}</Button>
      </>}
      {!snapshot && error && <Button onClick={() => setRetry(n => n + 1)}>{t('eventTracker.retry')}</Button>}
      <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
    </div>
  </Panel>;
}
