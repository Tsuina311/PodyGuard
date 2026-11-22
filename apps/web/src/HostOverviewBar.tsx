import type { PublicEvent } from '@podyguard/shared';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/Button';
import { cx } from './ui/cx';
import { eventHasLimitedQueues } from './event-mode';

const HOST_TABS = ['desk', 'play', 'overview', 'join'] as const;
export type HostTab = (typeof HOST_TABS)[number];
export type HostView = 'tables' | 'players' | 'settings';
type Props = {
  event: PublicEvent;
  tab: HostTab;
  onTab: (tab: HostTab) => void;
  view: HostView;
  onView: (view: HostView) => void;
  counts: { ready: number; playing: number; matched: number };
  players: number;
  freeTables: number;
  tables: number;
  readyTables: number;
  busy: boolean;
  matching: boolean;
  startAll: boolean;
  hasPlayerSeat: boolean;
  onPreview: () => void;
  onMatch: () => void;
  onStart: () => void;
  notice: string | null;
  error: string | null;
};

export function HostOverviewBar(props: Props) {
  const { t } = useTranslation();
  const { event, tab, view, counts } = props;
  return <section aria-label={t('hostUx.overview')} className="sticky top-[4.5rem] z-30 rounded-2xl border border-muted/30 bg-void/95 p-3 shadow-lg backdrop-blur-xl sm:p-4">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display truncate text-lg font-bold text-ink sm:text-2xl" title={event.name}>{event.name}</h1>
        <p className="font-mono text-xs text-muted">{event.joinCode} · {eventHasLimitedQueues(event) ? t('home.limited') : t(`modes.${event.gameMode}.label`)}{!eventHasLimitedQueues(event) && event.rulesFormat ? ` · ${t(`families.${event.rulesFormat}`)}` : ''}</p>
      </div>
    </div>
    <div role="tablist" aria-label={t('host.shellTabs')} className="mt-3 grid grid-cols-4 gap-1 rounded-xl border border-muted/25 p-1"
      onKeyDown={(event) => {
        const index = HOST_TABS.indexOf(tab);
        let nextIndex: number;
        switch (event.key) {
          case 'ArrowRight': nextIndex = (index + 1) % HOST_TABS.length; break;
          case 'ArrowLeft': nextIndex = (index + HOST_TABS.length - 1) % HOST_TABS.length; break;
          case 'Home': nextIndex = 0; break;
          case 'End': nextIndex = HOST_TABS.length - 1; break;
          default: return;
        }
        event.preventDefault();
        event.currentTarget.querySelectorAll('button')[nextIndex]?.focus();
        props.onTab(HOST_TABS[nextIndex]!);
      }}
    >
      {HOST_TABS.map(value => <button key={value} type="button" role="tab"
        id={`host-tab-${value}`} aria-controls={`host-panel-${value}`}
        aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => props.onTab(value)}
        className={cx('min-h-10 rounded-lg px-1 text-xs font-semibold sm:px-3 sm:text-sm', tab === value ? 'bg-neon/15 text-neon' : 'text-muted hover:bg-ink/5')}>
        {t(`host.${value}Tab`)}
        {value === 'play' && props.hasPlayerSeat && <span aria-hidden className="ml-1 inline-block size-1.5 rounded-full bg-neon" />}
      </button>)}
    </div>
    <div className="mt-3 grid grid-cols-4 gap-1 text-center text-xs sm:gap-2 sm:text-sm">
      <span className="rounded-lg bg-ink/5 px-1 py-2">{t('host.playerCount', { count: props.players })}</span>
      <span className="rounded-lg bg-neon/10 px-1 py-2 font-semibold text-neon">{t('host.ready', { count: counts.ready })}</span>
      <span className="rounded-lg bg-ink/5 px-1 py-2">{t('host.playing', { count: counts.playing })}</span>
      <span className="rounded-lg bg-ink/5 px-1 py-2">{t('hostUx.freeTables', { free: props.freeTables, total: props.tables })}</span>
    </div>
    {tab === 'desk' && <>
      <div role="tablist" aria-label={t('hostUx.views')} className="mt-3 grid grid-cols-3 gap-1">
        {(['tables', 'players', 'settings'] as const).map(value => <button key={value}
          id={`host-view-${value}`} type="button" role="tab" aria-selected={view === value}
          aria-controls={`host-panel-${value}`} onClick={() => props.onView(value)}
          className={cx('min-h-11 rounded-xl border px-1 py-2 text-xs font-semibold sm:text-sm', view === value ? 'border-neon/50 bg-neon/10 text-neon' : 'border-muted/20 text-muted hover:border-muted/40')}>
          {t(value === 'tables' ? 'host.tablesTitle' : `hostUx.${value}`)}
        </button>)}
      </div>
      {(props.matching || props.startAll) && <div className="mt-3 flex flex-wrap gap-2">
        {props.matching && <>
          <Button size="sm" variant="outline" disabled={props.busy} onClick={props.onPreview}>Preview pods</Button>
          <Button size="sm" disabled={props.busy} onClick={props.onMatch}>{props.busy ? t('common.working') : t('host.matchNow')}</Button>
        </>}
        {props.startAll && <Button size="sm" variant="neon" disabled={props.busy || props.readyTables === 0} onClick={props.onStart}
          aria-label={t('host.startAllReady', { count: props.readyTables })} title={t('host.startAllReady', { count: props.readyTables })}>
          <span className="sm:hidden">{t('hostUx.start', { count: props.readyTables })}</span>
          <span className="hidden sm:inline">{t('host.startAllReady', { count: props.readyTables })}</span>
        </Button>}
      </div>}
    </>}
    {props.notice && <p role="status" className="mt-2 text-sm text-ink">{props.notice}</p>}
    {props.error && <p role="alert" className="mt-2 text-sm text-danger">{props.error}</p>}
  </section>;
}
