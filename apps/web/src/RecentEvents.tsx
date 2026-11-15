import { Link } from 'react-router-dom';
import { recentEvents } from './recent-events';
export function RecentEvents() {
  const rows = recentEvents();
  if (!rows.length) return null;
  return (
    <nav
      aria-label="Recent events and invitations"
      className="rounded-2xl border border-muted/20 bg-hull/65 p-4"
    >
      <h2 className="font-semibold text-ink">Your events &amp; invitations</h2>
      <p className="mb-2 text-xs text-muted">
        Saved on this device. Reopen a host desk, player seat, or invitation.
      </p>
      <ul className="flex flex-wrap gap-2">
        {rows.map((row) => (
          <li key={row.path} className="min-w-0 max-w-full">
            <Link
              className="inline-flex min-h-11 max-w-full items-center rounded-xl border border-muted/25 px-3 py-2 text-sm text-neon"
              to={row.path}
            >
              <span className="break-words">
                {row.name} ·{' '}
                {row.path.startsWith('/host/')
                  ? 'Host desk'
                  : row.path.startsWith('/e/')
                    ? 'Player seat'
                    : 'Invitation'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
