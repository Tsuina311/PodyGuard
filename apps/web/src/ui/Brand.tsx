import { useEffect, useId, useRef, useState } from 'react';
import { useDeveloperMode } from '../developer-mode';
import { cx } from './cx';

function fineHoverDevice(): boolean {
  try {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch {
    return false;
  }
}

/** Wordmark with a status light; version lives in a hover/tap tip on that light. */
export function Brand({ className }: { className?: string }) {
  const tipId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const [showVersion, setShowVersion] = useState(false);
  const [developerMode, setDeveloperMode] = useDeveloperMode();

  useEffect(() => {
    if (!showVersion) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) {
        return;
      }
      setShowVersion(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowVersion(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showVersion]);

  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      <span
        ref={rootRef}
        className="relative inline-flex"
        onMouseEnter={() => {
          if (fineHoverDevice()) {
            setShowVersion(true);
          }
        }}
        onMouseLeave={() => {
          if (fineHoverDevice()) {
            setShowVersion(false);
          }
        }}
      >
        <button
          type="button"
          className={cx(
            'relative -m-2 flex size-8 items-center justify-center rounded-full',
            'touch-manipulation outline-none',
            'focus-visible:ring-neon/50 focus-visible:ring-2',
          )}
          aria-label={`PodyGuard version ${__APP_VERSION__}`}
          aria-expanded={showVersion}
          aria-controls={showVersion ? tipId : undefined}
          onFocus={() => setShowVersion(true)}
          onClick={() => setShowVersion((open) => !open)}
        >
          <span aria-hidden className="relative flex size-2.5 items-center justify-center">
            <span className="absolute size-2.5 animate-ping rounded-full bg-neon/60" />
            <span className="size-1.5 rounded-full bg-neon shadow-[0_0_10px_var(--color-neon)]" />
          </span>
        </button>
        {showVersion ? (
          <span className="absolute top-full left-0 z-20 pt-2">
            <span
              id={tipId}
              role="tooltip"
              data-testid="app-version"
              className={cx(
                'border-muted/25 bg-void/95 text-neon flex w-44 flex-col gap-2',
                'rounded-md border px-2.5 py-2 font-mono text-[0.7rem]',
                'font-semibold tracking-normal shadow-lg backdrop-blur-md',
              )}
            >
              <span className="tabular-nums">v{__APP_VERSION__}</span>
              <button
                type="button"
                data-testid="developer-mode-toggle"
                className="border-neon/40 hover:bg-neon/10 rounded-md border px-2 py-1.5 text-left leading-snug"
                onClick={() => setDeveloperMode(!developerMode)}
              >
                {developerMode ? 'Developer mode on' : 'Developer mode off'}
              </button>
            </span>
          </span>
        ) : null}
      </span>
      <span className="font-display text-sm font-semibold tracking-[0.32em] text-muted uppercase">
        Pody<span className="text-neon">Guard</span>
      </span>
    </div>
  );
}
