import type {
  PublicEvent,
  PublicParticipant,
  SeriesLength,
  TournamentMatch,
} from '@podyguard/shared';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { cx } from '../ui/cx';
import { seriesScoreLine } from './series-score';

type Props = {
  event: PublicEvent;
  participants: PublicParticipant[];
  busy: boolean;
  onStart: () => void;
  onWinner: (matchId: string, participantId: string) => void;
  onBestOf?: (matchId: string, bestOf: SeriesLength) => void;
};

export function TournamentPanel({
  event,
  participants,
  busy,
  onStart,
  onWinner,
  onBestOf,
}: Props) {
  const { t } = useTranslation();
  const tournament = event.tournament;
  if (!tournament) {
    return null;
  }
  const names = new Map(
    participants.map((participant) => [
      participant.id,
      participant.displayName,
    ]),
  );
  const ready = participants.filter(
    (participant) =>
      participant.status === 'ready' &&
      (import.meta.env.DEV || !participant.isBot),
  );
  const champion = tournament.championParticipantId
    ? names.get(tournament.championParticipantId)
    : undefined;
  const formatLabel =
    tournament.format === 'swiss'
      ? t('tournament.swiss')
      : t('tournament.singleElimination');

  return (
    <Panel
      title={formatLabel}
      aside={
        <Badge tone={tournament.phase === 'completed' ? 'live' : undefined}>
          {t(`tournament.phase.${tournament.phase}`)}
        </Badge>
      }
    >
      {tournament.phase === 'registration' ? (
        <>
          <p className="text-muted mb-4 text-sm">
            {t('tournament.registrationHint', { count: ready.length })}
          </p>
          <p className="text-muted mb-4 text-xs">
            {tournament.format === 'swiss'
              ? t('tournament.configSummarySwiss', {
                  size: tournament.podSize,
                  bestOf: tournament.defaultBestOf,
                  rounds: tournament.swissRounds ?? '—',
                })
              : t('tournament.configSummaryElim', {
                  size: tournament.podSize,
                  opening: tournament.defaultBestOf,
                  final: tournament.finalBestOf,
                })}
          </p>
          <Button
            variant="neon"
            block
            disabled={busy || ready.length < 2}
            onClick={onStart}
          >
            {t('tournament.start')}
          </Button>
        </>
      ) : (
        <>
          {champion ? (
            <div className="border-neon/40 bg-neon/10 mb-4 rounded-xl border p-4 text-center">
              <p className="text-muted text-xs tracking-widest uppercase">
                {t('tournament.champion')}
              </p>
              <p className="font-display text-neon mt-1 text-2xl font-bold">
                {champion}
              </p>
            </div>
          ) : null}
          {tournament.format === 'swiss' ? (
            <Standings
              entrantIds={tournament.entrantIds}
              records={tournament.records}
              names={names}
            />
          ) : null}
          <div className="flex gap-3 overflow-x-auto pb-2">
            {tournament.rounds.map((round) => (
              <section
                key={round.number}
                className="w-64 shrink-0 rounded-xl border border-white/10 bg-white/[0.025] p-3"
              >
                <h3 className="text-muted mb-3 text-xs font-semibold tracking-widest uppercase">
                  {t('tournament.round', { number: round.number })}
                </h3>
                <div className="space-y-3">
                  {round.matches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      names={names}
                      busy={busy}
                      onWinner={onWinner}
                      onBestOf={onBestOf}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function Standings({
  entrantIds,
  records,
  names,
}: {
  entrantIds: string[];
  records: Record<string, { wins: number; losses: number }>;
  names: Map<string, string>;
}) {
  const { t } = useTranslation();
  const ranked = [...entrantIds].sort((a, b) => {
    const left = records[a] ?? { wins: 0, losses: 0 };
    const right = records[b] ?? { wins: 0, losses: 0 };
    if (right.wins !== left.wins) {
      return right.wins - left.wins;
    }
    return left.losses - right.losses;
  });
  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-black/10 p-3">
      <h3 className="text-muted mb-2 text-xs font-semibold tracking-widest uppercase">
        {t('tournament.standings')}
      </h3>
      <ul className="space-y-1 text-sm">
        {ranked.map((id, index) => {
          const record = records[id] ?? { wins: 0, losses: 0 };
          return (
            <li key={id} className="flex justify-between gap-2">
              <span className="truncate">
                {index + 1}. {names.get(id) ?? t('tournament.unknownPlayer')}
              </span>
              <span className="text-muted shrink-0 font-mono text-xs">
                {record.wins}-{record.losses}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MatchCard({
  match,
  names,
  busy,
  onWinner,
  onBestOf,
}: {
  match: TournamentMatch;
  names: Map<string, string>;
  busy: boolean;
  onWinner: (matchId: string, participantId: string) => void;
  onBestOf?: (matchId: string, bestOf: SeriesLength) => void;
}) {
  const { t } = useTranslation();
  const [armedWinner, setArmedWinner] = useState<string | null>(null);
  const canReport = match.status === 'playing';
  const canEditBestOf =
    Boolean(onBestOf) &&
    match.status === 'pending' &&
    Object.values(match.seriesWins ?? {}).every((wins) => wins === 0);
  const showSeries = match.bestOf > 1;
  const score = showSeries ? seriesScoreLine(match) : null;
  return (
    <article className="rounded-lg border border-white/10 bg-black/10 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-muted font-mono text-[10px]">
          {t('tournament.match', { number: match.position + 1 })}
        </span>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          <Badge>{t('tournament.bestOf', { count: match.bestOf })}</Badge>
          {score ? (
            <span
              className={cx(
                'font-mono text-xs font-semibold tracking-normal tabular-nums whitespace-nowrap',
                match.status === 'completed' ? 'text-emerald-500' : 'text-neon',
              )}
            >
              {score}
            </span>
          ) : null}
          <Badge tone={match.status === 'completed' ? 'live' : undefined}>
            {t(`tournament.matchStatus.${match.status}`)}
          </Badge>
        </div>
      </div>
      {canEditBestOf ? (
        <div className="mb-2 grid grid-cols-3 gap-1">
          {([1, 3, 5] as SeriesLength[]).map((bestOf) => (
            <button
              key={bestOf}
              type="button"
              disabled={busy || match.bestOf === bestOf}
              className={cx(
                'rounded border px-1 py-0.5 text-[10px] font-semibold transition',
                match.bestOf === bestOf
                  ? 'border-neon text-neon'
                  : 'border-muted/30 text-muted hover:border-muted/50',
              )}
              onClick={() => onBestOf?.(match.id, bestOf)}
            >
              {t('tournament.bestOf', { count: bestOf })}
            </button>
          ))}
        </div>
      ) : null}
      <div className="space-y-1.5">
        {match.participantIds.map((participantId) => {
          const winner = match.winnerParticipantId === participantId;
          const seriesWins = match.seriesWins?.[participantId] ?? 0;
          return (
            <div
              key={participantId}
              className="flex min-w-0 items-center justify-between gap-2"
            >
              <span className={winner ? 'text-neon truncate' : 'truncate'}>
                {names.get(participantId) ?? t('tournament.unknownPlayer')}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                {showSeries ? (
                  <span
                    className={cx(
                      'font-mono text-sm tabular-nums',
                      winner ? 'text-neon font-semibold' : 'text-muted',
                    )}
                  >
                    {seriesWins}
                  </span>
                ) : null}
                {canReport ? (
                  <Button
                    size="sm"
                    variant={armedWinner === participantId ? 'danger' : 'ghost'}
                    disabled={busy}
                    onClick={() => {
                      if (armedWinner === participantId) {
                        onWinner(match.id, participantId);
                        setArmedWinner(null);
                      } else {
                        setArmedWinner(participantId);
                      }
                    }}
                  >
                    {armedWinner === participantId
                      ? t('tournament.confirmWinner')
                      : t('tournament.winner')}
                  </Button>
                ) : winner ? (
                  <Badge tone="live">{t('tournament.advanced')}</Badge>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
