import { useEffect, useState } from 'react';
import { MessageSquare, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFeedback } from '../feedback/FeedbackContext';
import type { FeedbackContextDetails } from '../feedback/types';
import { LanguageSwitcher } from './LanguageSwitcher';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'podyguard-theme';
const THEME_EVENT = 'podyguard-theme';

function preferredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'light' ? '#f7f9fc' : '#03060e');
}

/** Sets light/dark for the whole app and keeps any open ThemeToggle in sync. */
export function setAppTheme(theme: Theme): void {
  applyTheme(theme);
  localStorage.setItem(STORAGE_KEY, theme);
  document.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

/**
 * Pages opt into the corner toggle individually. The tracker exposes the same
 * control from the match menu instead, so a running game still owns the screen.
 */
export function ThemeToggleCorner({
  feedbackContext,
}: {
  feedbackContext?: FeedbackContextDetails;
}) {
  const { t } = useTranslation();
  const { openFeedback } = useFeedback();
  return (
    <div className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] z-50 flex items-center gap-2">
      <LanguageSwitcher align="end" />
      <button
        type="button"
        className="border-muted/25 bg-hull/80 text-muted hover:text-neon hover:border-neon/40 inline-flex size-11 shrink-0 items-center justify-center rounded-full border shadow-sm backdrop-blur-md transition active:scale-[0.97]"
        aria-label={t('feedback.open')}
        title={t('feedback.open')}
        onClick={() => openFeedback(feedbackContext)}
      >
        <MessageSquare size={17} aria-hidden />
      </button>
      <ThemeToggle />
    </div>
  );
}

export function ThemeToggle() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme>(() => preferredTheme());

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#f7f9fc' : '#03060e');
  }, [theme]);

  useEffect(() => {
    function onExternal(event: Event) {
      const next = (event as CustomEvent<Theme>).detail;
      if (next === 'light' || next === 'dark') {
        setTheme(next);
      }
    }
    document.addEventListener(THEME_EVENT, onExternal);
    return () => document.removeEventListener(THEME_EVENT, onExternal);
  }, []);

  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  const switchLabel =
    nextTheme === 'light'
      ? t('theme.switchToLight')
      : t('theme.switchToDark');

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={switchLabel}
      aria-pressed={theme === 'light'}
      title={switchLabel}
      onClick={() => setTheme(nextTheme)}
    >
      <span aria-hidden className="theme-toggle__icon">
        <Sun size={14} />
      </span>
      <span aria-hidden className="theme-toggle__icon">
        <Moon size={14} />
      </span>
      <span aria-hidden className="theme-toggle__thumb" />
    </button>
  );
}
