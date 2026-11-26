import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard } from 'lucide-react';
import { normalizeJoinCode } from '@podyguard/shared';
import { loadHostToken } from './api';
import { createPlayerScope, listPlayerSessions, playerPath } from './player-sessions';
import { useSavedPlayers } from './use-saved-players';

export function DeviceHostDesk({ joinCode, onOpenDesk }: {
  joinCode: string;
  onOpenDesk?: () => void;
}) {
  const { t } = useTranslation();
  const className = 'inline-flex min-h-11 items-center gap-2 rounded-xl border border-neon/40 bg-neon/10 px-3 py-2 font-semibold text-ink hover:bg-neon/20';
  const label = <><LayoutDashboard size={18} aria-hidden />{t('host.desk')}</>;
  return onOpenDesk
    ? <button type="button" className={className} onClick={onOpenDesk}>{label}</button>
    : <Link to={`/host/${normalizeJoinCode(joinCode)}`} className={className}>{label}</Link>;
}

export function DevicePlayers({ joinCode, scope, displayName, onOpenDesk }: {
  joinCode: string; scope: string; displayName?: string; onOpenDesk?: () => void;
}) {
  const { t } = useTranslation();
  useSavedPlayers();
  const [players, setPlayers] = useState(() => listPlayerSessions(joinCode));
  const [newScope] = useState(createPlayerScope);
  useEffect(() => {
    const refresh = () => setPlayers(listPlayerSessions(joinCode));
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('podyguard:player-sessions', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('podyguard:player-sessions', refresh);
    };
  }, [joinCode, displayName]);
  const hasHostDesk = Boolean(onOpenDesk || loadHostToken(joinCode));
  return <section aria-label={t('devicePlayers.title')} className="mb-5 rounded-2xl border border-muted/25 p-4">
    {displayName && <p className="mb-2 font-semibold">{t('devicePlayers.current', { name: displayName })}</p>}
    <a href={`#${playerPath(joinCode, newScope)}`} target="_blank" rel="noopener noreferrer"
      onClick={event => { event.currentTarget.href = `#${playerPath(joinCode, createPlayerScope())}`; }}
      className="inline-flex min-h-11 items-center rounded-xl border border-neon/40 px-3 py-2 text-neon">
      {t('devicePlayers.joinAnother')}
    </a>
    <p className="mt-2 text-sm text-muted">{t('devicePlayers.help')}</p>
    {(players.length > 0 || hasHostDesk) && <div className="mt-3">
      <h3 className="mb-2 font-semibold">{t('devicePlayers.title')}</h3>
      <ul className="flex flex-wrap gap-2">
        {hasHostDesk && <li><DeviceHostDesk joinCode={joinCode} onOpenDesk={onOpenDesk} /></li>}
        {players.map(player => <li key={player.scope}>
          {player.scope === scope && displayName ? <span aria-current="page" className="inline-flex min-h-11 items-center px-3 text-muted">
            {player.displayName}
          </span> : <a href={`#${playerPath(joinCode, player.scope)}`} target="_blank" rel="noopener noreferrer" title={t('devicePlayers.newTab')}
            className="inline-flex min-h-11 items-center rounded-xl border border-muted/25 px-3 py-2 text-neon">
            {t('devicePlayers.continue', { name: player.displayName })}
          </a>}
        </li>)}
      </ul>
      {players.length > 0 && <a href="#/players" target="_blank" rel="noopener noreferrer" title={t('devicePlayers.newTab')}
        className="mt-2 inline-flex min-h-11 items-center text-sm text-ink underline">{t('devicePlayers.all')}</a>}
    </div>}
  </section>;
}
