import {
  dungeonById,
  legalNextRoomIds,
  type DungeonId,
  type DungeonProgress,
} from './dungeons';
import type { CommanderSelection } from '../scryfall';

export const STARTING_LIFE = 40;
export const POISON_LIMIT = 10;
export const COMMANDER_DAMAGE_LIMIT = 21;
export const HIT_LIMIT = 3;

export type SecondaryCounter =
  | 'acorn'
  | 'energy'
  | 'experience'
  | 'hit'
  | 'rad'
  | 'ring'
  | 'speed'
  | 'ticket';

export type SecondaryCounters = Record<SecondaryCounter, number>;

/**
 * Why the rules would normally end a player's game. Cards like Platinum Angel
 * or Phyrexian Unlife can override each of these, so the player confirms.
 */
export type LossCause =
  | { type: 'life' }
  | { type: 'poison' }
  | { type: 'hit' }
  | { type: 'commander'; commanderId: string };

export type Commander = {
  id: string;
  name: string;
  oracleId?: string;
  cardId?: string;
  artCropUri?: string;
  typeLine?: string;
  oracleText?: string;
  keywords?: string[];
};

export type TrackerSeed = {
  id: string;
  name: string;
  commanders?: CommanderSelection[];
};

export type TrackerPlayer = {
  id: string;
  name: string;
  life: number;
  poison: number;
  /** Extra mana owed on the next recast, so it moves two at a time. */
  commanderTax: number;
  /** Less common player counters, kept off the life-first match surface. */
  counters: SecondaryCounters;
  /** Sticky player designations granted by storied and ascend. */
  enduringStory: boolean;
  cityBlessing: boolean;
  /** Each player may have one commander or a partner pair. */
  commanders: Commander[];
  /** Damage taken, keyed by the dealing commander's id. */
  commanderDamage: Record<string, number>;
  eliminated: boolean;
  /** Awaiting a yes/no answer on whether this player actually lost. */
  pendingLoss: LossCause | null;
  /** Causes already asked about and declined, cleared when the cause lifts. */
  answeredCauses: string[];
};

export type TrackerState = {
  players: TrackerPlayer[];
  dayNight: 'day' | 'night' | null;
  dungeons: Record<string, DungeonProgress | undefined>;
  /** Completions in order, including repeats. The 0–4 counter is unique ids. */
  completedDungeons: Record<string, DungeonId[]>;
  monarchId: string | null;
  initiativeId: string | null;
  firstPlayerId: string | null;
  winnerId: string | null;
  startedAt: number;
  pausedAt: number | null;
  accumulatedPausedMs: number;
};

export type TrackerAction =
  | { type: 'life'; playerId: string; delta: number }
  | { type: 'poison'; playerId: string; delta: number }
  | { type: 'tax'; playerId: string; delta: number }
  | {
      type: 'counter';
      playerId: string;
      counter: SecondaryCounter;
      delta: number;
    }
  | {
      type: 'designation';
      playerId: string;
      designation: 'enduringStory' | 'cityBlessing';
      value: boolean;
    }
  | { type: 'commander'; commanderId: string; toId: string; delta: number }
  | { type: 'dayNight'; value: 'day' | 'night' }
  | {
      type: 'enterDungeon';
      playerId: string;
      dungeonId: DungeonId;
      viaInitiative?: boolean;
    }
  | { type: 'advanceDungeon'; playerId: string; roomId: string }
  | { type: 'stepBackDungeon'; playerId: string }
  | { type: 'monarch'; playerId: string | null }
  | { type: 'initiative'; playerId: string | null }
  | { type: 'eliminate'; playerId: string }
  | { type: 'confirmLoss'; playerId: string }
  | { type: 'declineLoss'; playerId: string }
  | { type: 'winner'; playerId: string }
  | { type: 'first'; playerId: string }
  | { type: 'pause' };

