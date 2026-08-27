import type { FormEventHandler, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from './cx';

type PanelProps = {
  title?: ReactNode;
  aside?: ReactNode;
  className?: string;
  children?: ReactNode;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  /** When set, the title row toggles the body open and closed. */
  expanded?: boolean;
  onToggle?: () => void;
};

const shell =
  'relative overflow-hidden rounded-2xl border border-muted/20 bg-hull/65 p-5 backdrop-blur-xl shadow-[0_18px_50px_-24px_color-mix(in_oklab,var(--color-void)_85%,transparent)]';

export function Panel({
  title,
  aside,
  className,
  children,
  onSubmit,
  expanded,
  onToggle,
}: PanelProps) {
  const collapsible = Boolean(onToggle);
  const open = !collapsible || expanded === true;

  const header =
    title || aside || collapsible ? (
      <div
        className={cx(
          'flex items-center justify-between gap-3',
          open && children ? 'mb-4' : null,
        )}
      >
        {collapsible ? (
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
            onClick={onToggle}
            aria-expanded={open}
          >
            <h2 className="font-display flex min-w-0 items-center gap-2 text-base font-semibold tracking-wide text-ink">
              {title}
            </h2>
            <span className="flex shrink-0 items-center gap-2">
              {aside ? (
                <span className="font-mono text-xs text-muted">{aside}</span>
              ) : null}
              <ChevronDown
                size={16}
                aria-hidden
                className={cx(
                  'text-muted transition',
                  open && 'rotate-180',
                )}
              />
            </span>
          </button>
        ) : (
          <>
            {title ? (
              <h2 className="font-display text-base font-semibold tracking-wide text-ink">
                {title}
              </h2>
            ) : (
              <span />
            )}
            {aside ? (
              <span className="font-mono text-xs text-muted">{aside}</span>
            ) : null}
          </>
        )}
      </div>
    ) : null;

  const body = (
    <>
      {/* Top edge light, the signature IndoUI glass accent. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-neon/70 to-transparent"
      />
      {header}
      {open ? children : null}
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
