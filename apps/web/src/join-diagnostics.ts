export type JoinStage =
  | 'PAGE_BOOT'
  | 'API_HEALTH_OK'
  | 'API_HEALTH_FAILED'
  | 'EVENT_LOOKUP_STARTED'
  | 'EVENT_LOOKUP_OK'
  | 'EVENT_LOOKUP_FAILED'
  | 'JOIN_STARTED'
  | 'JOIN_OK'
  | 'JOIN_FAILED'
  | 'SOCKET_CONNECT_STARTED'
  | 'SOCKET_CONNECTED'
  | 'SOCKET_FAILED';

export type JoinBreadcrumb = {
  at: string;
  stage: JoinStage;
  detail?: string;
};

const MAX_BREADCRUMBS = 40;

let sessionDiagnosticId = '';
const breadcrumbs: JoinBreadcrumb[] = [];

function randomHex(length: number): string {
  const alphabet = '0123456789ABCDEF';
  let out = '';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i]! % 16]!;
  }
  return out;
}

/** Short public reference like `PG-7F3A`. Never derived from tokens. */
export function createDiagnosticId(): string {
  return `PG-${randomHex(4)}`;
}

export function getSessionDiagnosticId(): string {
  if (!sessionDiagnosticId) {
    sessionDiagnosticId = createDiagnosticId();
  }
  return sessionDiagnosticId;
}

export function resetJoinDiagnosticsForTests(): void {
  sessionDiagnosticId = '';
  breadcrumbs.length = 0;
}

/**
 * Records a privacy-safe join-stage breadcrumb. Never pass tokens, Authorization
 * headers, or personal fields in `detail`.
 */
export function recordJoinBreadcrumb(
  stage: JoinStage,
  detail?: string,
): JoinBreadcrumb {
  const entry: JoinBreadcrumb = {
    at: new Date().toISOString(),
    stage,
    ...(detail ? { detail: detail.slice(0, 120) } : {}),
  };
  breadcrumbs.push(entry);
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.shift();
  }
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info('[podyguard-join]', getSessionDiagnosticId(), stage, detail ?? '');
  }
  return entry;
}

export function listJoinBreadcrumbs(): readonly JoinBreadcrumb[] {
  return breadcrumbs;
}