export function createTracker(
  names: TrackerSeed[],
  now = Date.now(),
): TrackerState {
  return {
    players: names.map((row) => ({
      id: row.id,
      name: row.name,
      life: STARTING_LIFE,
      poison: 0,
      commanderTax: 0,
      counters: emptySecondaryCounters(),
      enduringStory: false,
      cityBlessing: false,
      commanders: seedCommanders(row),
      commanderDamage: {},
      eliminated: false,
      pendingLoss: null,
      answeredCauses: [],
    })),
    dayNight: null,
    dungeons: {},
    completedDungeons: {},
    monarchId: null,
    initiativeId: null,
    firstPlayerId: null,
    winnerId: null,
    startedAt: now,
    pausedAt: null,
    accumulatedPausedMs: 0,
  };
}

export function elapsedMs(state: TrackerState, now = Date.now()): number {
  if (!state.firstPlayerId) {
    return 0;
  }
  const paused = state.pausedAt
    ? state.accumulatedPausedMs + (now - state.pausedAt)
    : state.accumulatedPausedMs;
  return Math.max(0, now - state.startedAt - paused);
}

export function applyTrackerAction(
  state: TrackerState,
  action: TrackerAction,
  now = Date.now(),
): TrackerState {
  if (state.winnerId && action.type !== 'pause') {
    return state;
  }
  const next: TrackerState = structuredClone(state);
  next.dayNight ??= null;
  next.dungeons ??= {};
  next.completedDungeons ??= {};
  switch (action.type) {
    case 'life': {
      const player = playerById(next, action.playerId);
      player.life += action.delta;
      break;
    }
    case 'poison': {
      const player = playerById(next, action.playerId);
      player.poison = Math.max(0, player.poison + action.delta);
      break;
    }
    case 'tax': {
      const player = playerById(next, action.playerId);
      player.commanderTax = Math.max(0, player.commanderTax + action.delta);
      break;
    }
    case 'counter': {
      const player = playerById(next, action.playerId);
      player.counters ??= emptySecondaryCounters();
      const maximum =
        action.counter === 'hit'
          ? HIT_LIMIT
          : action.counter === 'ring' || action.counter === 'speed'
            ? 4
            : Number.POSITIVE_INFINITY;
      player.counters[action.counter] = Math.min(
        maximum,
        Math.max(0, (player.counters[action.counter] ?? 0) + action.delta),
      );
      break;
    }
    case 'designation': {
      const player = playerById(next, action.playerId);
      player[action.designation] = action.value;
      break;
    }
    case 'commander': {
      const source = commanderById(next, action.commanderId);
      if (!source || source.owner.id === action.toId) {
        break;
      }
      const target = playerById(next, action.toId);
      const current = target.commanderDamage[action.commanderId] ?? 0;
      const nextDamage = Math.max(0, current + action.delta);
      // Commander damage is combat damage, so life changes by the same amount.
      target.life -= nextDamage - current;
      target.commanderDamage[action.commanderId] = nextDamage;
      break;
    }
    case 'dayNight':
      next.dayNight = action.value;
      break;
    case 'enterDungeon': {
      const active = next.dungeons[action.playerId];
      if (active && !active.completed) {
        break;
      }
      const dungeon = dungeonById(action.dungeonId);
      if (dungeon.initiativeOnly && !action.viaInitiative) {
        break;
      }
      const entrance = dungeon.rooms.find((room) => room.row === 1);
      if (!entrance) {
        break;
      }
      next.dungeons[action.playerId] = {
        dungeonId: dungeon.id,
        roomId: entrance.id,
        visitedRoomIds: [entrance.id],
        completed: entrance.next.length === 0,
      };
      break;
    }
    case 'advanceDungeon': {
      const progress = next.dungeons[action.playerId];
      if (!progress || !legalNextRoomIds(progress).includes(action.roomId)) {
        break;
      }
      const dungeon = dungeonById(progress.dungeonId);
      const target = dungeon.rooms.find((room) => room.id === action.roomId);
      if (!target) {
        break;
      }
      progress.roomId = target.id;
      progress.visitedRoomIds.push(target.id);
      progress.completed = target.next.length === 0;
      if (progress.completed) {
        recordDungeonCompletion(next, action.playerId, progress.dungeonId);
      }
      break;
    }
    // Takes back a misclicked room. The entrance stays put, since a player
    // still cannot abandon a dungeon they have entered.
    case 'stepBackDungeon': {
      const progress = next.dungeons[action.playerId];
      if (!progress || progress.visitedRoomIds.length < 2) {
        break;
      }
      progress.visitedRoomIds.pop();
      const previousId =
        progress.visitedRoomIds[progress.visitedRoomIds.length - 1];
      if (!previousId) {
        break;
      }
      progress.roomId = previousId;
      if (progress.completed) {
        progress.completed = false;
        unrecordDungeonCompletion(next, action.playerId, progress.dungeonId);
      }
      break;
    }
    case 'monarch':
      next.monarchId = action.playerId;
      break;
    case 'initiative': {
      next.initiativeId = action.playerId;
      if (action.playerId) {
        const progress = next.dungeons[action.playerId];
        if (!progress || progress.completed) {
          const undercity = dungeonById('undercity');
          const entrance = undercity.rooms.find((room) => room.row === 1);
          if (entrance) {
            next.dungeons[action.playerId] = {
              dungeonId: 'undercity',
              roomId: entrance.id,
              visitedRoomIds: [entrance.id],
              completed: false,
            };
          }
        }
      }
      break;
    }
    case 'eliminate': {
      const player = playerById(next, action.playerId);
      player.eliminated = true;
      player.pendingLoss = null;
      break;
    }
    case 'confirmLoss': {
      const player = playerById(next, action.playerId);
      player.eliminated = true;
      player.pendingLoss = null;
      break;
    }
    case 'declineLoss': {
      const player = playerById(next, action.playerId);
      player.pendingLoss = null;
      break;
    }
    case 'winner':
      next.winnerId = action.playerId;
      next.pausedAt = now;
      break;
    case 'first':
      if (!next.firstPlayerId) {
        next.startedAt = now;
        next.pausedAt = null;
        next.accumulatedPausedMs = 0;
      }
      next.firstPlayerId = action.playerId;
      break;
    case 'pause':
      if (next.pausedAt) {
        next.accumulatedPausedMs += now - next.pausedAt;
        next.pausedAt = null;
      } else {
        next.pausedAt = now;
      }
      break;
    default:
      break;
  }
  raiseLossPrompts(next);
  // The monarchy and the initiative leave with the player holding them.
  if (next.monarchId && playerById(next, next.monarchId).eliminated) {
    next.monarchId = null;
  }
  if (next.initiativeId && playerById(next, next.initiativeId).eliminated) {
    next.initiativeId = null;
  }
  const alive = next.players.filter((row) => !row.eliminated);
  if (!next.winnerId && alive.length === 1 && next.players.length > 1) {
    next.winnerId = alive[0]?.id ?? null;
    next.pausedAt = now;
  }
  if (next.winnerId) {
    // A finished game cannot answer prompts, so retire any that are open.
    for (const player of next.players) {
      player.pendingLoss = null;
    }
  }
  return next;
}

