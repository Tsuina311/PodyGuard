import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UsersRound } from 'lucide-react';
import { normalizeJoinCode } from '@podyguard/shared';
import { loadHostToken } from './api';
import { DeviceHostDesk } from './DevicePlayers';
import { playerPath } from './player-sessions';
import { useSavedPlayers } from './use-saved-players';
import { Panel } from './ui/Panel';
import { ThemeToggleCorner } from './ui/ThemeToggle';

export function SavedPlayersShortcut() {
  const { t } = useTranslation();
  const events = useSavedPlayers();
  const count = events.reduce((total, event) => total + event.players.length, 0);
  if (!count) return null;
  return <Link to="/players" className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neon/40 bg-neon/5 px-3 py-2 font-semibold text-ink hover:bg-neon/10">
    <UsersRound size={18} aria-hidden />{t('devicePlayers.resumeCount', { count })}
  </Link>;
}

export function SavedPlayersPage() {
  const { t } = useTranslation();
  const [query] = useSearchParams();
  const selected = normalizeJoinCode(query.get('event') ?? '');
  const events = useSavedPlayers();
  const visible = selected ? events.filter(event => event.joinCode === selected) : events;
  return <>
    <ThemeToggleCorner />
    <header>
      <Link to="/" className="mb-3 inline-flex min-h-11 items-center rounded-xl border border-muted/25 px-3 py-2 text-ink">{t('navigation.home')}</Link>
      <h1 className="font-display text-2xl font-bold text-ink">{t('devicePlayers.title')}</h1>
      <p className="mt-2 text-sm text-muted">{t('devicePlayers.recoveryHelp')}</p>
    </header>
    {selected && <Link to="/players" className="inline-flex min-h-11 items-center text-neon underline">{t('devicePlayers.all')}</Link>}
    {visible.length ? visible.map(event => <Panel key={event.joinCode} title={event.name}>
      <p className="mb-2 text-sm text-muted">{t('devicePlayers.eventCode', { code: event.joinCode })}</p>
      <p className="mb-3 font-semibold text-ink">{t('devicePlayers.resumeCount', { count: event.players.length })}</p>
      <ul className="flex flex-wrap gap-2">
        {loadHostToken(event.joinCode) && <li><DeviceHostDesk joinCode={event.joinCode} /></li>}
        {event.players.map(player => <li key={player.scope}>
          <a href={`#${playerPath(event.joinCode, player.scope)}`} target="_blank" rel="noopener noreferrer"
            title={t('devicePlayers.newTab')}
            className="inline-flex min-h-11 items-center rounded-xl border border-neon/40 bg-neon/5 px-3 py-2 font-semibold text-ink hover:bg-neon/10">
            {t('devicePlayers.continue', { name: player.displayName })}
          </a>
        </li>)}
      </ul>
    </Panel>) : <Panel><p className="text-muted">{t('devicePlayers.empty')}</p></Panel>}
  </>;
}
