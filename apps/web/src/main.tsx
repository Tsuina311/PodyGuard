import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './i18n';
import { App } from './App';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
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