/**
 * Zero life, ten poison, three Etrata hits and 21 commander damage usually end
 * a game, but they are all replaceable, so each newly met cause raises a prompt
 * instead of removing the player. A declined cause stays quiet until it lifts
 * and recurs.
 */
function raiseLossPrompts(state: TrackerState): void {
  for (const player of state.players) {
    player.answeredCauses ??= [];
    if (player.eliminated) {
      player.pendingLoss = null;
      player.answeredCauses = [];
      continue;
    }
    const active = activeLossCauses(player);
    const activeKeys = new Set(active.map(causeKey));
    player.answeredCauses = player.answeredCauses.filter((key) =>
      activeKeys.has(key),
    );
    if (player.pendingLoss) {
      // Drop a prompt whose cause was undone or otherwise removed.
      if (!activeKeys.has(causeKey(player.pendingLoss))) {
        player.pendingLoss = null;
      }
      continue;
    }
    const unanswered = active.find(
      (cause) => !player.answeredCauses.includes(causeKey(cause)),
    );
    if (unanswered) {
      player.pendingLoss = unanswered;
      player.answeredCauses = [...player.answeredCauses, causeKey(unanswered)];
    }
  }
}

function activeLossCauses(player: TrackerPlayer): LossCause[] {
  const causes: LossCause[] = [];
  if (player.life <= 0) {
    causes.push({ type: 'life' });
  }
  if (player.poison >= POISON_LIMIT) {
    causes.push({ type: 'poison' });
  }
  if ((player.counters?.hit ?? 0) >= HIT_LIMIT) {
    causes.push({ type: 'hit' });
  }
  for (const [commanderId, damage] of Object.entries(player.commanderDamage)) {
    if (damage >= COMMANDER_DAMAGE_LIMIT) {
      causes.push({ type: 'commander', commanderId });
    }
  }
  return causes;
}

