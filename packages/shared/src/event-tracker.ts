/** Versioned transfer envelope. Only the controller receives undo/secret state. */
export type EventTrackerHistory = { present: Record<string, unknown>; past: Record<string, unknown>[] };
export type EventTrackerSnapshot = {
  id: string; gameId: string; readToken: string; ownerId: string; ownerName: string;
  generation: number; revision: number; updatedAt: number; owned: boolean;
  history?: EventTrackerHistory;
  transfer?: { id: string; name: string };
  state: Record<string, unknown>;
};

const object = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e15;
const str = (v: unknown): v is string => typeof v === 'string' && v.length <= 20_000;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 200 && v.every(str);
const nullableId = (v: unknown) => v === null || str(v);
const record = (v: unknown, check: (v: unknown) => boolean) => object(v) && Object.keys(v).length <= 200 && Object.values(v).every(check);
const safeJson = (v: unknown, depth = 0): boolean => depth < 12 &&
  (v === null || typeof v === 'boolean' || str(v) || num(v) ||
    (Array.isArray(v) && v.length <= 200 && v.every(x => safeJson(x, depth + 1))) ||
    (object(v) && Object.keys(v).length <= 200 && Object.entries(v).every(([k, x]) =>
      !['__proto__', 'prototype', 'constructor'].includes(k) && safeJson(x, depth + 1))));

/** Validate the complete engine state before another device is allowed to load it. */
export function validEventTrackerState(v: unknown): v is Record<string, unknown> {
  if (!object(v) || !safeJson(v) || !str(v.gameMode) || !['normal', 'commander'].includes(String(v.rulesFormat)) ||
      !Array.isArray(v.players) || v.players.length < 2 || v.players.length > 8) return false;
  const bools = ['assassinContractsReady', 'treacheryRolesReady'];
  const lists = ['emperorIds', 'starOrder', 'treacheryUnveiled', 'schemeOrder', 'activeSchemeIds', 'pastSchemeIds'];
  const ids = ['archenemyId', 'currentSchemeId', 'monarchId', 'initiativeId', 'firstPlayerId', 'winnerId'];
  if (bools.some(k => typeof v[k] !== 'boolean') || lists.some(k => !strings(v[k])) || ids.some(k => !nullableId(v[k])) ||
      ![null, 'two-headed-giant', 'archenemy-commander', 'emperor'].includes(v.teamMode as null) ||
      ![null, 'day', 'night'].includes(v.dayNight as null) ||
      !(v.teams === null || (Array.isArray(v.teams) && v.teams.every(strings))) ||
      !['startedAt', 'pausedAt'].every(k => v[k] === null || num(v[k])) || !num(v.accumulatedPausedMs) ||
      !record(v.assassinTargets, str) || !record(v.assassinScores, num) || !record(v.treacheryRoles, str) ||
      !record(v.treacheryIdentities, num) || !record(v.completedDungeons, strings) ||
      !record(v.dungeons, d => object(d) && str(d.dungeonId) && str(d.roomId) && strings(d.visitedRoomIds) && typeof d.completed === 'boolean') ||
      !Array.isArray(v.eliminations) || !v.eliminations.every(e => object(e) && str(e.playerId) && num(e.at) && loss(e.cause))) return false;
  for (const p of v.players) {
    if (!object(p) || !str(p.id) || !str(p.name) ||
        ['colorIndex', 'life', 'minimumLife', 'poison', 'commanderTax'].some(k => !num(p[k])) ||
        ['enduringStory', 'cityBlessing', 'eliminated'].some(k => typeof p[k] !== 'boolean') ||
        !record(p.counters, num) || !record(p.commanderDamage, num) || !strings(p.answeredCauses) || !loss(p.pendingLoss) ||
        !Array.isArray(p.commanders) || p.commanders.length > 2 || !p.commanders.every(c => object(c) && str(c.id) && str(c.name))) return false;
  }
  const idsAtTable = new Set(v.players.map(p => (p as Record<string, unknown>).id));
  return idsAtTable.size === v.players.length && ['firstPlayerId', 'winnerId'].every(k => v[k] === null || idsAtTable.has(v[k]));
}
function loss(v: unknown) {
  return v === null || (object(v) && ['life', 'poison', 'hit', 'commander'].includes(String(v.type)) &&
    (v.type !== 'commander' || str(v.commanderId)));
}
export function parseEventTrackerHistory(v: unknown): EventTrackerHistory | null {
  if (!object(v) || !validEventTrackerState(v.present) || !Array.isArray(v.past) || v.past.length > 30 || !v.past.every(validEventTrackerState)) return null;
  // Drop envelope extras, and copy so request objects cannot mutate stored state.
  return { present: clean(v.present), past: v.past.map(clean) };
}
const fields = 'players gameMode rulesFormat teams teamMode archenemyId emperorIds starOrder assassinTargets assassinScores assassinContractsReady treacheryRoles treacheryIdentities treacheryUnveiled treacheryRolesReady schemeOrder currentSchemeId activeSchemeIds pastSchemeIds dayNight dungeons completedDungeons monarchId initiativeId firstPlayerId winnerId startedAt pausedAt accumulatedPausedMs eliminations'.split(' ');
function clean(state: Record<string, unknown>): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(Object.fromEntries(fields.map(k => [k, state[k]])))) as Record<string, unknown>;
  copy.players = (copy.players as Record<string, unknown>[]).map(player => {
    const keys = 'id name colorIndex life minimumLife poison commanderTax counters enduringStory cityBlessing commanders commanderDamage eliminated pendingLoss answeredCauses'.split(' ');
    const next = Object.fromEntries(keys.map(k => [k, player[k]]));
    next.counters = Object.fromEntries('acorn energy experience gate hit rad ring speed ticket'.split(' ').map(k => [k, (player.counters as Record<string, number>)[k] ?? 0]));
    next.commanders = (player.commanders as Record<string, unknown>[]).map(c => Object.fromEntries(
      'id name oracleId cardId artCropUri typeLine oracleText keywords'.split(' ').filter(k => c[k] !== undefined).map(k => [k, c[k]])));
    return next;
  });
  return copy;
}
export function publicEventTrackerState(state: Record<string, unknown>): Record<string, unknown> {
  // A viewer never receives hidden identities, secret targets or undo history.
  const { treacheryRoles: _roles, treacheryIdentities: _identities, assassinTargets: _targets, ...rest } = clean(state);
  return { ...rest, treacheryRoles: {}, treacheryIdentities: {}, assassinTargets: {} };
}
