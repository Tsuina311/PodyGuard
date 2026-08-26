/** Empty in local dev and on the Render-hosted copy: same origin via `/api`. */
export function apiRoot(apiBase = import.meta.env.VITE_API_URL): string {
  return (apiBase ?? '').trim().replace(/\/$/, '');
}

/** Browser path (`/events/...`) on the API host, including the `/api` prefix. */
export function resolveApiUrl(
  path: string,
  apiBase = import.meta.env.VITE_API_URL,
): string {
  const suffix = path.startsWith('/api')
    ? path
    : `/api${path.startsWith('/') ? path : `/${path}`}`;
  return `${apiRoot(apiBase)}${suffix}`;
}
