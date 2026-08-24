import { Link, Route, Routes, useMatch } from 'react-router-dom';
import { HomePage } from './HomePage';
import { HostPage } from './HostPage';
import { JoinPage } from './JoinPage';
import { MatchConfigPage } from './MatchConfigPage';
import { MatchSandboxPage } from './MatchSandboxPage';
import { cx } from './ui/cx';

export function App() {
  // `/match` deliberately shares the player layout so it matches a real phone.
  const wide = Boolean(useMatch('/host/:joinCode'));
  return (
    <div className="bg-deep-space relative min-h-screen overflow-hidden">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0" />
      <main
        className={cx(
          'relative mx-auto flex min-h-screen w-full flex-col gap-5 px-5 py-14',
          wide ? 'max-w-4xl justify-start' : 'max-w-2xl justify-center',
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
