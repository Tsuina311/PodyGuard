import type {
  PublicEvent,
  PublicParticipant,
  PublicTable,
} from '@podyguard/shared';
import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/Badge';

export function TournamentPlayerStatus({
  event,
  participant,
  tables,
}: {
  event: PublicEvent;
  participant: PublicParticipant;
  tables: PublicTable[];
}) {
  const { t } = useTranslation();
  const tournament = event.tournament;
  if (!tournament) {
    return null;
  }
  const matches = tournament.rounds
    .flatMap((round) => round.matches)
    .filter((match) => match.participantIds.includes(participant.id));
  const latest = matches.at(-1);
  const table = latest?.tableId
    ? tables.find((candidate) => candidate.id === latest.tableId)
    : undefined;
  const eliminated =
    latest?.status === 'completed' &&
    latest.winnerParticipantId !== participant.id;
  const champion = tournament.championParticipantId === participant.id;
  const entered = tournament.entrantIds.includes(participant.id);

  return (
    <div className="border-neon/25 bg-neon/5 mb-4 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">
          {t('tournament.singleElimination')}
        </span>
        <Badge tone={champion ? 'live' : undefined}>
          {champion
            ? t('tournament.champion')
            : !entered && tournament.phase !== 'registration'
              ? t('tournament.notEntered')
            : eliminated
              ? t('tournament.eliminated')
              : tournament.phase === 'registration'
                ? t('tournament.phase.registration')
                : latest
                  ? t('tournament.round', { number: latest.round })
                  : t('tournament.waiting')}
        </Badge>
      </div>
      <p className="text-muted mt-2 text-xs">
        {champion
          ? t('tournament.youWon')
          : !entered && tournament.phase !== 'registration'
            ? t('tournament.notEnteredHint')
          : eliminated
            ? t('tournament.eliminatedHint')
            : latest?.status === 'formed' || latest?.status === 'playing'
              ? t('tournament.currentMatch', {
                  table: table?.label ?? t('tournament.tablePending'),
                })
              : latest?.status === 'completed'
                ? t('tournament.advancedHint')
                : tournament.phase === 'registration'
                  ? t('tournament.playerRegistrationHint')
                  : t('tournament.waitingHint')}
      </p>
    </div>
  );
}
