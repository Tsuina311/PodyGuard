import { cx } from './cx';

export function Brand({ className }: { className?: string }) {
  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      <span
        aria-hidden
        className="relative flex size-2.5 items-center justify-center"
      >
        <span className="absolute size-2.5 animate-ping rounded-full bg-neon/60" />
        <span className="size-1.5 rounded-full bg-neon shadow-[0_0_10px_var(--color-neon)]" />
      </span>
      <span className="font-display text-sm font-semibold tracking-[0.32em] text-muted uppercase">
        Pody<span className="text-neon">Guard</span>
      </span>
    </div>
  );
}
