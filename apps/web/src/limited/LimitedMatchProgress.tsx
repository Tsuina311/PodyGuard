import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type MatchProgress = {
  bestOf?: number;
  playerAGameWins?: number;
  playerBGameWins?: number;
  currentGameStartedAt?: string;
  outcome?: string;
};

export function LimitedMatchProgress({ match, showTimer = true }: { match: MatchProgress; showTimer?: boolean }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!showTimer || !match.currentGameStartedAt || match.outcome) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [showTimer, match.currentGameStartedAt, match.outcome]);
  if (match.outcome === 'BYE' || match.bestOf === undefined) return null;
  const a = match.playerAGameWins ?? 0, b = match.playerBGameWins ?? 0;
  const elapsed = Math.max(0, Math.floor((now - Date.parse(match.currentGameStartedAt ?? '')) / 1000));
  const time = Number.isFinite(elapsed) ? `${Math.floor(elapsed / 60).toString().padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}` : null;
  return <div className="mt-2 text-sm tabular-nums" data-testid="limited-match-progress">
    <p className="font-semibold text-ink">{t('limitedProgress.score', { bestOf: match.bestOf ?? 3, a, b })}</p>
    {showTimer && !match.outcome && <p className="text-muted">
      {time ? t('limitedProgress.elapsed', { number: a + b + 1, time })
        : t('limitedProgress.waiting', { number: a + b + 1 })}
    </p>}
  </div>;
}
