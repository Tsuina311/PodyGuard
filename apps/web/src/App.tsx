import { useEffect, useState } from 'react';
import { Link, Route, Routes, useMatch } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { checkHealth } from './api';
import { FeedbackProvider } from './feedback/FeedbackContext';
import {
  KEEP_ALIVE_INTERVAL_MS,
  readLastKeepAlivePingAt,
  shouldSendKeepAlivePing,
  shouldShowWakeScreen,
  writeLastKeepAlivePingAt,
} from './server-wake';
import { HomePage } from './HomePage';
import { HostPage } from './HostPage';
import { JoinPage } from './JoinPage';
import { MatchConfigPage } from './MatchConfigPage';
import { MatchSandboxPage } from './MatchSandboxPage';
import { cx } from './ui/cx';
import { ServerWakeScreen } from './ui/ServerWakeScreen';

export function App() {
  const { t } = useTranslation();
  // `/match` deliberately shares the player layout so it matches a real phone.
  const wide = Boolean(useMatch('/host/:joinCode'));
  // Both routes are probed on every render: `||` would skip the second hook.
  const sandbox = useMatch('/match');
  const sandboxConfig = useMatch('/match-config');
  const home = useMatch({ path: '/', end: true });
  const localOnly = Boolean(sandbox || sandboxConfig);
  const waking = useServerWake() && !localOnly;
  return (
    <FeedbackProvider>
      <div className="bg-deep-space relative min-h-screen overflow-hidden">
        <div
          aria-hidden
          className="bg-grid pointer-events-none absolute inset-0"
        />
        {waking ? <ServerWakeScreen /> : null}
        <main
          className={cx(
            'relative mx-auto flex min-h-screen w-full flex-col gap-5 px-5',
            home ? 'justify-start py-8' : 'py-14',
            wide ? 'max-w-4xl justify-start' : 'max-w-2xl',
            !wide && !home && 'justify-center',
          )}
        >
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/e/:joinCode" element={<JoinPage />} />
            <Route path="/host/:joinCode" element={<HostPage />} />
            <Route path="/match" element={<MatchSandboxPage />} />
            <Route path="/match-config" element={<MatchConfigPage />} />
            <Route
              path="*"
              element={
                <p className="text-muted text-sm">
                  {t('app.notFound')}{' '}
                  <Link className="text-neon hover:underline" to="/">
                    {t('common.home')}
                  </Link>
                </p>
              }
            />
          </Routes>
        </main>
      </div>
    </FeedbackProvider>
  );
}

/**
 * Cold-start wake screen, then a light shared keepalive while the tab is
 * visible. GitHub Actions also pings on a schedule; phones only fill the gaps
 * and never each open their own hammer.
 */
function useServerWake(): boolean {
  const isProd = import.meta.env.PROD;
  const [healthOk, setHealthOk] = useState<boolean | null>(isProd ? null : true);
  const [waitedMs, setWaitedMs] = useState(0);

  useEffect(() => {
    if (!isProd) {
      return;
    }
    const started = Date.now();
    let cancelled = false;
    let retryTimer = 0;
    let intervalTimer = 0;
    let waking = true;

    const markWaited = () => {
      if (!cancelled) {
        setWaitedMs(Date.now() - started);
      }
    };

    const probe = async (force: boolean) => {
      if (cancelled) {
        return;
      }
      if (
        !force &&
        !shouldSendKeepAlivePing({
          now: Date.now(),
          lastPingAt: readLastKeepAlivePingAt(),
        })
      ) {
        return;
      }
      // Claim the slot before awaiting so sibling tabs skip this beat.
      writeLastKeepAlivePingAt(Date.now());
      const ok = await checkHealth();
      if (cancelled) {
        return;
      }
      markWaited();
      setHealthOk(ok);
      waking = !ok;
      if (!ok) {
        retryTimer = window.setTimeout(() => void probe(true), 2500);
      }
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      // Force only while the host is down; otherwise honour the shared gap so
      // flipping between apps does not stampede /health.
      void probe(waking);
    };

    const delay = window.setTimeout(markWaited, 800);
    void probe(true);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    intervalTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void probe(false);
      }
    }, KEEP_ALIVE_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      window.clearTimeout(delay);
      window.clearInterval(intervalTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [isProd]);

  return shouldShowWakeScreen({ isProd, healthOk, waitedMs });
}

