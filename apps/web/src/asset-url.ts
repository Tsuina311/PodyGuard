/*
  Card art is addressed from the site root in the shared identity and dungeon
  data, which holds on a domain of its own but not under the GitHub Pages path.
  Vite rewrites its own imports against `base` and leaves these strings alone,
  so anything read out of that data is resolved through here instead.
*/
export function assetUrl(
  path: string,
  base: string = import.meta.env.BASE_URL,
): string {
  if (!path.startsWith('/')) {
    return path;
  }
  return `${base.replace(/\/+$/, '')}${path}`;
}
