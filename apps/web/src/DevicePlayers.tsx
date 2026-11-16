import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createPlayerScope, listPlayerSessions, playerPath } from './player-sessions';

export function DevicePlayers({ joinCode, scope, displayName }: {
  joinCode: string; scope: string; displayName?: string;
}) {
  const { t } = useTranslation();
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
  return <section aria-label={t('devicePlayers.title')} className="mb-5 rounded-2xl border border-muted/25 p-4">
    {displayName && <p className="mb-2 font-semibold">{t('devicePlayers.current', { name: displayName })}</p>}
    <a href={`#${playerPath(joinCode, newScope)}`} target="_blank" rel="noopener noreferrer"
      onClick={event => { event.currentTarget.href = `#${playerPath(joinCode, createPlayerScope())}`; }}
      className="inline-flex min-h-11 items-center rounded-xl border border-neon/40 px-3 py-2 text-neon">
      {t('devicePlayers.joinAnother')}
    </a>
    <p className="mt-2 text-sm text-muted">{t('devicePlayers.help')}</p>
    {players.length > 0 && <details className="mt-3">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">{t('devicePlayers.title')}</summary>
      <ul className="flex flex-wrap gap-2">
        {players.map(player => <li key={player.scope}>
          {player.scope === scope && displayName ? <span aria-current="page" className="inline-flex min-h-11 items-center px-3 text-muted">
            {player.displayName}
          </span> : <Link to={playerPath(joinCode, player.scope)}
            className="inline-flex min-h-11 items-center rounded-xl border border-muted/25 px-3 py-2 text-neon">
            {t('devicePlayers.continue', { name: player.displayName })}
          </Link>}
        </li>)}
      </ul>
    </details>}
  </section>;
}
