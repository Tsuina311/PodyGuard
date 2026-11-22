import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { recentEvents, removeRecentEvent } from './recent-events';
import { Button } from './ui/Button';

export function RecentEvents() {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState(recentEvents);

  useEffect(() => {
    const refresh = () => setRows(recentEvents());
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  if (!rows.length) return null;
  const dateFormat = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: 'medium' });

  return (
    <nav
      aria-label={t('recentEvents.label')}
      className="mt-2 border-t border-muted/20 px-1 pt-3"
    >
      <h2 className="font-semibold text-ink">{t('recentEvents.title')}</h2>
      <p className="mb-2 text-xs text-muted">{t('recentEvents.hint')}</p>
      <ul className="grid gap-2">
        {rows.map((row) => {
          const type = row.path.startsWith('/host/')
            ? t('recentEvents.host')
            : row.path.startsWith('/e/')
              ? t('recentEvents.player')
              : t('recentEvents.invitation');
          const label = `${row.name} · ${type}`;
          const date = new Date(row.seenAt);
          const hasDate = row.seenAt > 0 && Number.isFinite(date.getTime());

          return (
            <li key={row.path} className="flex min-w-0 items-center gap-2 rounded-xl border border-muted/25 pr-2">
              <Link className="flex min-h-11 min-w-0 flex-1 flex-col justify-center px-3 py-2 text-sm text-neon hover:underline" to={row.path}>
                <span className="break-words">{label}</span>
                <span className="text-xs text-muted">
                  {hasDate ? (
                    <time dateTime={date.toISOString()}>
                      {t('recentEvents.savedDate', { date: dateFormat.format(date) })}
                    </time>
                  ) : t('recentEvents.unknownDate')}
                </span>
              </Link>
              <Button
                variant="glass"
                size="sm"
                className="min-h-11 shrink-0"
                aria-label={t('recentEvents.removeEntry', { entry: label })}
                onClick={() => {
                  removeRecentEvent(row.path);
                  setRows(recentEvents());
                }}
              >
                {t('common.remove')}
              </Button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