function causeKey(cause: LossCause): string {
  return cause.type === 'commander'
    ? `commander:${cause.commanderId}`
    : cause.type;
}

export function defaultCommanders(playerId: string, name: string): Commander[] {
  return [{ id: primaryCommanderId(playerId), name }];
}

export function seedCommanders(player: TrackerSeed): Commander[] {
  if (!player.commanders?.length) {
    return defaultCommanders(player.id, player.name);
  }
  return player.commanders.map((commander) => ({
    ...commander,
    id: `${player.id}:${commander.cardId}`,
  }));
}

export function primaryCommanderId(playerId: string): string {
  return `${playerId}:1`;
}

export function commanderById(
  state: TrackerState,
  commanderId: string,
): { owner: TrackerPlayer; commander: Commander } | null {
  for (const owner of state.players) {
    const commander = owner.commanders.find((row) => row.id === commanderId);
    if (commander) {
      return { owner, commander };
    }
  }
  return null;
}

export type IncomingCommanderDamage = {
  commanderId: string;
  owner: string;
  commander: string;
  value: number;
};

function incomingCommanderDamage(
  state: TrackerState,
  player: TrackerPlayer,
): IncomingCommanderDamage[] {
  return state.players
    .filter((other) => other.id !== player.id)
    .flatMap((other) =>
      other.commanders.map((commander) => ({
        commanderId: commander.id,
        owner: other.name,
        commander: commander.name,
        value: player.commanderDamage[commander.id] ?? 0,
      })),
    );
}

/**
 * The commander that has dealt this player the most damage, or null while the
 * board is clean.
 *
 * It takes 21 from a single commander to kill, so the largest single figure is
 * the one worth watching. A total would read as danger when two commanders sit
 * at 15 each and neither is a threat.
 */
export function worstCommanderDamage(
  state: TrackerState,
  player: TrackerPlayer,
): IncomingCommanderDamage | null {
  return incomingCommanderDamage(state, player).reduce<
    IncomingCommanderDamage | null
  >(
    (worst, row) =>
      row.value > 0 && (!worst || row.value > worst.value) ? row : worst,
    null,
  );
}

export function uniqueCompletedDungeonCount(
  completions: DungeonId[] | undefined,
): number {
  return new Set(completions ?? []).size;
}

export function emptySecondaryCounters(): SecondaryCounters {
  return {
    acorn: 0,
    energy: 0,
    experience: 0,
    hit: 0,
    rad: 0,
    ring: 0,
    speed: 0,
    ticket: 0,
  };
}

function recordDungeonCompletion(
  state: TrackerState,
  playerId: string,
  dungeonId: DungeonId,
): void {
  const list = state.completedDungeons[playerId] ?? [];
  state.completedDungeons[playerId] = [...list, dungeonId];
}

function unrecordDungeonCompletion(
  state: TrackerState,
  playerId: string,
  dungeonId: DungeonId,
): void {
  const list = [...(state.completedDungeons[playerId] ?? [])];
  const last = list.lastIndexOf(dungeonId);
  if (last >= 0) {
    list.splice(last, 1);
  }
  state.completedDungeons[playerId] = list;
}

export function pickFirstPlayer(
  state: TrackerState,
  random = Math.random,
  now = Date.now(),
): TrackerState {
  const alive = state.players.filter((row) => !row.eliminated);
  const pick = alive[Math.floor(random() * alive.length)];
  if (!pick) {
    return state;
  }
  return applyTrackerAction(state, { type: 'first', playerId: pick.id }, now);
}

function playerById(state: TrackerState, id: string): TrackerPlayer {
  const player = state.players.find((row) => row.id === id);
  if (!player) {
    throw new Error('Unknown tracker player.');
  }
  return player;
}
