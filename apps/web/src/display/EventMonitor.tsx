import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EventMonitorState } from '@podyguard/shared';
import { ApiError, request } from '../api';
import { ReadOnlyTracker } from '../table-view/ReadOnlyTracker';
import type { TrackerState } from '../tracker/engine';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';

export function EventMonitor({ code, hideWhenEmpty = false }: { code: string; hideWhenEmpty?: boolean }) {
  const { t } = useTranslation();
  const [gameId, setGameId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<EventMonitorState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const path = `/events/${encodeURIComponent(code)}/monitor${gameId ? `?gameId=${encodeURIComponent(gameId)}` : ''}`;
    let timer = 0;
    async function poll() {
      try {
        const next = await request<EventMonitorState>(path, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setSnapshot(next);
        setFailed(false);
        if (gameId && !next.games.some(game => game.gameId === gameId)) {
          setGameId(null);
          return;
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 404) setSnapshot(null);
        setFailed(true);
      }
      timer = window.setTimeout(() => void poll(), gameId ? 2000 : 4000);
    }
    void poll();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [code, gameId]);

  function select(id: string | null) {
    setSnapshot(current => current && { ...current, selected: null });
    setGameId(id);
  }

  if (gameId && snapshot?.selected) {
    const { state, ownerName, updatedAt } = snapshot.selected;
    return <ReadOnlyTracker state={state as unknown as TrackerState} ownerName={ownerName}
      tableLabel={snapshot.games.find(game => game.gameId === gameId)?.tableLabel}
      stale={failed || Date.now() - updatedAt > 10_000} onClose={() => select(null)} />;
  }

  if (hideWhenEmpty && !snapshot?.games.length) return null;

  return <Panel title={t('eventMonitor.games')}>
    {failed && <p role="status" className="text-sm text-muted">{t('eventMonitor.unavailable')}</p>}
    {!failed && !snapshot && <p className="text-sm text-muted">{t('common.loading')}</p>}
    {!failed && snapshot?.games.length === 0 && <p className="text-sm text-muted">{t('eventMonitor.empty')}</p>}
    {snapshot?.games.length ? (
      <div className="flex flex-wrap gap-2">
        {snapshot.games.map(game => (
          <Button key={game.gameId} variant="outline" onClick={() => select(game.gameId)} disabled={gameId === game.gameId}>
            {game.tableLabel}
          </Button>
        ))}
      </div>
    ) : null}
  </Panel>;
}
