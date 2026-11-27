export const LINK_TRANSFER_TTL_MS = 5 * 60_000;
export const TRANSFER_TOKEN = /^[a-f0-9]{64}$/;
export const TRANSFER_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export type LinkTransferCredentials = { id: string; sendToken: string; receiveToken: string; expiresAt: string };
export type LinkTransferResult = { status: 'WAITING' | 'ACCEPTED'; destination?: string; expiresAt: string };

/** Only router-relative, independently shareable app pages. Never arbitrary URLs. */
export function shareableTransferDestination(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 8192 || !value.startsWith('/') ||
      value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  let url: URL;
  try { url = new URL(value, 'https://podyguard.invalid'); } catch { return null; }
  if (url.origin !== 'https://podyguard.invalid' || url.pathname.includes('%') ||
      value.split(/[?#]/)[0] !== url.pathname) return null;
  const code = '[A-Z0-9]{4,12}';
  const uuid = '[a-f0-9-]{36}';
  let keys: string[];
  if (new RegExp(`^/display/event/${code}$`).test(url.pathname)) keys = ['gameId'];
  else if (new RegExp(`^/e/${code}$`).test(url.pathname)) keys = ['seat'];
  else if (new RegExp(`^/host/${code}$`).test(url.pathname)) keys = ['tab', 'view'];
  else if (new RegExp(`^/nights/${uuid}$`).test(url.pathname)) keys = [];
  else if (/^\/watch\/(?:[a-f0-9]{64}|event-[a-f0-9-]{36})$/.test(url.pathname)) {
    keys = ['token'];
    if (!TRANSFER_TOKEN.test(url.searchParams.get('token') ?? '')) return null;
  } else if (url.pathname === '/tools') keys = ['tab', 'q'];
  else return null;
  if ([...url.searchParams.keys()].some(key => !keys.includes(key))) return null;
  // Keep the accepted query and fragment byte-for-byte; do not decode a second URL.
  return value;
}
