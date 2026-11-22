import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, Home, Menu, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RecentEvents } from '../RecentEvents';

/** Available on ordinary pages; tracker chrome remains inside its match menu. */
export function AppMenu() {
  const { t } = useTranslation();
  const location = useLocation();
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (ref.current) ref.current.open = false; }, [location.pathname, location.search]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) ref.current.open = false;
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const linkClass = 'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 font-semibold text-ink hover:bg-neon/10 focus-visible:outline-2 focus-visible:outline-neon';
  return <details ref={ref} className="relative" onToggle={event => setOpen(event.currentTarget.open)} onKeyDown={event => {
    if (event.key === 'Escape' && ref.current) {
      ref.current.open = false;
      ref.current.querySelector('summary')?.focus();
    }
  }}>
    <summary role="button" aria-label={t('navigation.menu')} title={t('navigation.menu')}
      className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full border border-muted/25 bg-hull/90 text-ink shadow-sm backdrop-blur-md hover:border-neon/50 focus-visible:outline-2 focus-visible:outline-neon [&::-webkit-details-marker]:hidden">
      <Menu size={20} aria-hidden />
    </summary>
    <nav aria-label={t('navigation.menu')} onClick={event => {
      if ((event.target as Element).closest('a') && ref.current) ref.current.open = false;
    }} className="fixed right-3 top-16 z-50 max-h-[calc(100dvh-5rem)] w-80 max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain rounded-2xl border border-muted/30 bg-void p-2 shadow-xl">
      <Link to="/" className={linkClass}><Home size={18} aria-hidden />{t('navigation.home')}</Link>
      <Link to="/account" className={linkClass}><Users size={18} aria-hidden />{t('navigation.playgroups')}</Link>
      <Link to="/tools" state={{ returnTo: location.pathname + location.search }} className={linkClass}>
        <BookOpen size={18} aria-hidden />{t('tracker.magicRules.title')}
      </Link>
      {open && <RecentEvents />}
    </nav>
  </details>;
}
