import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { EventSnapshot } from '@podyguard/shared';
import { getEvent, listParticipants, listTables } from '../api';
import { Brand } from '../ui/Brand';
import { Badge } from '../ui/Badge';
import { Panel } from '../ui/Panel';
import { ThemeToggleCorner } from '../ui/ThemeToggle';
import { useEventLive } from '../useEventLive';
import { LimitedTimerDisplay } from './LimitedTimerDisplay';
import { LIMITED_MODE_LABELS, participantName } from './limited-view';

export function LimitedDisplayPage() {
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
          <h1 className="font-display text-3xl font-bold">{snapshot?.event.name ?? 'Limited floor display'}</h1>
          <p className="text-muted font-mono tracking-[0.25em]">{code}</p>
        </div>
        <p className="text-muted text-sm">Live public tournament information</p>
      </header>

      {error ? <p className="text-danger">{error}</p> : null}
      {!snapshot ? <p className="text-muted">Loading live display…</p> : (
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
      )}

      <p className="text-muted text-xs"><Link className="hover:text-ink" to={`/e/${code}`}>Player page</Link></p>
    </>
  );
}
