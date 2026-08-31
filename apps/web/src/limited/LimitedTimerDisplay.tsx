import { useEffect, useState } from 'react';
import type { LimitedTimer } from '@podyguard/shared';
import { formatLimitedTimer } from './limited-view';

export function LimitedTimerDisplay({
  timer,
  compact = false,
}: {
  timer: LimitedTimer | undefined;
  compact?: boolean;
}) {
  const [now, setNow] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (!timer || timer.status !== 'RUNNING') return;
    const id = window.setInterval(() => setNow(new Date().toISOString()), 500);
    return () => window.clearInterval(id);
  }, [timer]);

  if (!timer) return null;
  return (
    <div className={compact ? 'text-right' : 'text-center'}>
      <p className="text-muted text-xs tracking-[0.18em] uppercase">
        {timer.phase.replace('_', ' ')} · {timer.status}
      </p>
      <p
        className={`font-mono font-bold tabular-nums ${
          compact ? 'text-xl' : 'text-neon text-5xl'
        }`}
        aria-live="off"
      >
        {formatLimitedTimer(timer, now)}
      </p>
    </div>
  );
}
