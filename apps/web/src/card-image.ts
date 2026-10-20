import { resolveApiUrl } from './api-base';

const SCRYFALL_HOSTS = new Set(['cards.scryfall.io', 'api.scryfall.com']);

/**
 * Card pictures in lists are loaded by the phone, not by the API that already
 * returned the card. An installed app often cannot paint a third-party image,
 * so Scryfall art is fetched through the API the app is already talking to.
 * Local art (dungeons, identities) is left alone.
 */
export function cardImageSrc(
  uri: string | null | undefined,
  apiBase = import.meta.env.VITE_API_URL,
): string {
  if (!uri) {
    return '';
  }
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return uri;
  }
  if (url.protocol !== 'https:' || !SCRYFALL_HOSTS.has(url.hostname)) {
    return uri;
  }
  return resolveApiUrl(
    `/scryfall/image?src=${encodeURIComponent(uri)}`,
    apiBase,
  );
}
