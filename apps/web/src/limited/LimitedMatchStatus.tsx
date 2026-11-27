import { Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function LimitedMatchStatus({ outcome, status, playerAName, playerBName }: {
  outcome?: string;
  status?: string;
  playerAName: string;
  playerBName?: string;
}) {
  const { t } = useTranslation();
  if (outcome === 'PLAYER_A_WIN' || outcome === 'PLAYER_B_WIN') {
    const name = outcome === 'PLAYER_A_WIN' ? playerAName : playerBName ?? 'Unknown player';
    return <span className="inline-flex items-center gap-1.5">
      <Trophy size={14} className="shrink-0 text-neon" aria-hidden />
      {t('localLimited.winner', { name })}
    </span>;
  }
  const label = outcome === 'DRAW' ? t('localLimited.draw')
    : outcome === 'DOUBLE_LOSS' ? t('localLimited.doubleLoss')
      : outcome === 'BYE' ? t('localLimited.bye')
        : (outcome ?? status ?? '').replaceAll('_', ' ');
  return <>{label}</>;
}
