import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import {
  localeFlag,
  localeLabel,
  resolveAppLocale,
  SUPPORTED_LOCALES,
  type AppLocale,
} from '../i18n/locales';
import { cx } from './cx';

function currentLocale(): AppLocale {
  return resolveAppLocale(i18n.language);
}

export function LanguageSwitcher({
  align = 'start',
}: {
  /** Popover alignment — use `end` in right-aligned headers (tracker menu). */
  align?: 'start' | 'end';
}) {
  const { t, i18n: i18nInstance } = useTranslation();
  const locale = currentLocale();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  function pick(next: AppLocale) {
    void i18nInstance.changeLanguage(next);
    setOpen(false);
  }

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="listbox"
          aria-label={t('common.language')}
          className={cx(
            'border-muted/25 bg-void/95 fixed z-[100] grid max-h-[min(50vh,20rem)] grid-cols-5 gap-1 overflow-y-auto overscroll-contain rounded-xl border p-1.5 shadow-xl backdrop-blur-md',
            'max-w-[min(calc(100vw-1rem),17.5rem)]',
          )}
          style={menuStyle(rootRef.current, align)}
        >
          {SUPPORTED_LOCALES.map(({ code }) => {
            const selected = code === locale;
            const flag = localeFlag(code);
            return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={localeLabel(code)}
                title={localeLabel(code)}
                className={cx(
                  'flex size-11 items-center justify-center rounded-lg text-xl leading-none transition',
                  'touch-manipulation select-none',
                  selected
                    ? 'bg-neon/15 ring-neon/60 ring-1'
                    : 'hover:bg-ink/8 active:bg-ink/12',
                )}
                onPointerDown={(event) => {
                  event.preventDefault();
                  pick(code);
                }}
              >
                <span
                  aria-hidden
                  className={cx(
                    flag.length === 2
                      ? 'text-[0.62rem] font-bold tracking-wide'
                      : 'text-xl leading-none',
                  )}
                >
                  {flag}
                </span>
              </button>
            );
          })}
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={cx(
          'border-muted/25 bg-hull/80 text-ink inline-flex size-11 shrink-0 items-center justify-center rounded-full border text-xl leading-none shadow-sm backdrop-blur-md',
          'touch-manipulation transition hover:border-muted/40 active:scale-[0.97]',
          open && 'border-neon/50 ring-neon/30 ring-1',
        )}
        aria-label={`${t('common.language')}: ${localeLabel(locale)}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <span
          aria-hidden
          className={cx(
            localeFlag(locale).length === 2
              ? 'text-[0.62rem] font-bold tracking-wide'
              : 'text-xl leading-none',
          )}
        >
          {localeFlag(locale)}
        </span>
      </button>
      {menu}
    </div>
  );
}

function menuStyle(
  anchor: HTMLDivElement | null,
  align: 'start' | 'end',
): CSSProperties | undefined {
  if (!anchor) {
    return undefined;
  }
  const rect = anchor.getBoundingClientRect();
  const gap = 6;
  const menuWidth = Math.min(window.innerWidth - 16, 280);
  const left =
    align === 'end'
      ? Math.max(8, rect.right - menuWidth)
      : Math.min(rect.left, window.innerWidth - menuWidth - 8);
  const top = rect.bottom + gap;
  const maxTop = window.innerHeight - 8;
  return {
    top: Math.min(top, maxTop - 200),
    left,
    width: menuWidth,
  };
}
