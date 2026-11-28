import { useState } from 'react';
import { calculateLimitedStandings, type PublicLimitedSession } from '@podyguard/shared';
import { cx } from '../ui/cx';
import { LimitedMatchProgress } from './LimitedMatchProgress';
import { LimitedMatchStatus } from './LimitedMatchStatus';
import { participantName } from './limited-view';

export function LimitedSwissRounds({ session }: { session: PublicLimitedSession }) {
  const [followedPlayer, setFollowedPlayer] = useState<string | null>(null);
  if (session.rounds.length === 0) return null;

  const isSwiss = session.pairingPolicy === 'SWISS';
  const rounds = [...session.rounds].sort((a, b) => a.number - b.number);
  const title = isSwiss ? 'Swiss stage' : 'Match rounds';
  return (
    <section aria-label={title} className="mb-5">
      <h3 className="mb-1 font-display text-lg font-semibold">{title}</h3>
      <p className="mb-3 text-xs text-muted">Win–loss–draw records shown before each round. Select a player to follow their matches.</p>
      <ol className="grid auto-cols-[minmax(14rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
        {Array.from({ length: session.totalRounds }, (_, index) => {
          const number = index + 1;
          const round = rounds.find((row) => row.number === number);
          const current = session.status === 'ROUND_ACTIVE' && session.currentRound === number;
          const records = new Map(calculateLimitedStandings(
            session.participants,
            rounds.filter((row) => row.number < number).flatMap((row) => row.matches),
          ).map((standing) => [standing.participantId, standing]));
          return (
            <li key={number} className="min-w-0 space-y-2">
              <h4 aria-current={current ? 'step' : undefined} className="flex items-center justify-between gap-1 text-sm font-semibold">
                Round {number}
                {current && <span className="text-xs text-neon">Current</span>}
              </h4>
              {round ? round.matches.map((match) => (
                <article key={match.id} className={cx(
                  'rounded-lg border p-3 text-sm',
                  followedPlayer && [match.playerAId, match.playerBId].includes(followedPlayer)
                    ? 'border-neon/60 bg-neon/10' : 'border-ink/15 bg-ink/5',
                )}>
                  <p className="mb-2 text-xs text-muted">
                    {match.tableLabel ?? (match.outcome === 'BYE' ? 'Bye' : `Match ${match.position}`)}
                  </p>
                  {[match.playerAId, match.playerBId].map((id) => {
                    if (!id) return null;
                    const record = records.get(id);
                    return (
                      <div key={id} className="flex items-baseline justify-between gap-2">
                        <button
                          type="button"
                          aria-pressed={followedPlayer === id}
                          className="min-h-9 rounded text-left font-semibold hover:text-neon focus-visible:outline-2 focus-visible:outline-neon"
                          onClick={() => setFollowedPlayer((current) => current === id ? null : id)}
                        >
                          {participantName(session, id)}
                        </button>
                        <span className="shrink-0 font-mono text-xs text-muted">
                          {record?.matchWins ?? 0}–{record?.matchLosses ?? 0}–{record?.draws ?? 0}
                        </span>
                      </div>
                    );
                  })}
                  <p className="mt-2 text-xs text-muted">
                    <LimitedMatchStatus
                      outcome={match.outcome}
                      status={match.status}
                      playerAName={participantName(session, match.playerAId)}
                      playerBName={participantName(session, match.playerBId)}
                    />
                  </p>
                  {number === session.currentRound ? <LimitedMatchProgress match={match} /> : (
                    match.bestOf === 3 && match.outcome && match.outcome !== 'BYE' && (
                      <p className="mt-1 text-xs text-muted">Game score {match.playerAGameWins}–{match.playerBGameWins}</p>
                    )
                  )}
                </article>
              )) : <p className="rounded-lg border border-dashed border-ink/20 p-3 text-sm text-muted">Pairings pending</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
