import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, useNavigate } from 'react-router-dom';
import './i18n';
import { App } from './App';
import {
  getSessionDiagnosticId,
  recordJoinBreadcrumb,
} from './join-diagnostics';
import { applyDirectPlayPayload } from './direct-play-share';
import {
  joinCodeFromQueryString,
  playPayloadFromQueryString,
  stripJoinQueryFromLocation,
  stripPlayQueryFromLocation,
} from './join-url';
import { AppErrorBoundary } from './ui/AppErrorBoundary';
import './styles.css';

/**
 * Reads `?join=CODE` from the real location search (outside the hash) and
 * navigates into the existing HashRouter route. Legacy `#/e/CODE` keeps working.
 */
export function JoinQueryBootstrap() {
  const navigate = useNavigate();
  useEffect(() => {
    const code = joinCodeFromQueryString(window.location.search);
    if (!code) {
      return;
    }
    const next = stripJoinQueryFromLocation();
    if (next) {
      window.history.replaceState(window.history.state, '', next);
    }
    navigate(`/e/${code}`, { replace: true });
  }, [navigate]);
  return null;
}

/**
 * Reads `?play=` (direct-play match config) from the real location search and
 * opens the life tracker with that setup hydrated into local storage.
 */
export function PlayQueryBootstrap() {
  const navigate = useNavigate();
  useEffect(() => {
    if (joinCodeFromQueryString(window.location.search)) {
      return;
    }
    const payload = playPayloadFromQueryString(window.location.search);
    if (!payload) {
      return;
    }
    const applied = applyDirectPlayPayload(payload);
    const next = stripPlayQueryFromLocation();
    if (next) {
      window.history.replaceState(window.history.state, '', next);
    }
    if (applied) {
      navigate('/match', { replace: true });
    }
  }, [navigate]);
  return null;
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

recordJoinBreadcrumb('PAGE_BOOT', getSessionDiagnosticId());

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <HashRouter>
        <JoinQueryBootstrap />
        <PlayQueryBootstrap />
        <App />
      </HashRouter>
    </AppErrorBoundary>
  </StrictMode>,
);

/*
  Registered only in a build: the worker answers navigations from cache when the
  network is gone, which is what makes the app installable, and in dev that same
  behaviour would serve a stale shell over the Vite server.
*/
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const workerUrl = `${import.meta.env.BASE_URL}sw.js`;
    void navigator.serviceWorker.register(workerUrl, {
      scope: import.meta.env.BASE_URL,
    });
  });
}
