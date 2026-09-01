import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DISPLAY_ASSIGNMENT_HIGHLIGHT_MS,
  DISPLAY_AUTO_ROTATE_MS,
  type DisplayMode,
  type PublicDisplayEventState,
  type PublicDisplayLimitedSession,
  type PublicDisplayQueue,
  type PublicDisplayTable,
} from '@podyguard/shared';
import {
  ApiError,
  clearDisplayToken,
  getDisplayState,
  loadDisplayToken,
} from '../api';
import { LimitedTimerDisplay } from '../limited/LimitedTimerDisplay';
import { Brand } from '../ui/Brand';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';
import { useDisplayLive } from '../useDisplayLive';

type ViewMode = Exclude<DisplayMode, 'AUTO'>;

const ROTATE_ORDER: ViewMode[] = ['FLOOR', 'QUEUES', 'LIMITED'];

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function formatElapsed(
  startedAt: string | undefined,
  serverNow: string,
  snapshotAtMs: number,
): string {
  if (!startedAt) {
    return '';
  }
  const start = Date.parse(startedAt);
  const serverAtSnapshot = Date.parse(serverNow);
  if (Number.isNaN(start) || Number.isNaN(serverAtSnapshot)) {
    return '';
  }
  const approxServerNow = serverAtSnapshot + (Date.now() - snapshotAtMs);
  const elapsedMs = Math.max(0, approxServerNow - start);
  const totalSec = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function activityTone(activity: PublicDisplayTable['activity']): 'idle' | 'ready' | 'live' | 'muted' {
  if (activity === 'FREE') return 'ready';
  if (activity === 'DISABLED') return 'muted';
  if (activity === 'RESERVED' || activity === 'MATCH') return 'idle';
  return 'live';
}

export function DisplayLivePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(() => loadDisplayToken());
  const [state, setState] = useState<PublicDisplayEventState | null>(null);
  const [connected, setConnected] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [autoIndex, setAutoIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reducedMotion] = useState(() =>
    typeof window !== 'undefined' ? prefersReducedMotion() : false,
  );

  useEffect(() => {
    if (!token && !unauthorized) {
      navigate('/display', { replace: true });
    }
  }, [token, unauthorized, navigate]);

  const applyState = useCallback((next: PublicDisplayEventState) => {
    setState(next);
    setLastUpdateAt(Date.now());
    setUnauthorized(false);
    setLoadError(null);
  }, []);

  const handleUnauthorized = useCallback(() => {
    clearDisplayToken();
    setToken(null);
    setUnauthorized(true);
  }, []);

  const handleConnection = useCallback((next: boolean) => {
    setConnected(next);
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    void getDisplayState(token)
      .then((result) => {
        if (!cancelled) {
          applyState(result.state);
        }
      })
      .catch((caught) => {
        if (cancelled) {
          return;
        }
        if (
          caught instanceof ApiError &&
          (caught.status === 401 || caught.code === 'DISPLAY_UNAUTHORIZED')
        ) {
          handleUnauthorized();
          return;
        }
        setLoadError(
          caught instanceof ApiError
            ? caught.message
            : t('display.stateFailed'),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [token, applyState, handleUnauthorized, t]);

  useDisplayLive(
    token ?? undefined,
    Boolean(token) && !unauthorized,
    applyState,
    handleUnauthorized,
    handleConnection,
  );

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const configMode = state?.config.mode ?? 'FLOOR';

  useEffect(() => {
    if (configMode !== 'AUTO' || reducedMotion) {
      setAutoIndex(0);
      return;
    }
    const mode = ROTATE_ORDER[autoIndex % ROTATE_ORDER.length] ?? 'FLOOR';
    const dwell = DISPLAY_AUTO_ROTATE_MS[mode];
    const timer = window.setTimeout(() => {
      setAutoIndex((i) => (i + 1) % ROTATE_ORDER.length);
    }, dwell);
    return () => window.clearTimeout(timer);
  }, [configMode, autoIndex, reducedMotion, state?.serverNow]);

  const viewMode: ViewMode =
    configMode === 'AUTO'
      ? reducedMotion
        ? 'FLOOR'
        : (ROTATE_ORDER[autoIndex % ROTATE_ORDER.length] ?? 'FLOOR')
      : configMode;

  const nowMs = lastUpdateAt ?? Date.now();
  const serverNow = state?.serverNow ?? new Date().toISOString();

  const clientNowApprox =
    Date.parse(serverNow) + (Date.now() - nowMs);

  const announcementActive = Boolean(
    state?.announcement &&
      Date.parse(state.announcement.endsAt) > clientNowApprox,
  );

  const highlight = state?.recentAssignments[0];
  const highlightActive = Boolean(
    highlight &&
      Date.parse(highlight.assignedAt) + DISPLAY_ASSIGNMENT_HIGHLIGHT_MS >
        clientNowApprox,
  );

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      /* browser may reject without gesture retry */
    }
  }

  if (unauthorized || (!token && !state)) {
    return (
      <div className="flex min-h-[70vh] flex-col justify-center gap-6">
        <Brand />
        <h1 className="font-display text-3xl font-bold">
          {t('display.unauthorizedTitle')}
        </h1>
        <p className="text-muted max-w-lg text-base">
          {t('display.unauthorizedBody')}
        </p>
        <p>
          <Link className="text-neon hover:underline" to="/display">
            {t('display.pairAgain')}
          </Link>
        </p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex min-h-[70vh] flex-col justify-center gap-4">
        <Brand />
        <p className="text-muted text-lg">
          {loadError ?? t('display.loading')}
        </p>
        {loadError ? (
          <Link className="text-neon hover:underline" to="/display">
            {t('display.pairAgain')}
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[85vh] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Brand className="mb-3" />
          <h1 className="font-display truncate text-3xl font-bold tracking-tight sm:text-5xl">
            {state.event.name}
          </h1>
          <p className="text-muted mt-1 font-mono text-sm tracking-[0.28em] uppercase sm:text-base">
            {state.event.joinCode}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={connected ? 'live' : 'muted'}>
            {connected ? t('display.live') : t('display.connectionLost')}
          </Badge>
          {lastUpdateAt ? (
            <span className="text-muted font-mono text-xs sm:text-sm">
              {t('display.updatedAt', {
                time: new Date(lastUpdateAt).toLocaleTimeString(),
              })}
            </span>
          ) : null}
          <Badge tone="idle">{viewMode}</Badge>
          {typeof document !== 'undefined' && document.fullscreenEnabled ? (
            <Button variant="glass" size="sm" onClick={() => void toggleFullscreen()}>
              {fullscreen ? t('display.exitFullscreen') : t('display.fullscreen')}
            </Button>
          ) : null}
        </div>
      </header>

      {announcementActive && state.announcement ? (
        <div className="border-neon/40 bg-hull/90 fixed inset-0 z-40 flex items-center justify-center border-y px-8 backdrop-blur-md">
          <p className="font-display text-neon max-w-5xl text-center text-4xl leading-tight font-bold sm:text-6xl md:text-7xl">
            {state.announcement.message}
          </p>
        </div>
      ) : null}

      {highlightActive && highlight ? (
        <div
          className="border-neon/50 bg-neon/10 pointer-events-none fixed inset-x-0 top-[18%] z-30 mx-auto max-w-4xl rounded-2xl border px-8 py-10 text-center shadow-[0_0_60px_-12px_var(--color-neon)] backdrop-blur-sm"
          aria-live="polite"
        >
          <p className="text-muted mb-2 text-xs tracking-[0.25em] uppercase">
            {t('display.newAssignment')}
          </p>
          <p className="font-display text-neon text-4xl font-bold sm:text-5xl">
            {highlight.title}
          </p>
          {highlight.subtitle ? (
            <p className="text-muted mt-2 text-lg sm:text-xl">{highlight.subtitle}</p>
          ) : null}
          {highlight.tableLabel ? (
            <p className="mt-4 font-mono text-2xl tracking-widest sm:text-3xl">
              {highlight.tableLabel}
            </p>
          ) : null}
          {highlight.playerNames.length > 0 ? (
            <p className="text-ink mt-4 text-xl sm:text-2xl">
              {highlight.playerNames.join(' · ')}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className={cx(announcementActive || highlightActive ? 'opacity-40' : null)}>
        {viewMode === 'FLOOR' ? (
          <FloorView
            tables={state.tables}
            showNames={state.config.showPlayerNames}
            showTimers={state.config.showTimers}
            serverNow={serverNow}
            nowMs={nowMs}
            tick={tick}
          />
        ) : null}
        {viewMode === 'QUEUES' ? (
          <QueuesView queues={state.queues} serverNow={serverNow} nowMs={nowMs} tick={tick} />
        ) : null}
        {viewMode === 'LIMITED' ? (
          <LimitedView sessions={state.limitedSessions} />
        ) : null}
      </div>
    </div>
  );
}

function FloorView({
  tables,
  showNames,
  showTimers,
  serverNow,
  nowMs,
  tick,
}: {
  tables: PublicDisplayTable[];
  showNames: boolean;
  showTimers: boolean;
  serverNow: string;
  nowMs: number;
  tick: number;
}) {
  const { t } = useTranslation();
  void tick;
  if (tables.length === 0) {
    return <p className="text-muted text-xl">{t('display.noTables')}</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {tables.map((table) => {
        const elapsed = showTimers
          ? formatElapsed(table.activityStartedAt, serverNow, nowMs)
          : '';
        return (
          <div
            key={table.id}
            className="border-muted/20 bg-hull/70 rounded-2xl border p-5 backdrop-blur-xl"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <p className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {table.label}
              </p>
              <Badge tone={activityTone(table.activity)}>{table.activityLabel}</Badge>
            </div>
            {showNames && table.playerNames.length > 0 ? (
              <ul className="space-y-1">
                {table.playerNames.map((name) => (
                  <li key={name} className="text-ink text-lg sm:text-xl">
                    {name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted text-lg">
                {t('display.playerCount', { count: table.playerCount })}
              </p>
            )}
            {elapsed ? (
              <p className="text-neon mt-4 font-mono text-2xl tabular-nums sm:text-3xl">
                {elapsed}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function QueuesView({
  queues,
  serverNow,
  nowMs,
  tick,
}: {
  queues: PublicDisplayQueue[];
  serverNow: string;
  nowMs: number;
  tick: number;
}) {
  const { t } = useTranslation();
  void tick;
  if (queues.length === 0) {
    return <p className="text-muted text-xl">{t('display.noQueues')}</p>;
  }
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {queues.map((queue) => {
        const wait = formatElapsed(queue.oldestReadyAt, serverNow, nowMs);
        return (
          <div
            key={queue.id}
            className="border-muted/20 bg-hull/70 rounded-2xl border p-6 backdrop-blur-xl"
          >
            <p className="font-display mb-2 text-2xl font-semibold sm:text-3xl">
              {queue.label}
            </p>
            <p className="text-neon font-display text-6xl font-bold tabular-nums sm:text-7xl">
              {queue.readyCount}
            </p>
            <p className="text-muted mt-2 text-sm uppercase tracking-widest">
              {t('display.ready')}
              {queue.targetCount ? ` · ${t('display.target', { count: queue.targetCount })}` : ''}
            </p>
            {wait ? (
              <p className="text-ink mt-4 font-mono text-xl tabular-nums">{wait}</p>
            ) : null}
            {queue.hint ? <p className="text-muted mt-2 text-base">{queue.hint}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

function LimitedView({ sessions }: { sessions: PublicDisplayLimitedSession[] }) {
  const { t } = useTranslation();
  const active = sessions.filter((row) => row.status !== 'CANCELLED');
  if (active.length === 0) {
    return <p className="text-muted text-xl">{t('display.noLimited')}</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {active.map((session) => (
        <div
          key={session.id}
          className="border-muted/20 bg-hull/70 rounded-2xl border p-6 backdrop-blur-xl"
        >
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-display text-3xl font-bold sm:text-4xl">{session.label}</p>
              <p className="text-muted mt-1 text-base sm:text-lg">
                {session.mode.replaceAll('_', ' ')} ·{' '}
                {t('display.round', {
                  current: session.currentRound ?? 0,
                  total: session.totalRounds,
                })}{' '}
                · {t('display.playerCount', { count: session.playerCount })}
              </p>
              <p className="text-muted mt-1 text-sm">
                {t('display.results', {
                  reported: session.resultsReported,
                  total: session.resultsTotal,
                })}
              </p>
            </div>
            <LimitedTimerDisplay timer={session.timer} />
          </div>
          {session.matches.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {session.matches.map((match) => (
                <div
                  key={match.id}
                  className="border-muted/15 rounded-xl border px-4 py-3"
                >
                  <p className="text-muted mb-1 text-xs tracking-[0.2em] uppercase">
                    {match.tableLabel ?? t('display.match', { n: match.position })}
                  </p>
                  <p className="font-display text-xl font-semibold sm:text-2xl">
                    {match.playerAName}
                    {match.playerBName ? (
                      <>
                        {' '}
                        <span className="text-muted">{t('common.versus')}</span>{' '}
                        {match.playerBName}
                      </>
                    ) : null}
                  </p>
                  <p className="text-muted mt-1 text-sm">
                    {(match.outcome ?? match.status).replaceAll('_', ' ')}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
