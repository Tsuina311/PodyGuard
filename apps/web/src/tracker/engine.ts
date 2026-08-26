import {
  TREACHERY_ROLES,
  treacheryDistribution,
  treacheryIdentityById,
  treacheryRolesForSize,
  type TreacheryRole,
} from '@podyguard/shared';
import {
  dungeonById,
  legalNextRoomIds,
  type DungeonId,
  type DungeonProgress,
} from './dungeons';
import type { CommanderSelection } from '../scryfall';
import { schemeById } from './archenemy';
import { assassinTargets } from './assassin';
import { STAR_PLAYER_COUNT, starEnemies } from './star';
import type { TreacheryDeal } from './treachery';

export const STARTING_LIFE = 40;
export const TWO_HEADED_GIANT_STARTING_LIFE = 60;
export const TWO_HEADED_GIANT_POISON_LIMIT = 20;
export const ARCHENEMY_STARTING_LIFE = 60;
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

export type EliminationRecord = {
  playerId: string;
  cause: LossCause | null;
  at: number;
};

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
  /** Lowest life observed this game, used by threshold-then-win challenges. */
  minimumLife: number;
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
  /** Two sides in board order for team variants. */
  teams: string[][] | null;
  teamMode: 'two-headed-giant' | 'archenemy-commander' | 'emperor' | null;
  archenemyId: string | null;
  emperorIds: string[];
  /** Circular seat order for Star; adjacent ids are allies. */
  starOrder: string[];
  assassinTargets: Record<string, string>;
  assassinScores: Record<string, number>;
  assassinContractsReady: boolean;
  /** Secret roles, only filled when this device deals Treachery itself. */
  treacheryRoles: Record<string, TreacheryRole>;
  treacheryIdentities: Record<string, number>;
  /** Players who have shown their identity card to the whole table. */
  treacheryUnveiled: string[];
  treacheryRolesReady: boolean;
  schemeOrder: string[];
  currentSchemeId: string | null;
  activeSchemeIds: string[];
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
  /** Confirmed eliminations retained for challenge detection and final recap. */
  eliminations: EliminationRecord[];
};

