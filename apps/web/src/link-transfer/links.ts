import { TRANSFER_ID, TRANSFER_TOKEN, shareableTransferDestination } from '@podyguard/shared';
import { resolvePlayerLinkParts } from '../join-url';

export function transferAppBase(): string {
  const configured = import.meta.env.VITE_PUBLIC_ORIGIN?.trim();
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  // Same-origin local rehearsal works without production hosting settings.
  const parts = resolvePlayerLinkParts(window.location, {
    lanHost: __LAN_HOST__, publicSiteUrl: configured,
    isProduction: import.meta.env.PROD && !local, forPhoneQr: !import.meta.env.PROD,
  });
  if (parts.status !== 'ok') throw new Error('Configure the public app address before creating a screen QR.');
  return `${parts.origin}${parts.pathname}`;
}

export function transferQrLink(id: string, sendToken: string) {
  return `${transferAppBase()}#/send-to-screen/${id}?send=${sendToken}`;
}

export function transferFromScan(raw: string, appBase = transferAppBase()): { id: string; sendToken: string } | null {
  if (raw.length > 2048) return null;
  try {
    const base = new URL(appBase), url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== base.origin || url.pathname !== base.pathname ||
        url.username || url.password || url.search) return null;
    if (!url.hash.startsWith('#/send-to-screen/')) return null;
    const route = new URL(url.hash.slice(1), 'https://podyguard.invalid');
    const id = route.pathname.match(/^\/send-to-screen\/([^/]+)$/)?.[1];
    const sendToken = route.searchParams.get('send') ?? '';
    if (!id || !TRANSFER_ID.test(id) || !TRANSFER_TOKEN.test(sendToken) || route.hash ||
        url.hash !== `#/send-to-screen/${id}?send=${sendToken}` ||
        [...route.searchParams.keys()].some(key => key !== 'send') || route.searchParams.getAll('send').length !== 1) return null;
    return { id, sendToken };
  } catch { return null; }
}

export function destinationFromInput(value: string): string | null {
  const trimmed = value.trim();
  if (/^[A-Z0-9]{4,12}$/i.test(trimmed)) return `/display/event/${trimmed.toUpperCase()}`;
  if (trimmed.startsWith('/')) return shareableTransferDestination(trimmed);
  if (trimmed.startsWith('#/')) return shareableTransferDestination(trimmed.slice(1));
  try {
    const base = new URL(transferAppBase()), url = new URL(trimmed);
    const sameApp = (url.origin === base.origin && url.pathname === base.pathname) ||
      (url.origin === window.location.origin && url.pathname === window.location.pathname);
    if (!sameApp || url.username || url.password || url.search) return null;
    return shareableTransferDestination(url.hash.slice(1));
  } catch { return null; }
}

export function currentScreenDestination(route: string): string | null {
  const event = route.match(/^\/(?:host|e)\/([A-Z0-9]{4,12})(?:[?#]|$)/);
  return event ? `/display/event/${event[1]}` : shareableTransferDestination(route);
}
