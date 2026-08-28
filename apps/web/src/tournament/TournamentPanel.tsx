import type {
  PublicEvent,
  PublicParticipant,
  TournamentMatch,
} from '@podyguard/shared';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';

type Props = {
  event: PublicEvent;
  participants: PublicParticipant[];
  busy: boolean;
  onStart: () => void;
  onWinner: (matchId: string, participantId: string) => void;
};

export function TournamentPanel({
  event,
  participants,
  busy,
  onStart,
  onWinner,
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
    (participant) => !participant.isBot && participant.status === 'ready',
  );
  const champion = tournament.championParticipantId
    ? names.get(tournament.championParticipantId)
    : undefined;

  return (
    <Panel
      title={t('tournament.singleElimination')}
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
          <div className="flex gap-3 overflow-x-auto pb-2">
            {tournament.rounds.map((round) => (
              <section
                key={round.number}
                className="w-60 shrink-0 rounded-xl border border-white/10 bg-white/[0.025] p-3"
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

function MatchCard({
  match,
  names,
  busy,
  onWinner,
}: {
  match: TournamentMatch;
  names: Map<string, string>;
  busy: boolean;
  onWinner: (matchId: string, participantId: string) => void;
}) {
  const { t } = useTranslation();
  const [armedWinner, setArmedWinner] = useState<string | null>(null);
  const canReport = match.status === 'playing';
  return (
    <article className="rounded-lg border border-white/10 bg-black/10 p-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-muted font-mono text-[10px]">
          {t('tournament.match', { number: match.position + 1 })}
        </span>
        <Badge tone={match.status === 'completed' ? 'live' : undefined}>
          {t(`tournament.matchStatus.${match.status}`)}
        </Badge>
      </div>
      <div className="space-y-1.5">
        {match.participantIds.map((participantId) => {
          const winner = match.winnerParticipantId === participantId;
          return (
            <div
              key={participantId}
              className="flex min-w-0 items-center justify-between gap-2"
            >
              <span className={winner ? 'text-neon truncate' : 'truncate'}>
                {names.get(participantId) ?? t('tournament.unknownPlayer')}
              </span>
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
          );
        })}
      </div>
    </article>
  );
}
