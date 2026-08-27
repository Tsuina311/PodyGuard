import { useEffect, useState } from 'react';
import { Link, Route, Routes, useMatch } from 'react-router-dom';
import { checkHealth } from './api';
import { shouldShowWakeScreen } from './server-wake';
import { HomePage } from './HomePage';
import { HostPage } from './HostPage';
import { JoinPage } from './JoinPage';
import { MatchConfigPage } from './MatchConfigPage';
import { MatchSandboxPage } from './MatchSandboxPage';
import { cx } from './ui/cx';
import { ServerWakeScreen } from './ui/ServerWakeScreen';

export function App() {
  // `/match` deliberately shares the player layout so it matches a real phone.
  const wide = Boolean(useMatch('/host/:joinCode'));
  // Both routes are probed on every render: `||` would skip the second hook.
  const sandbox = useMatch('/match');
  const sandboxConfig = useMatch('/match-config');
  const home = useMatch({ path: '/', end: true });
  const localOnly = Boolean(sandbox || sandboxConfig);
  const waking = useServerWake() && !localOnly;
  return (
    <div className="bg-deep-space relative min-h-screen overflow-hidden">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0" />
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
                Not found.{' '}
                <Link className="text-neon hover:underline" to="/">
                  Home
                </Link>
              </p>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

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
    let timer = 0;
    const tick = async () => {
      const ok = await checkHealth();
      if (cancelled) {
        return;
      }
      setWaitedMs(Date.now() - started);
      setHealthOk(ok);
      if (!ok) {
        timer = window.setTimeout(() => void tick(), 2500);
      }
    };
    const delay = window.setTimeout(() => {
      setWaitedMs(Date.now() - started);
    }, 800);
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(delay);
    };
  }, [isProd]);

  return shouldShowWakeScreen({ isProd, healthOk, waitedMs });
}
