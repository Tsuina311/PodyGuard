import { useState, type ReactNode } from 'react';
import type { PublicParticipant } from '@podyguard/shared';
import { useTranslation } from 'react-i18next';
import { Badge, statusTone } from './ui/Badge';
import { Panel } from './ui/Panel';

export function HostPlayersPanel({ participants, action }: {
  participants: PublicParticipant[];
  action: (player: PublicParticipant) => ReactNode;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const shown = participants.filter(player =>
    player.displayName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) &&
    (status === 'all' || player.status === status));
  return <Panel title={t('hostUx.players')} aside={`${shown.length} / ${participants.length}`}>
    <div className="mb-4 grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] gap-3">
      <label className="text-sm">{t('hostUx.findPlayer')}
        <input type="search" value={search} onChange={event => setSearch(event.target.value)}
          className="mt-1 h-11 w-full rounded-xl border border-muted/30 bg-void px-3 text-ink" />
      </label>
      <label className="text-sm">{t('hostUx.status')}
        <select value={status} onChange={event => setStatus(event.target.value)}
          className="mt-1 h-11 w-full rounded-xl border border-muted/30 bg-void px-3 text-ink">
          <option value="all">{t('hostUx.allPlayers')}</option>
          {(['joined', 'ready', 'matched', 'playing', 'paused', 'left'] as const).map(value => <option key={value} value={value}>{t(`hostUx.statuses.${value}`)}</option>)}
        </select>
      </label>
    </div>
    {shown.length ? <ul className="divide-y divide-muted/20">
      {shown.map(player => <li key={player.id} className="flex items-center justify-between gap-3 py-3">
        <div className="min-w-0"><p className="break-words font-semibold">{player.displayName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone={statusTone(player.status)}>{t(`hostUx.statuses.${player.status}`)}</Badge>
            {player.tableLabel && <span>{player.tableLabel}</span>}
            {player.isBot && <Badge tone="dev">{t('common.bot')}</Badge>}
          </div>
        </div>
        {player.status !== 'left' && action(player)}
      </li>)}
    </ul> : <p className="text-sm text-muted">{t('hostUx.noPlayers')}</p>}
  </Panel>;
}
