/* Cache only the public navigation shell and versioned same-origin assets.
 * API responses and player/account data always use their normal network paths.
 * A cached shell without its JS/CSS cannot cold-start offline, so installation
 * prepares its entry assets before claiming clients. */
const SHELL = 'podyguard-shell-v4';
const ASSET_PATH = new URL('assets/', self.registration.scope).pathname;
function shellUrl() {
  return self.registration.scope;
}
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.add(shellUrl());
      const shell = await cache.match(shellUrl());
      const html = shell ? await shell.text() : '';
      const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
        .map((match) => new URL(match[1], shellUrl()))
        .filter(
          (url) =>
            url.origin === new URL(shellUrl()).origin &&
            url.pathname.startsWith(ASSET_PATH),
        );
      await cache.addAll(assets.map((url) => url.href));
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith('podyguard-shell-') && key !== SHELL,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const asset =
    url.origin === new URL(shellUrl()).origin &&
    url.pathname.startsWith(ASSET_PATH);
  const scope = new URL(shellUrl());
  const navigation =
    request.mode === 'navigate' &&
    url.origin === scope.origin &&
    (url.pathname === scope.pathname ||
      url.pathname === `${scope.pathname}index.html`);
  if (!navigation && !asset) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL);
      const key = asset ? request : shellUrl();
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(key, response.clone());
        return response;
      } catch {
        // These are public static files only. The API host adds Vary: Origin;
        // module requests and install-time fetches can carry different Origin
        // headers even for the same immutable asset URL.
        return (await cache.match(key, { ignoreVary: true })) ?? Response.error();
      }
    })(),
  );
});
