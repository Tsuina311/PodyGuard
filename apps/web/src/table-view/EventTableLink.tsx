import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { request } from '../api';
export function EventTableLink({
  joinCode,
  token,
}: {
  joinCode: string;
  token: string;
}) {
  const [view, setView] = useState<{ id: string; readToken: string } | null>(
    null,
  );
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const controller = new AbortController();
    async function refresh() {
      try {
        const result = await request<{
          view: { id: string; readToken: string } | null;
        }>(`/events/${encodeURIComponent(joinCode)}/table-view`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!cancelled) setView(result.view);
      } catch {
        if (!cancelled) setView(null);
      }
      if (!cancelled) timer = window.setTimeout(() => void refresh(), 3000);
    }
    void refresh();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [joinCode, token]);
  return view ? (
    <div className="mb-3 rounded-xl border border-neon/40 p-3">
      <p className="mb-2 text-sm text-ink">
        The main device is sharing your table. Follow the game without changing
        its totals.
      </p>
      <Link
        to={`/watch/${view.id}?token=${view.readToken}`}
        className="inline-flex min-h-11 items-center rounded-xl bg-neon/10 px-4 font-semibold text-neon"
      >
        View live table
      </Link>
    </div>
  ) : (
    <p className="mb-3 text-sm text-muted">
      Using a table device? Ask it to open Match menu → Share live tracker. The
      viewing link will appear here.
    </p>
  );
}
