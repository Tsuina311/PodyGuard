import { useEffect, useState } from 'react';
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import type { TableViewSnapshot } from '@podyguard/shared';
import { request } from '../api';
import { ThemeToggleCorner } from '../ui/ThemeToggle';
import { Panel } from '../ui/Panel';
export function TableViewPage() {
  const { id = '' } = useParams();
  const [query] = useSearchParams();
  const token = query.get('token') ?? '';
  const location = useLocation();
  const [snapshot, setSnapshot] = useState<TableViewSnapshot | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setSnapshot(null);
    setError('');
    let cancelled = false;
    let timer = 0;
    const controller = new AbortController();
    async function update() {
      try {
        const next = await request<TableViewSnapshot>(
          `/tracker-shares/${encodeURIComponent(id)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          },
        );
        if (!cancelled) {
          setSnapshot(next);
          setError('');
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Updates unavailable.');
      }
      if (!cancelled) timer = window.setTimeout(() => void update(), 1000);
    }
    void update();
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
      window.clearInterval(clock);
    };
  }, [id, token]);
  const stale =
    !snapshot || Boolean(error) || now - snapshot.updatedAt > 10_000;
  return (
    <>
      <ThemeToggleCorner />
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">Your table</h1>
        <p className="text-sm text-muted">
          Read-only · the main device controls this game.
        </p>
      </header>
      <p role="status" className={stale ? 'text-danger' : 'text-neon'}>
        {stale
          ? 'Waiting for the main device · totals may be out of date'
          : 'Live · receiving updates from the main device'}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-muted">
          {error}
        </p>
      ) : null}
      {snapshot ? (
        <>
          <p className="capitalize text-ink">
            {snapshot.state.format} ·{' '}
            {snapshot.state.winnerId
              ? 'Finished'
              : snapshot.state.paused
                ? 'Paused'
                : snapshot.state.startedAt
                  ? 'Playing'
                  : 'Preparing'}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {snapshot.state.players.map((p) => (
              <Panel key={p.id} title={p.name}>
                <p
                  className="font-display text-5xl font-bold text-ink"
                  aria-label={`${p.name}: ${p.life} life`}
                >
                  {p.life}
                </p>
                {p.poison ? <p>Poison: {p.poison}</p> : null}
                <p className="mt-2 text-sm text-muted">
                  {p.commanders.map((c) => c.name).join(' · ')}
                </p>
                {snapshot.state.players
                  .flatMap((other) => other.commanders)
                  .filter((c) => (p.commanderDamage[c.id] ?? 0) > 0)
                  .map((c) => (
                    <p key={c.id} className="text-sm">
                      {c.name}: {p.commanderDamage[c.id]} commander damage
                    </p>
                  ))}
              </Panel>
            ))}
          </div>
        </>
      ) : null}
      <Link
        className="inline-flex min-h-11 items-center rounded-xl border border-neon/40 px-4 text-neon"
        to="/tools"
        state={{ returnTo: location.pathname + location.search }}
      >
        Magic Rules &amp; card translation
      </Link>
      <Link className="text-muted underline" to="/">
        Home
      </Link>
    </>
  );
}
