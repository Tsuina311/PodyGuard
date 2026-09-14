import {
  resolveRulesFormat,
  type CommanderSelection,
  type RulesFormat,
} from '@podyguard/shared';
import { emptySeatCommanders } from './CommanderSeatPickers';
import { removeStored } from './device-storage';
import {
  STANDALONE_GAME_MODES,
  defaultMatchConfig,
  saveMatchConfig,
  seatCountForMode,
  trackerStorageKey,
  type MatchConfig,
  type StandaloneGameMode,
} from './match-config';

/**
 * Compact v1 payload for `?play=` deep links. Omits long sandbox chrome and
 * commander art so phone QR scanners stay under a practical URL size.
 */
type DirectPlayPayloadV1 = {
  v: 1;
  g: StandaloneGameMode;
  r: RulesFormat;
  s: number;
  n: string[];
  c: Array<
    Array<{
      o: string;
      i: string;
      n: string;
      t?: string;
      x?: string;
      k?: string[];
    }>
  >;
  e?: string;
  j?: string;
  p?: string;
  t?: string;
  d?: string;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
}

function base64UrlToBytes(token: string): Uint8Array | null {
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const binary = atob(`${padded}${pad}`);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function slimCommander(commander: CommanderSelection): DirectPlayPayloadV1['c'][number][number] {
  const row: DirectPlayPayloadV1['c'][number][number] = {
    o: commander.oracleId,
    i: commander.cardId,
    n: commander.name,
  };
  if (commander.typeLine) {
    row.t = commander.typeLine;
  }
  if (commander.oracleText) {
    row.x = commander.oracleText.slice(0, 400);
  }
  if (commander.keywords.length > 0) {
    row.k = commander.keywords;
  }
  return row;
}

function expandCommander(
  raw: DirectPlayPayloadV1['c'][number][number],
): CommanderSelection | null {
  if (
    typeof raw.o !== 'string' ||
    typeof raw.i !== 'string' ||
    typeof raw.n !== 'string' ||
    !raw.o ||
    !raw.i ||
    !raw.n
  ) {
    return null;
  }
  return {
    oracleId: raw.o,
    cardId: raw.i,
    name: raw.n,
    artCropUri: '',
    typeLine: typeof raw.t === 'string' ? raw.t : '',
    oracleText: typeof raw.x === 'string' ? raw.x : '',
    keywords: Array.isArray(raw.k)
      ? raw.k.filter((keyword): keyword is string => typeof keyword === 'string')
      : [],
  };
}

export function encodeDirectPlayPayload(config: MatchConfig): string {
  const seatCount = seatCountForMode(config.gameMode, config.seatCount);
  const payload: DirectPlayPayloadV1 = {
    v: 1,
    g: config.gameMode,
    r: config.rulesFormat,
    s: seatCount,
    n: config.names.slice(0, seatCount),
    c: config.commanders
      .slice(0, seatCount)
      .map((seat) => seat.map(slimCommander)),
  };
  if (config.eventName.trim()) {
    payload.e = config.eventName.trim();
  }
  if (config.joinCode.trim()) {
    payload.j = config.joinCode.trim();
  }
  if (config.poolId.trim()) {
    payload.p = config.poolId.trim();
  }
  if (config.tableLabel.trim()) {
    payload.t = config.tableLabel.trim();
  }
  if (config.deckName.trim()) {
    payload.d = config.deckName.trim();
  }
  const json = JSON.stringify(payload);
  return bytesToBase64Url(new TextEncoder().encode(json));
}

export function decodeDirectPlayPayload(token: string): MatchConfig | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  const bytes = base64UrlToBytes(trimmed);
  if (!bytes) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as DirectPlayPayloadV1).v !== 1
  ) {
    return null;
  }
  const payload = parsed as DirectPlayPayloadV1;
  const gameMode = STANDALONE_GAME_MODES.some((mode) => mode.id === payload.g)
    ? payload.g
    : null;
  if (!gameMode) {
    return null;
  }
  const defaults = defaultMatchConfig();
  const rulesFormat = resolveRulesFormat(
    gameMode,
    payload.r === 'normal' || payload.r === 'commander' ? payload.r : null,
  );
  const seatCount = seatCountForMode(
    gameMode,
    typeof payload.s === 'number' ? payload.s : defaults.seatCount,
  );
  const names = Array.isArray(payload.n)
    ? payload.n
        .filter((name): name is string => typeof name === 'string')
        .slice(0, seatCount)
    : [];
  while (names.length < seatCount) {
    names.push(defaults.names[names.length] ?? `Player ${String(names.length + 1)}`);
  }
  const commanders = emptySeatCommanders(defaults.names.length);
  if (Array.isArray(payload.c)) {
    for (let seat = 0; seat < seatCount; seat += 1) {
      const rawSeat = payload.c[seat];
      if (!Array.isArray(rawSeat)) {
        continue;
      }
      const expanded = rawSeat
        .map(expandCommander)
        .filter((row): row is CommanderSelection => row !== null)
        .slice(0, 2);
      commanders[seat] = expanded;
    }
  }
  return {
    ...defaults,
    eventName:
      typeof payload.e === 'string' && payload.e.trim()
        ? payload.e.trim()
        : defaults.eventName,
    joinCode:
      typeof payload.j === 'string' && payload.j.trim()
        ? payload.j.trim()
        : defaults.joinCode,
    gameMode,
    rulesFormat,
    seatCount,
    poolId:
      typeof payload.p === 'string' && payload.p.trim()
        ? payload.p.trim()
        : defaults.poolId,
    tableLabel:
      typeof payload.t === 'string' && payload.t.trim()
        ? payload.t.trim()
        : defaults.tableLabel,
    deckName:
      typeof payload.d === 'string' && payload.d.trim()
        ? payload.d.trim()
        : defaults.deckName,
    names: [
      ...names,
      ...defaults.names.slice(names.length),
    ].slice(0, defaults.names.length),
    commanders,
    resetCount: defaults.resetCount + 1,
  };
}

/** Hydrates local match config from a share token and clears any stale tracker. */
export function applyDirectPlayPayload(token: string): MatchConfig | null {
  const config = decodeDirectPlayPayload(token);
  if (!config) {
    return null;
  }
  removeStored(trackerStorageKey(config));
  saveMatchConfig(config);
  return config;
}
