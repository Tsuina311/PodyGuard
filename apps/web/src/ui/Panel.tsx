import type { FormEventHandler, ReactNode } from 'react';
import { cx } from './cx';

type PanelProps = {
  title?: ReactNode;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
  onSubmit?: FormEventHandler<HTMLFormElement>;
};

const shell =
  'relative overflow-hidden rounded-2xl border border-muted/20 bg-hull/65 p-5 backdrop-blur-xl shadow-[0_18px_50px_-24px_color-mix(in_oklab,var(--color-void)_85%,transparent)]';

export function Panel({ title, aside, className, children, onSubmit }: PanelProps) {
  const body = (
    <>
      {/* Top edge light, the signature IndoUI glass accent. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-neon/70 to-transparent"
      />
      {title ? (
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="font-display text-base font-semibold tracking-wide text-ink">
            {title}
          </h2>
          {aside ? (
            <span className="font-mono text-xs text-muted">{aside}</span>
          ) : null}
        </div>
      ) : null}
      {children}
    </>
  );

  if (onSubmit) {
    return (
      <form className={cx(shell, className)} onSubmit={onSubmit}>
        {body}
      </form>
    );
  }

  return <section className={cx(shell, className)}>{body}</section>;
}
