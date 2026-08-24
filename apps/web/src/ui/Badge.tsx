import type { ReactNode } from 'react';
import { cx } from './cx';

export type BadgeTone = 'idle' | 'ready' | 'live' | 'muted' | 'dev' | 'crown';

const tones: Record<BadgeTone, string> = {
  idle: 'border-muted/25 bg-ink/5 text-muted',
  ready: 'border-neon/40 bg-neon/10 text-neon',
  live: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500',
  muted: 'border-muted/20 bg-transparent text-muted/70',
  dev: 'border-plasma/50 bg-plasma/10 text-plasma',
  crown: 'border-amber-500/50 bg-amber-500/15 text-amber-500',
};

export function Badge({
  tone = 'idle',
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[0.68rem] tracking-wide uppercase',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): BadgeTone {
  if (status === 'ready') {
    return 'ready';
  }
  if (status === 'matched' || status === 'playing' || status === 'occupied' || status === 'formed') {
    return 'live';
  }
  if (status === 'disabled' || status === 'left' || status === 'paused') {
    return 'muted';
  }
  return 'idle';
}
