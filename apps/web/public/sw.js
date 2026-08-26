/*
  This worker exists so the app can be installed. Chrome only offers a real
  install — the kind that opens without a URL bar — to a site whose worker can
  answer a navigation while offline, so it keeps the last shell it was served
  and hands that back when the network is gone.

  It caches nothing else on purpose. A pod's state lives on the API host, and a
  cache-first board would open on yesterday's build; every request goes to the
  network first and the cache is only ever the fallback.
*/
const SHELL = 'podyguard-shell-v3';

function shellUrl() {
  return self.registration.scope;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.add(shellUrl()))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== SHELL).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') {
    return;
  }
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL);
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(shellUrl(), response.clone());
        }
        return response;
      } catch {
        return (await cache.match(shellUrl())) ?? Response.error();
      }
    })(),
  );
});
