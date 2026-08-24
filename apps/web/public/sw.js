/*
  This worker exists so the app can be installed. Chrome only offers a real
  install — the kind that opens without a URL bar — to a site whose worker can
  answer a navigation while offline, so it keeps the last shell it was served
  and hands that back when the network is gone.

  It caches nothing else on purpose. A pod's state lives on the server, and a
  cache-first board would open on yesterday's build; every request goes to the
  network first and the cache is only ever the fallback.
*/
const SHELL = 'podyguard-shell-v1';
const SHELL_URL = '/';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.add(SHELL_URL))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') {
    return;
  }
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(SHELL);
        await cache.put(SHELL_URL, response.clone());
        return response;
      } catch {
        const cached = await caches.match(SHELL_URL);
        return cached ?? Response.error();
      }
    })(),
  );
});
