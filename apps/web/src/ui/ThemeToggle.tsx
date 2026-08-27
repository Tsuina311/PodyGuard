import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

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
export function ThemeToggleCorner() {
  return (
    <div className="fixed top-4 right-4 z-50">
      <ThemeToggle />
    </div>
  );
}

export function ThemeToggle() {
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

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Switch to ${nextTheme} mode`}
      aria-pressed={theme === 'light'}
      title={`Switch to ${nextTheme} mode`}
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
