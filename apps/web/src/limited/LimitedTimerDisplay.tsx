import { useEffect, useState } from 'react';
import type { LimitedTimer } from '@podyguard/shared';
import { formatLimitedTimer } from './limited-view';

export function LimitedTimerDisplay({
  timer,
  compact = false,
  roundNumber,
  large = false,
}: {
  timer: LimitedTimer | undefined;
  compact?: boolean;
  roundNumber?: number;
  large?: boolean;
}) {
  const [now, setNow] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (!timer || timer.status !== 'RUNNING') return;
    const id = window.setInterval(() => setNow(new Date().toISOString()), 500);
    return () => window.clearInterval(id);
  }, [timer]);

  if (!timer) return null;
  const phase = timer.phase === 'ROUND' ? (roundNumber ? `Round ${roundNumber}` : 'Round')
    : timer.phase === 'DECKBUILDING' ? 'Deckbuilding' : 'Draft';
  const status = timer.status === 'PAUSED' ? ' · Paused' : timer.status === 'RUNNING' ? '' : " · Time's up";
  return (
    <div className={compact ? 'text-right' : 'text-center'}>
      <p className={large ? 'text-muted text-2xl' : 'text-muted text-xs tracking-widest uppercase'}>
        {phase}{status}
      </p>
      <p
        className={`font-mono font-bold tabular-nums ${
          large ? 'text-neon text-6xl sm:text-8xl' : compact ? 'text-xl' : 'text-neon text-5xl'
        }`}
        aria-live="off"
      >
        {formatLimitedTimer(timer, now)}
      </p>
    </div>
  );
}
