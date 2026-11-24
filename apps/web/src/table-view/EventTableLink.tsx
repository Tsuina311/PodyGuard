import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventTrackerSnapshot } from '@podyguard/shared';
import { request } from '../api';
import { readStored } from '../device-storage';
import { Button } from '../ui/Button';

export function EventTableLink({ joinCode, token, gameId, storageKey, busy, onStart, onView, onTransfer, onWithout }: {
  joinCode: string; token: string; gameId: string; storageKey: string; busy: boolean;
  onStart: () => void; onView: () => void; onTransfer: (generation: number, id: string) => void; onWithout?: () => void;
}) {
  const { t } = useTranslation();
  const [tracker, setTracker] = useState<EventTrackerSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    setLoaded(false);
    let cancelled = false;
    let timer = 0;
    const controller = new AbortController();
    async function refresh() {
      try {
        const device = readStored(`${storageKey}:controller-device`) ?? '';
        const result = await request<{ tracker: EventTrackerSnapshot | null }>(
          `/events/${encodeURIComponent(joinCode)}/tracker?device=${encodeURIComponent(device)}&gameId=${encodeURIComponent(gameId)}`, {
            headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
          });
        if (!cancelled) { setTracker(result.tracker); setLoaded(true); setError(false); }
      } catch { if (!cancelled) setError(true); }
      if (!cancelled) timer = window.setTimeout(() => void refresh(), 1500);
    }
    void refresh();
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timer); };
  }, [joinCode, token, gameId, storageKey]);
  if (error || !loaded) return <p role="status" className="mb-3 text-sm text-muted">{t(error ? 'eventTracker.offline' : 'eventTracker.opening')}</p>;
  return <div className="mb-3 rounded-xl border border-neon/40 p-3">
    {tracker && <p className="mb-3 font-semibold text-ink">{t('eventTracker.trackedBy', { name: tracker.ownerName })}</p>}
    <div className="flex flex-col gap-2">
      {!tracker || tracker.owned ? <Button variant="neon" size="lg" block disabled={busy} onClick={onStart}>
        {t(tracker ? 'eventTracker.resume' : 'join.useGameTracker')}
      </Button> : <>
        <Button variant="outline" block onClick={onView}>{t('eventTracker.readOnly')}</Button>
        <Button variant="neon" block onClick={() => onTransfer(tracker.generation, tracker.id)}>{t('eventTracker.transfer')}</Button>
      </>}
      {!tracker && onWithout && <Button variant="glass" block disabled={busy} onClick={onWithout}>{t('join.playWithoutTracker')}</Button>}
    </div>
  </div>;
}
