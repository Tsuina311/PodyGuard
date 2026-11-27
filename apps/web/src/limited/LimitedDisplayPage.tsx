import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { EventSnapshot } from '@podyguard/shared';
import { useTranslation } from 'react-i18next';
import { EventMonitor } from '../display/EventMonitor';
import { eventHasLimitedQueues } from '../event-mode';
import { countByStatus } from '../match-view';
import { getEvent, listParticipants, listTables } from '../api';
import { Brand } from '../ui/Brand';
import { Badge, statusTone } from '../ui/Badge';
import { Panel } from '../ui/Panel';
import { ThemeToggleCorner } from '../ui/ThemeToggle';
import { useEventLive } from '../useEventLive';
import { LimitedTimerDisplay } from './LimitedTimerDisplay';
import { LimitedMatchProgress } from './LimitedMatchProgress';
import { LIMITED_MODE_LABELS, participantName } from './limited-view';

export function LimitedDisplayPage() {
  const { t } = useTranslation();
  const { joinCode = '' } = useParams();
  const code = joinCode.toUpperCase();
  const [snapshot, setSnapshot] = useState<EventSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onSnapshot = useCallback((next: EventSnapshot) => setSnapshot(next), []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getEvent(code), listParticipants(code), listTables(code)])
      .then(([event, participants, tables]) => {
        if (!cancelled) {
          setSnapshot({ event, participants: participants.participants, tables: tables.tables });
        }
      })
      .catch(() => {
        if (!cancelled) setError('This event could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEventLive(code, true, onSnapshot);

  return (
    <>
      <ThemeToggleCorner />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Brand className="mb-4" />
          <h1 className="font-display text-3xl font-bold">{snapshot?.event.name ?? 'Event display'}</h1>
          <p className="text-muted font-mono tracking-[0.25em]">{code}</p>
        </div>
        <p className="text-muted text-sm">Live public tournament information</p>
      </header>

      {error ? <p className="text-danger">{error}</p> : null}
      {snapshot && <EventMonitor key={code} code={code} />}
      {snapshot ? <EventDisplayContent snapshot={snapshot} /> : (
        <p className="text-muted">Loading live display…</p>
      )}

      <div className="flex gap-4 text-xs text-muted">
        <Link className="hover:text-ink" to="/display">{t('eventMonitor.changeCode')}</Link>
        <Link className="hover:text-ink" to={`/e/${code}`}>Player page</Link>
      </div>
    </>
  );
}

export function EventDisplayContent({ snapshot }: { snapshot: EventSnapshot }) {
  const { t } = useTranslation();
  const counts = countByStatus(snapshot.participants);
  if (!eventHasLimitedQueues(snapshot.event)) {
    return (
      <Panel title={t('host.tablesTitle')} aside={t('host.ready', { count: counts.ready })}>
        {snapshot.tables.length === 0 ? (
          <p className="text-muted">{t('display.noTables')}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {snapshot.tables.map((table) => {
              const status = table.podStatus ?? table.status;
              return (
                <div key={table.id} className="border-muted/20 rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-lg font-semibold">{table.label}</p>
                    <Badge tone={statusTone(status)}>{status}</Badge>
                  </div>
                  {table.seatedNames.length > 0 ? (
                    <p className="text-muted mt-2 text-sm">{table.seatedNames.join(' · ')}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    );
  }

  return (
    <>
      <Panel title="Queues" aside="Live">
        <div className="grid gap-3 sm:grid-cols-3">
          {(snapshot.event.limitedModeConfigs ?? []).filter((config) => config.enabled).map((config) => {
            const queue = snapshot.limitedQueues?.find((row) => row.mode === config.mode);
            return (
              <div key={config.mode} className="rounded-xl border border-white/10 p-4">
                <p className="font-display font-semibold">{LIMITED_MODE_LABELS[config.mode]}</p>
                <p className="text-neon mt-1 text-3xl font-bold">{queue?.waitingCount ?? 0}</p>
                <p className="text-muted text-xs">waiting · target {config.preferredCohortSize ?? config.minCohortSize}</p>
              </div>
            );
          })}
        </div>
      </Panel>

      {(snapshot.limitedSessions ?? []).filter((session) => session.status !== 'CANCELLED').map((session) => {
        const round = session.rounds.find((row) => row.number === session.currentRound);
        return (
          <Panel
            key={session.id}
            title={session.label}
            aside={<Badge tone={session.status === 'ROUND_ACTIVE' ? 'live' : 'idle'}>{session.status.replaceAll('_', ' ')}</Badge>}
          >
            <div className="mb-5 grid items-center gap-4 sm:grid-cols-[1fr_auto]">
              <p className="text-muted">
                {LIMITED_MODE_LABELS[session.mode]} · round {session.currentRound ?? 0}/{session.totalRounds} · {session.participants.filter((row) => row.status !== 'DROPPED').length} players
              </p>
              <LimitedTimerDisplay timer={session.timer} />
            </div>
            {round ? (
              <div className="mb-5 grid gap-3 sm:grid-cols-2">
                {round.matches.map((match) => (
                  <div key={match.id} className="rounded-xl border border-white/10 p-4">
                    <p className="text-muted mb-1 text-xs uppercase tracking-widest">{match.tableLabel ?? (match.outcome === 'BYE' ? 'Bye' : `Match ${match.position}`)}</p>
                    <p className="font-display text-lg font-semibold">
                      {participantName(session, match.playerAId)} <span className="text-muted">vs</span> {participantName(session, match.playerBId)}
                    </p>
                    <p className="text-muted mt-1 text-sm">{match.outcome?.replaceAll('_', ' ') ?? match.status}</p>
                    <LimitedMatchProgress match={match} />
                  </div>
                ))}
              </div>
            ) : null}
            {session.standings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <thead className="text-muted text-xs uppercase">
                    <tr><th className="p-2">Rank</th><th>Name</th><th>Record</th><th>Points</th><th>MW%</th><th>OMW%</th></tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {session.standings.map((standing) => (
                      <tr key={standing.participantId}>
                        <td className="p-2 font-mono">{standing.rank}</td>
                        <td>{standing.displayName}</td>
                        <td>{standing.matchWins}-{standing.matchLosses}-{standing.draws}</td>
                        <td>{standing.points}</td>
                        <td>{Math.round(standing.matchWinPercentage * 100)}%</td>
                        <td>{Math.round(standing.opponentMatchWinPercentage * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Panel>
        );
      })}
    </>
  );
}
