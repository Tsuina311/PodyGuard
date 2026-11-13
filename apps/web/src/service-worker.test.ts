import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
function worker(offline = false) {
  const handlers: Record<string, (event: any) => void> = {};
  const cached = new Response('<html>cached shell</html>');
  const cache = {
    add: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    match: vi.fn().mockResolvedValue(cached),
  };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi
      .fn()
      .mockResolvedValue([
        'podyguard-shell-v2',
        'podyguard-shell-v4',
        'unrelated-app',
      ]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = offline
    ? vi.fn().mockRejectedValue(new Error('offline'))
    : vi.fn().mockResolvedValue(new Response('fresh'));
  runInNewContext(
    readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'),
    {
      self: {
        registration: { scope: 'https://example.com/PodyGuard/' },
        addEventListener: (name: string, fn: (event: any) => void) => {
          handlers[name] = fn;
        },
        skipWaiting: vi.fn(),
        clients: { claim: vi.fn() },
      },
      caches,
      fetch,
      Response,
      URL,
    },
  );
  return { handlers, cache, caches, fetch, cached };
}
describe('installable app shell', () => {
  it('removes only old PodyGuard shell caches during upgrades', async () => {
    const w = worker();
    let done!: Promise<unknown>;
    w.handlers.activate!({
      waitUntil: (p: Promise<unknown>) => {
        done = p;
      },
    });
    await done;
    expect(w.caches.delete.mock.calls).toEqual([['podyguard-shell-v2']]);
  });
  it('never intercepts API calls or mutations', () => {
    const w = worker();
    const respondWith = vi.fn();
    for (const request of [
      {
        method: 'GET',
        mode: 'navigate',
        url: 'https://example.com/api/account/me',
      },
      {
        method: 'POST',
        mode: 'navigate',
        url: 'https://example.com/PodyGuard/',
      },
      { method: 'GET', mode: 'cors', url: 'https://example.com/api/events' },
    ])
      w.handlers.fetch!({ request, respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });
  it('uses the cached navigation shell when offline and fails honestly without one', async () => {
    const w = worker(true);
    let answer!: Promise<Response>;
    const event = {
      request: {
        method: 'GET',
        mode: 'navigate',
        url: 'https://example.com/PodyGuard/',
      },
      respondWith: (p: Promise<Response>) => {
        answer = p;
      },
    };
    w.handlers.fetch!(event);
    expect(await (await answer).text()).toContain('cached shell');
    w.cache.match.mockResolvedValue(undefined);
    w.handlers.fetch!(event);
    expect((await answer).type).toBe('error');
  });
  it('updates the shell from successful network navigations', async () => {
    const w = worker();
    let answer!: Promise<Response>;
    w.handlers.fetch!({
      request: {
        method: 'GET',
        mode: 'navigate',
        url: 'https://example.com/PodyGuard/',
      },
      respondWith: (p: Promise<Response>) => {
        answer = p;
      },
    });
    expect(await (await answer).text()).toBe('fresh');
    expect(w.cache.put).toHaveBeenCalledOnce();
  });
});
it('precaches only same-origin entry assets before activation', async () => {
  const w = worker();
  w.cache.match.mockResolvedValue(
    new Response(
      '<script src="/PodyGuard/assets/app-123.js"></script><link href="/PodyGuard/assets/app-123.css"><script src="https://external.example/api/private"></script>',
    ),
  );
  const addAll = vi.fn().mockResolvedValue(undefined);
  Object.assign(w.cache, { addAll });
  let done!: Promise<unknown>;
  w.handlers.install!({
    waitUntil: (p: Promise<unknown>) => {
      done = p;
    },
  });
  await done;
  expect(addAll).toHaveBeenCalledWith([
    'https://example.com/PodyGuard/assets/app-123.js',
    'https://example.com/PodyGuard/assets/app-123.css',
  ]);
});
it('uses cached versioned assets offline without intercepting external requests', async () => {
  const w = worker(true);
  let answer!: Promise<Response>;
  const request = {
    method: 'GET',
    mode: 'cors',
    url: 'https://example.com/PodyGuard/assets/app-123.js',
  };
  w.handlers.fetch!({
    request,
    respondWith: (p: Promise<Response>) => {
      answer = p;
    },
  });
  expect(await answer).toBe(w.cached);
  expect(w.cache.match).toHaveBeenCalledWith(request, { ignoreVary: true });
  const respondWith = vi.fn();
  w.handlers.fetch!({
    request: { ...request, url: 'https://external.example/assets/app.js' },
    respondWith,
  });
  expect(respondWith).not.toHaveBeenCalled();
});