export type TrackerAction =
  | {
      type: 'teams';
      teams: string[][];
      mode?: 'two-headed-giant' | 'archenemy-commander' | 'emperor';
      schemeOrder?: string[];
      emperorIds?: string[];
    }
  | { type: 'scheme' }
  | { type: 'abandonScheme'; schemeId: string }
  | { type: 'starSeats'; order: string[] }
  | { type: 'assassinContracts'; order: string[] }
  | { type: 'assassinReady' }
  | { type: 'assassinate'; victimId: string; killerId: string | null }
  | { type: 'treacheryIdentities'; deal: TreacheryDeal[] }
  | { type: 'treacheryReady' }
  | { type: 'unveilTreachery'; playerId: string }
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
      minimumLife: STARTING_LIFE,
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
    teams: null,
    teamMode: null,
    archenemyId: null,
    emperorIds: [],
    starOrder: [],
    assassinTargets: {},
    assassinScores: {},
    assassinContractsReady: false,
    treacheryRoles: {},
    treacheryIdentities: {},
    treacheryUnveiled: [],
    treacheryRolesReady: false,
    schemeOrder: [],
    currentSchemeId: null,
    activeSchemeIds: [],
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
    eliminations: [],
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
  next.eliminations ??= [];
  next.teamMode ??= null;
  next.archenemyId ??= null;
  next.emperorIds ??= [];
  next.starOrder ??= [];
  next.assassinTargets ??= {};
  next.assassinScores ??= {};
  next.assassinContractsReady ??= false;
  next.treacheryRoles ??= {};
  next.treacheryIdentities ??= {};
  next.treacheryUnveiled ??= [];
  next.treacheryRolesReady ??= false;
  next.schemeOrder ??= [];
  next.currentSchemeId ??= null;
  next.activeSchemeIds ??= [];
  switch (action.type) {
    case 'assassinContracts': {
      if (
        action.order.length < 3 ||
        action.order.length !== next.players.length ||
        new Set(action.order).size !== next.players.length ||
        action.order.some(
          (id) => !next.players.some((player) => player.id === id),
        )
      ) {
        break;
      }
      next.assassinTargets = assassinTargets(action.order);
      next.assassinScores = Object.fromEntries(
        action.order.map((id) => [id, 0]),
      );
      next.assassinContractsReady = false;
      break;
    }
    case 'assassinReady':
      if (Object.keys(next.assassinTargets).length === next.players.length) {
        next.assassinContractsReady = true;
      }
      break;
    case 'assassinate': {
      const victim = playerById(next, action.victimId);
      if (!victim.eliminated) {
        eliminateAssassinPlayer(next, victim, action.killerId, now);
      }
      break;
    }
    case 'treacheryIdentities': {
      if (!dealSeatsEveryPlayer(next, action.deal)) {
        break;
      }
      next.treacheryRoles = Object.fromEntries(
        action.deal.map((row) => [row.playerId, row.role]),
      );
      next.treacheryIdentities = Object.fromEntries(
        action.deal.map((row) => [row.playerId, row.identityId]),
      );
      next.treacheryUnveiled = [];
      next.treacheryRolesReady = false;
      break;
    }
    case 'treacheryReady':
      if (Object.keys(next.treacheryRoles).length === next.players.length) {
        next.treacheryRolesReady = true;
      }
      break;
    case 'unveilTreachery':
      if (
        next.treacheryIdentities[action.playerId] !== undefined &&
        !next.treacheryUnveiled.includes(action.playerId)
      ) {
        next.treacheryUnveiled.push(action.playerId);
      }
      break;
    case 'starSeats': {
      if (
        next.players.length !== STAR_PLAYER_COUNT ||
        action.order.length !== STAR_PLAYER_COUNT ||
        new Set(action.order).size !== STAR_PLAYER_COUNT ||
        action.order.some(
          (id) => !next.players.some((player) => player.id === id),
        )
      ) {
        break;
      }
      next.starOrder = [...action.order];
      next.players.sort(
        (left, right) =>
          action.order.indexOf(left.id) - action.order.indexOf(right.id),
      );
      break;
    }
    case 'teams': {
      const ids = action.teams.flat();
      const mode = action.mode ?? 'two-headed-giant';
      const validSizes =
        mode === 'archenemy-commander'
          ? action.teams.length === 2 &&
            action.teams[0]?.length === 1 &&
            action.teams[1]?.length === 3
          : mode === 'emperor'
            ? action.teams.length === 2 &&
              action.teams.every((team) => team.length === 3) &&
              action.emperorIds?.length === 2 &&
              action.teams.every(
                (team, index) =>
                  action.emperorIds?.[index] !== undefined &&
                  team.includes(action.emperorIds[index]!),
              )
          : action.teams.length === 2 &&
            action.teams.every((team) => team.length === 2);
      const expectedPlayers = mode === 'emperor' ? 6 : 4;
      if (
        !validSizes ||
        new Set(ids).size !== expectedPlayers ||
        ids.some((id) => !next.players.some((player) => player.id === id))
      ) {
        break;
      }
      next.teams = action.teams.map((team) => [...team]);
      next.teamMode = mode;
      next.archenemyId =
        mode === 'archenemy-commander' ? action.teams[0]?.[0] ?? null : null;
      next.emperorIds = mode === 'emperor' ? [...(action.emperorIds ?? [])] : [];
      next.schemeOrder =
        mode === 'archenemy-commander' ? [...(action.schemeOrder ?? [])] : [];
      next.currentSchemeId = null;
      next.activeSchemeIds = [];
      next.players.sort(
        (left, right) => ids.indexOf(left.id) - ids.indexOf(right.id),
      );
      if (mode !== 'emperor') {
        for (const player of next.players) {
          player.life = ARCHENEMY_STARTING_LIFE;
          player.minimumLife = ARCHENEMY_STARTING_LIFE;
        }
      }
      if (next.archenemyId) {
        next.firstPlayerId = next.archenemyId;
        next.startedAt = now;
        next.pausedAt = null;
        next.accumulatedPausedMs = 0;
      }
      break;
    }
    case 'scheme':
      if (
        next.teamMode === 'archenemy-commander' &&
        next.schemeOrder.length > 0
      ) {
        const schemeId = next.schemeOrder.shift();
        if (schemeId) {
          next.currentSchemeId = schemeId;
          if (schemeById(schemeId)?.ongoing) {
            next.activeSchemeIds.push(schemeId);
          } else {
            next.schemeOrder.push(schemeId);
          }
        }
      }
      break;
    case 'abandonScheme': {
      const active = next.activeSchemeIds.indexOf(action.schemeId);
      if (active >= 0) {
        next.activeSchemeIds.splice(active, 1);
        next.schemeOrder.push(action.schemeId);
      }
      break;
    }
    case 'life': {
      const player = playerById(next, action.playerId);
      setSharedLife(next, player.id, player.life + action.delta);
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
      setSharedLife(next, target.id, target.life - (nextDamage - current));
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
      if (Object.keys(next.assassinTargets).length > 0) {
        eliminateAssassinPlayer(next, player, null, now);
        break;
      }
      for (const member of playersEliminatedWith(next, player.id)) {
        if (!member.eliminated) {
          next.eliminations.push({
            playerId: member.id,
            cause: null,
            at: now,
          });
        }
        member.eliminated = true;
        member.pendingLoss = null;
      }
      break;
    }
    case 'confirmLoss': {
      const player = playerById(next, action.playerId);
      if (Object.keys(next.assassinTargets).length > 0) {
        eliminateAssassinPlayer(next, player, null, now);
        break;
      }
      const losingTeam = playersEliminatedWith(next, player.id);
      for (const member of losingTeam) {
        if (!member.eliminated) {
          next.eliminations.push({
            playerId: member.id,
            cause: member.id === player.id ? player.pendingLoss : null,
            at: now,
          });
        }
        member.eliminated = true;
        member.pendingLoss = null;
      }
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
  const aliveTeams = next.teams
    ? next.teams.filter((team) =>
        team.some((id) => !playerById(next, id).eliminated),
      )
    : [];
  const starWinner =
    next.starOrder.length === STAR_PLAYER_COUNT
      ? alive.find((player) =>
          starEnemies(next.starOrder, player.id).every(
            (id) => playerById(next, id).eliminated,
          ),
        )
      : undefined;
  const assassinSurvivor =
    Object.keys(next.assassinTargets).length > 0 && alive.length === 1
      ? alive[0]
      : undefined;
  if (!next.winnerId && assassinSurvivor) {
    next.assassinScores[assassinSurvivor.id] =
      (next.assassinScores[assassinSurvivor.id] ?? 0) + 1;
    const highest = Math.max(...Object.values(next.assassinScores));
    const leaders = next.players.filter(
      (player) => (next.assassinScores[player.id] ?? 0) === highest,
    );
    next.winnerId =
      leaders.find((player) => player.id === assassinSurvivor.id)?.id ??
      leaders[0]?.id ??
      assassinSurvivor.id;
    next.pausedAt = now;
  } else if (!next.winnerId && starWinner) {
    next.winnerId = starWinner.id;
    next.pausedAt = now;
  } else if (
    !next.winnerId &&
    ((next.teams && aliveTeams.length === 1) ||
      (!next.teams && alive.length === 1 && next.players.length > 1))
  ) {
    next.winnerId = next.teams
      ? next.teamMode === 'emperor'
        ? next.emperorIds.find((id) => !playerById(next, id).eliminated) ?? null
        : aliveTeams[0]?.[0] ?? null
      : alive[0]?.id ?? null;
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
    const team = state.teams?.find((row) => row.includes(player.id));
    const teamRepresentative =
      state.teamMode === 'emperor' || !team || team[0] === player.id;
    const active = activeLossCauses(state, player).filter(
      (cause) =>
        teamRepresentative ||
        (cause.type !== 'life' &&
          (state.teamMode !== 'two-headed-giant' || cause.type !== 'poison')),
    );
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

function activeLossCauses(
  state: TrackerState,
  player: TrackerPlayer,
): LossCause[] {
  const causes: LossCause[] = [];
  if (player.life <= 0) {
    causes.push({ type: 'life' });
  }
  const poison = state.teamMode === 'two-headed-giant'
    ? teamForPlayer(state, player.id).reduce(
        (total, member) => total + member.poison,
        0,
      )
    : player.poison;
  if (
    poison >=
    (state.teamMode === 'two-headed-giant'
      ? TWO_HEADED_GIANT_POISON_LIMIT
      : POISON_LIMIT)
  ) {
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
  const alive =
    state.teamMode === 'emperor'
      ? state.emperorIds
          .map((id) => state.players.find((row) => row.id === id))
          .filter((row): row is TrackerPlayer => Boolean(row && !row.eliminated))
      : state.teams
        ? state.teams
        .map((team) => team[0])
        .map((id) => state.players.find((row) => row.id === id))
        .filter((row): row is TrackerPlayer => Boolean(row && !row.eliminated))
        : state.players.filter((row) => !row.eliminated);
  const pick = alive[Math.floor(random() * alive.length)];
  if (!pick) {
    return state;
  }
  return applyTrackerAction(state, { type: 'first', playerId: pick.id }, now);
}

export function teamForPlayer(
  state: TrackerState,
  playerId: string,
): TrackerPlayer[] {
  const ids = state.teams?.find((team) => team.includes(playerId));
  return ids
    ? ids.map((id) => playerById(state, id))
    : [playerById(state, playerId)];
}

/**
 * A dealt table is only accepted when it seats every player exactly once, uses
 * the role mix Treachery prints for that size, and hands each player a distinct
 * identity card of the role they were dealt.
 */
function dealSeatsEveryPlayer(
  state: TrackerState,
  deal: TreacheryDeal[],
): boolean {
  const playerIds = new Set(deal.map((row) => row.playerId));
  if (
    deal.length !== state.players.length ||
    playerIds.size !== deal.length ||
    new Set(deal.map((row) => row.identityId)).size !== deal.length ||
    deal.some(
      (row) =>
        !state.players.some((player) => player.id === row.playerId) ||
        treacheryIdentityById(row.identityId)?.role !== row.role,
    )
  ) {
    return false;
  }
  let printed: Record<TreacheryRole, number>;
  try {
    printed = treacheryDistribution(treacheryRolesForSize(deal.length));
  } catch {
    return false;
  }
  const dealt = treacheryDistribution(deal.map((row) => row.role));
  return TREACHERY_ROLES.every((role) => dealt[role] === printed[role]);
}

/** The Leader is public, so the table starts on that seat. */
export function treacheryLeaderId(state: TrackerState): string | null {
  return (
    Object.entries(state.treacheryRoles ?? {}).find(
      ([, role]) => role === 'leader',
    )?.[0] ?? null
  );
}

function eliminateAssassinPlayer(
  state: TrackerState,
  victim: TrackerPlayer,
  killerId: string | null,
  now: number,
): void {
  const hunter = state.players.find(
    (player) =>
      !player.eliminated && state.assassinTargets[player.id] === victim.id,
  );
  const inheritedTarget = state.assassinTargets[victim.id];
  if (hunter && inheritedTarget && hunter.id !== victim.id) {
    state.assassinTargets[hunter.id] = inheritedTarget;
    if (killerId === hunter.id) {
      state.assassinScores[hunter.id] =
        (state.assassinScores[hunter.id] ?? 0) + 1;
    }
  }
  delete state.assassinTargets[victim.id];
  state.eliminations.push({
    playerId: victim.id,
    cause: victim.pendingLoss,
    at: now,
  });
  victim.eliminated = true;
  victim.pendingLoss = null;
}

function playersEliminatedWith(
  state: TrackerState,
  playerId: string,
): TrackerPlayer[] {
  if (
    state.teamMode === 'two-headed-giant' ||
    state.teamMode === 'archenemy-commander' ||
    (state.teamMode === 'emperor' && state.emperorIds.includes(playerId))
  ) {
    return teamForPlayer(state, playerId);
  }
  return [playerById(state, playerId)];
}

function setSharedLife(
  state: TrackerState,
  playerId: string,
  life: number,
): void {
  const players =
    state.teamMode === 'emperor'
      ? [playerById(state, playerId)]
      : teamForPlayer(state, playerId);
  for (const player of players) {
    player.life = life;
    player.minimumLife = Math.min(player.minimumLife ?? life, life);
  }
}

function playerById(state: TrackerState, id: string): TrackerPlayer {
  const player = state.players.find((row) => row.id === id);
  if (!player) {
    throw new Error('Unknown tracker player.');
  }
  return player;
}
