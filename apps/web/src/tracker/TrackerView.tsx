import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { createPortal } from 'react-dom';
import {
  Award,
  ArrowUpDown,
  BookOpen,
  Building2,
  Coins,
  Crosshair,
  Check,
  Crown,
  Delete,
  Dices,
  Eye,
  Gauge,
  Minus,
  MessageSquare,
  Moon,
  MoreHorizontal,
  Nut,
  LogOut,
  Pause,
  Play,
  Plus,
  Radiation,
  RotateCw,
  Shield,
  Shuffle,
  Sparkles,
  Skull,
  SlidersHorizontal,
  Star,
  Sun,
  Ticket,
  Trophy,
  Undo2,
  UserX,
  X,
  Zap,
} from 'lucide-react';
import {
  OFFICIAL_COMMANDER_CHALLENGES,
  treacheryIdentityById,
  usesCommanderRules,
  usesCommanderDamage,
  type ChallengeDetectionMode,
  type ChallengePack,
  type GameMode,
  type PublicTreacheryIdentity,
  type RulesFormat,
  resolveRulesFormat,
} from '@podyguard/shared';
import {
  applyTrackerAction,
  commanderById,
  createTracker,
  defaultCommanders,
  elapsedMs,
  emptySecondaryCounters,
  HIT_LIMIT,
  POISON_LIMIT,
  pickFirstPlayer,
  primaryCommanderId,
  STARTING_LIFE,
  startingLifeForMode,
  teamForPlayer,
  commanderOpponents,
  treacheryLeaderId,
  uniqueCompletedDungeonCount,
  worstCommanderDamage,
  type Commander,
  type TrackerSeed,
  type TrackerAction,
  type TrackerPlayer,
  type TrackerState,
  type SecondaryCounter,
} from './engine';
import { DUNGEON_COUNT } from './dungeons';
import {
  randomPlayerId,
  randomTwoHeadedTeam,
  schemeById,
  shuffleSchemeIds,
} from './archenemy';
import {
  randomEmperorTeams,
  randomEmperors,
  seatEmperorTeam,
} from './emperor';
import {
  randomStarOrder,
  swapStarSeats,
} from './star';
import { AllyArrows, allySeatPairs } from './ally-arrows';
import { dealAssassinContracts } from './assassin';
import { dealTreacheryIdentities } from './treachery';
import { planFirstPlayerReveal, type RevealHop } from './first-player-reveal';
import { DungeonTracker } from './DungeonTracker';
import { DiceToolsSheet } from './DiceToolsSheet';
import { ModeRulesSheet } from './ModeRulesSheet';
import { SchemeSheet } from './SchemeSheet';
import { AssassinTargetsSheet } from './AssassinTargetsSheet';
import { TreacheryRolesSheet } from './TreacheryRolesSheet';
import { useBoardLandscape, useOrientationLock } from './orientation';
import { useWakeLock } from './wake-lock';
import {
  detectAutomaticChallenges,
  detectedConfirmation,
} from './challenges';
import i18n from '../i18n';
import { assetUrl } from '../asset-url';
import { forgetActiveMatch } from '../active-match';
import { readStored, removeStored, writeStored } from '../device-storage';
import { useFeedback } from '../feedback/FeedbackContext';
import { seatColor } from '../match-config';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { DungeonIcon } from '../ui/DungeonIcon';
import { RingIcon } from '../ui/RingIcon';
import { ThemeToggle, setAppTheme } from '../ui/ThemeToggle';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import { cx } from '../ui/cx';

type Props = {
  storageKey: string;
  players: TrackerSeed[];
  /** When false, ignore stored snapshots so a reload is always a new game. */
  persist?: boolean;
  /**
   * Hands the screen back once the pod is done with it. A game that has been
   * called freezes the board, so without this the tracker would be a room with
   * no door.
   */
  onFinish: (winnerId: string, durationSeconds: number) => Promise<void>;
  /** Leaves the screen without ending or clearing the current game. */
  onQuit: () => void;
  challengeProgress?: Record<
    string,
    { points: number; completedChallengeIds: string[] }
  >;
  onChallengeComplete?: (
    challengeId: string,
    participantId: string,
    source: ChallengeDetectionMode,
    confirmed?: boolean,
  ) => Promise<boolean>;
  challengePack?: ChallengePack;
  gameMode?: GameMode;
  rulesFormat?: RulesFormat | null;
  /** Treachery's public Leader replaces the normal random starting seat. */
  startingPlayerId?: string;
  onCheckRole?: () => void;
  /**
   * True while the caller is showing that player their own identity card over
   * the board, so the phone can be turned upright for it.
   */
  roleCheckOpen?: boolean;
  revealedIdentities?: Record<string, PublicTreacheryIdentity>;
  /**
   * Deals the Treachery identities here and passes the tracker around, for a
   * pod playing on one device with no server to hand each player their own.
   */
  dealTreachery?: boolean;
};

/*
  Fixed to the dynamic viewport so mobile browser chrome cannot push the last
  card out of reach. The side padding honours landscape notch insets, which is
  the orientation a phone sits in on the table. When the OS will not lock
  landscape (every iPhone), the shell is rotated instead so the board still
  reads as a table layout.
*/
function boardScreenClass(
  forceRotate: boolean,
  bottom: 'tight' | 'roomy' = 'tight',
): string {
  return cx(
    'bg-deep-space fixed z-40 flex touch-manipulation flex-col overflow-hidden pt-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]',
    bottom === 'roomy'
      ? 'pb-[max(1.25rem,env(safe-area-inset-bottom))]'
      : 'pb-[max(0.5rem,env(safe-area-inset-bottom))]',
    forceRotate
      ? 'top-1/2 left-1/2 h-[100dvw] w-[100dvh] -translate-x-1/2 -translate-y-1/2 rotate-90'
      : 'inset-x-0 top-0 h-[100dvh]',
  );
}
/**
 * Pre-game setup screens: content on the left, actions in a right-hand column
 * in landscape (stacked under the content in portrait) so Confirm never falls
 * off the viewport and wide setups are not crushed. Cancel returns home.
 */
function PreGameScreen({
  children,
  actions,
  contentClassName = 'max-w-lg',
  onCancel,
}: {
  children: ReactNode;
  actions?: ReactNode;
  contentClassName?: string;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  /*
    Setup stays in the phone's natural orientation. Only the running life
    tracker locks or CSS-rotates into landscape.
  */
  return (
    <section className={boardScreenClass(false, 'roomy')}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 landscape:flex-row landscape:items-center landscape:justify-center landscape:gap-6 landscape:px-4">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain landscape:flex-none landscape:max-h-full">
          <div
            className={cx(
              'mx-auto flex min-h-full w-full flex-col justify-center py-1',
              contentClassName,
            )}
          >
            {children}
          </div>
        </div>
        {actions || onCancel ? (
          <div className="mx-auto flex w-full max-w-xs shrink-0 flex-col gap-3 pb-2 [&>button]:w-full landscape:mx-0 landscape:w-52 landscape:max-w-none landscape:self-center landscape:pb-0">
            {actions}
            {onCancel ? (
              <Button variant="glass" onClick={onCancel}>
                <LogOut size={16} aria-hidden />
                {t('common.cancel')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/*
  Every control sits on top of commander art, so it needs its own plate. A
  translucent wash lets the picture bleed through and costs the icons their
  contrast, so these stay near-opaque and mix the accent into the base colour
  instead of layering a tint over it. Both read correctly in either theme.
*/
const plate = 'bg-void/85';
const plateAccent =
  'bg-[color-mix(in_oklab,var(--color-neon)_18%,var(--color-void))]';

/*
  A designation a seat is holding is worth more than an accent: the icon fills
  with gold rather than only changing colour, which reads as lit up from across
  the table. It also frees the top line of the card, since a crown that glows
  under the thumb says the same thing a monarch badge did.
*/
const plateGold =
  'bg-[color-mix(in_oklab,var(--color-warning)_18%,var(--color-void))]';
const gilded =
  'border-warning/60 text-warning [&>svg]:fill-warning/35 shadow-[0_0_14px_-4px_var(--color-warning)]';

/* Art shows through more than text can survive on its own. */
const onArt = '[text-shadow:0_2px_14px_var(--color-void)]';

/*
  The draw for the starting seat. Lifting the lit card above its neighbours
  keeps the glow from being clipped by the card drawn next to it, and the seat
  grows a touch as it settles so the landing is felt as well as seen.
*/
const spotlightCard = 'z-20 border-neon';
const spotlightSweep = 'shadow-[0_0_0_3px_var(--color-neon),0_0_34px_-2px_var(--color-neon)]';
const spotlightLanded: Record<'flash' | 'hold', string> = {
  flash: 'first-player-flash scale-[1.02]',
  hold: 'first-player-hold scale-[1.02]',
};

/*
  The edge alone loses to commander art, so the whole seat lights up: a neon
  wash over the picture, under the controls, which is what makes the draw
  readable from the far side of the table.
*/
const spotlightWash =
  'pointer-events-none absolute inset-0 z-[5] rounded-xl bg-[radial-gradient(circle_at_50%_45%,color-mix(in_oklab,var(--color-neon)_34%,transparent),transparent_72%)]';

/*
  A knocked-out seat swaps its commander for the dagger-through-skull Vampiric
  Tutor art (Eternal Masters, Raymond Swanland), so a dead player reads as dead
  from across the table rather than only by the card being dimmed.
*/
const ELIMINATED_ART =
  'https://cards.scryfall.io/art_crop/front/e/7/e7e778ce-3f1e-4626-8f55-bba03970d91a.jpg?1783937590';

/**
 * Held upright the seats stack; laid flat they spread into columns, which keeps
 * every life counter about as tall as it is in portrait.
 */
function seatGridClass(count: number): string {
  if (count <= 2) {
    return 'grid-cols-1 landscape:grid-cols-2';
  }
  if (count === 3) {
    return 'grid-cols-1 landscape:grid-cols-3';
  }
  if (count === 4) {
    return 'grid-cols-1 landscape:grid-cols-2';
  }
  return 'grid-cols-2 landscape:grid-cols-3';
}

/**
 * Bottom seats slide toward the empty centre cell. The nudge is a share of the
 * seat's own width so a dial-sized gap (~5.5rem) stays open on every phone —
 * a fixed rem that looked right on a Pixel closed the gap on an SE.
 */
const bottomSeatNudge =
  'landscape:translate-x-[clamp(0rem,calc((100%-5.5rem)/2),7rem)]';
const bottomSeatNudgeLeft =
  'landscape:-translate-x-[clamp(0rem,calc((100%-5.5rem)/2),7rem)]';

/**
 * Where a seat lands on the board. Star keeps the circular table order so each
 * seat sits beside its two allies (empty bottom-centre holds the match dial):
 *
 *   4  0  1
 *   3  .  2
 *
 * Other five-player modes keep a simple fill with the fifth seat on the bottom
 * right, and nudge the bottom pair in toward the dial.
 */
function seatPlacementClass(
  count: number,
  index: number,
  layout: 'default' | 'star' = 'default',
): string {
  if (layout === 'star' && count === 5) {
    switch (index) {
      case 0:
        return 'landscape:col-start-2 landscape:row-start-1';
      case 1:
        return 'landscape:col-start-3 landscape:row-start-1';
      case 2:
        return cx(
          'landscape:col-start-3 landscape:row-start-2',
          bottomSeatNudgeLeft,
        );
      case 3:
        return cx(
          'landscape:col-start-1 landscape:row-start-2',
          bottomSeatNudge,
        );
      case 4:
        return 'landscape:col-start-1 landscape:row-start-1';
      default:
        return '';
    }
  }
  if (count === 5 && index === 3) {
    return bottomSeatNudge;
  }
  if (count === 5 && index === 4) {
    return cx('landscape:col-start-3', bottomSeatNudgeLeft);
  }
  return '';
}

/**
 * Seats on the far side of the phone (top of a landscape board) are rotated
 * so the player across the table can read their life total upright.
 */
function seatFacesAway(
  count: number,
  index: number,
  layout: 'default' | 'star' = 'default',
  options: { archenemy?: boolean; archenemyId?: string | null; playerId?: string } = {},
): boolean {
  if (options.archenemy) {
    return options.playerId === options.archenemyId;
  }
  if (count <= 3) {
    return false;
  }
  if (layout === 'star' && count === 5) {
    return index === 0 || index === 1 || index === 4;
  }
  if (count === 4) {
    return index < 2;
  }
  if (count === 5) {
    return index < 3;
  }
  return index < Math.ceil(count / 2);
}

function playerSeatFacesAway(
  players: Array<{ id: string }>,
  playerId: string,
  layout: 'default' | 'star',
  options: { archenemy?: boolean; archenemyId?: string | null } = {},
): boolean {
  const index = players.findIndex((player) => player.id === playerId);
  if (index < 0) {
    return false;
  }
  return seatFacesAway(players.length, index, layout, {
    ...options,
    playerId,
  });
}

/**
 * Full-screen seat sheets portaled to `document.body` sit outside the board
 * shell. Tag them with `board-landscape` under force-rotate so `landscape:`
 * utilities still fire, and flip 180° when the opening seat faces away.
 */
function seatFacingPortalClass(
  facesAway: boolean,
  forceRotate: boolean,
): string {
  return cx(
    forceRotate && 'board-landscape',
    facesAway && 'landscape:rotate-180',
  );
}

/**
 * Where the dial sits on the board. Most pods meet in the middle; five- and
 * six-player boards need it off that seam so it does not cover the chrome.
 */
function clockPositionClass(count: number): string {
  if (count === 5) {
    // Sit high in the empty bottom-centre cell so the ally arrow between the
    // bottom seats can clear underneath it.
    return 'top-1/2 left-1/2 landscape:top-[62%]';
  }
  if (count === 6) {
    return 'top-1/2 left-1/2 landscape:top-[56.5%]';
  }
  return 'top-1/2 left-1/2';
}

const starPositionClasses = [
  'top-0 left-1/2 -translate-x-1/2',
  'top-[30%] right-0',
  'bottom-0 right-[12%]',
  'bottom-0 left-[12%]',
  'top-[30%] left-0',
] as const;

/**
 * Clearance for the chrome row that runs into the match clock.
 *
 * Four seats laid flat form a two by two board, so the middle of the screen is
 * the inner corner of every card and the dial covers whatever sits there. Each
 * seat pushes the row that owns that corner clear of it. Five parks the dial in
 * the empty bottom-centre cell; six keeps it on the seam and clears both rows.
 * Held upright the seats stack into one column and the corner is nowhere near
 * the middle, so the clearance is landscape-only.
 */
function clockClearance(
  count: number,
  index: number,
  row: 'top' | 'bottom',
  layout: 'default' | 'star' = 'default',
): string {
  if (count === 4) {
    // The two seats along the top of the board meet the dial with their bottom
    // corners, the two along the bottom with their top ones.
    const meets = index < 2 ? 'bottom' : 'top';
    if (row !== meets) {
      return '';
    }
    // Left-hand seats meet it on their right, right-hand seats on their left.
    return index % 2 === 0 ? 'landscape:pr-7' : 'landscape:pl-7';
  }
  if (count === 5) {
    // Bottom pair flanks the dial: Star uses seats 3 and 2, other modes 3 and 4.
    const left = 3;
    const right = layout === 'star' ? 2 : 4;
    if (row !== 'top' || (index !== left && index !== right)) {
      return '';
    }
    return index === left ? 'landscape:pr-7' : 'landscape:pl-7';
  }
  if (count === 6) {
    // Dial sits on the seam: top seats meet it with their bottom chrome, bottom
    // seats with their top chrome. The middle column needs the widest shove.
    const topRow = index < 3;
    const meets = topRow ? 'bottom' : 'top';
    if (row !== meets) {
      return '';
    }
    const column = index % 3;
    if (column === 0) {
      return 'landscape:pr-0';
    }
    if (column === 1) {
      return 'landscape:px-0';
    }
    return 'landscape:pl-0';
  }
  return '';
}

/*
  The skull has no element until a seat is actually knocked out, so it is
  fetched up front and the swap never waits on the network. The reference
  outlives the effect because a decoded bitmap belongs to its image element,
  and a throwaway object lets the browser drop bitmap and cache entry at once.
*/
let warmEliminatedArt: HTMLImageElement | null = null;

function usePreloadedEliminatedArt(): void {
  useEffect(() => {
    if (warmEliminatedArt) {
      return;
    }
    const image = new Image();
    image.src = ELIMINATED_ART;
    warmEliminatedArt = image;
    void image.decode().catch(() => undefined);
  }, []);
}

export function TrackerView({
  storageKey,
  players,
  persist = true,
  onFinish,
  onQuit,
  challengeProgress = {},
  onChallengeComplete,
  challengePack = OFFICIAL_COMMANDER_CHALLENGES,
  gameMode = 'commander',
  rulesFormat: rulesFormatProp = null,
  startingPlayerId,
  onCheckRole,
  roleCheckOpen = false,
  revealedIdentities = {},
  dealTreachery = false,
}: Props) {
  const { t } = useTranslation();
  const rulesFormat = resolveRulesFormat(gameMode, rulesFormatProp);
  const initial = useMemo<TrackerHistory>(
    () => ({
      present: restore(
        storageKey,
        players,
        persist,
        startingLifeForMode(gameMode, rulesFormat),
        gameMode,
        rulesFormat,
      ),
      past: [],
    }),
    [storageKey, players, persist, gameMode, rulesFormat],
  );
  const [{ present: state, past }, dispatch] = useReducer(
    reduceHistory,
    initial,
  );
  /*
    Consecutive life taps accumulate into a single flash under the total. Any
    other tracker action clears it, so the figure always describes the burst
    that just happened and not the whole game.
  */
  function send(message: Msg) {
    if (message.type === 'action' && message.action.type === 'life') {
      const { playerId, delta } = message.action;
      setLifeDelta((current) =>
        current?.playerId === playerId
          ? { playerId, amount: current.amount + delta }
          : { playerId, amount: delta },
      );
    } else {
      setLifeDelta(null);
    }
    dispatch(message);
  }
  const [dungeonPlayerId, setDungeonPlayerId] = useState<string | null>(null);
  const [commanderPlayerId, setCommanderPlayerId] = useState<string | null>(
    null,
  );
  const [counterPlayerId, setCounterPlayerId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [diceToolsOpen, setDiceToolsOpen] = useState(false);
  const [challengesOpen, setChallengesOpen] = useState(false);
  const [resultHidden, setResultHidden] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [challengeNotice, setChallengeNotice] = useState<string | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [challengeSaving, setChallengeSaving] = useState(0);
  const [publicIdentityPlayerId, setPublicIdentityPlayerId] = useState<
    string | null
  >(null);
  const [confirmationDismissed, setConfirmationDismissed] = useState(false);
  const [selectedAllies, setSelectedAllies] = useState<string[]>([]);
  const [selectedArchenemy, setSelectedArchenemy] = useState<string | null>(
    null,
  );
  const [selectedEmperorTeam, setSelectedEmperorTeam] = useState<string[]>([]);
  const [selectedEmperors, setSelectedEmperors] = useState<
    [string | null, string | null]
  >([null, null]);
  const [starOrder, setStarOrder] = useState(() =>
    state.players.map((player) => player.id),
  );
  const [selectedStarPlayer, setSelectedStarPlayer] = useState<string | null>(
    null,
  );
  const [assassinTargetsOpen, setAssassinTargetsOpen] = useState(false);
  const [assassinVictimId, setAssassinVictimId] = useState<string | null>(null);
  const [treacheryRolesOpen, setTreacheryRolesOpen] = useState(false);
  const [schemeOpen, setSchemeOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [lifeDelta, setLifeDelta] = useState<{
    playerId: string;
    amount: number;
  } | null>(null);
  const [lifeEntry, setLifeEntry] = useState<{
    playerId: string;
    sign: 1 | -1;
  } | null>(null);
  const attemptedChallenges = useRef(new Set<string>());
  const { landscape, forceRotate } = useBoardLandscape();
  const boardLive = Boolean(state.firstPlayerId);
  /*
    An identity is a portrait card scan held close to one player's face, so the
    phone comes back upright to read it and returns to the table on the way out.
  */
  const readingIdentity = treacheryRolesOpen || roleCheckOpen;
  useOrientationLock(
    boardLive ? (readingIdentity ? 'portrait' : 'landscape') : null,
  );
  useWakeLock(boardLive && !readingIdentity);
  const screenClass = cx(
    boardScreenClass(boardLive && forceRotate),
    boardLive && forceRotate && 'board-landscape',
  );
  usePreloadedEliminatedArt();
  const elapsed = useMatchClock(state);
  const spotlight = useFirstPlayerSpotlight(state, past.length);
  const winner = state.players.find((row) => row.id === state.winnerId) ?? null;
  const spotlightIds = new Set(
    spotlight.playerId
      ? state.teamMode === 'emperor'
        ? [spotlight.playerId]
        : teamForPlayer(state, spotlight.playerId).map((player) => player.id)
      : [],
  );
  const winnerIds = new Set(
    winner ? teamForPlayer(state, winner.id).map((player) => player.id) : [],
  );
  const winnerName = winner
    ? teamForPlayer(state, winner.id)
        .map((player) => player.name)
        .join(' & ')
    : null;
  const confirmation = detectedConfirmation(state, challengePack);
  const commanderRules = usesCommanderRules(gameMode, rulesFormat);
  const commanderDamageRules = usesCommanderDamage(gameMode, rulesFormat);
  const archenemyBoard =
    gameMode === 'archenemy-commander' &&
    state.teamMode === 'archenemy-commander';
  const emperorBoard = gameMode === 'emperor' && state.teamMode === 'emperor';
  const starBoard = gameMode === 'star' && state.starOrder.length === 5;
  const seatLayout = starBoard ? 'star' : 'default';
  const sharedLifeBoard =
    state.teamMode === 'two-headed-giant' ||
    state.teamMode === 'archenemy-commander';
  const allyPairs = useMemo(
    () => allySeatPairs(state, gameMode),
    [state, gameMode],
  );
  const boardRef = useRef<HTMLDivElement>(null);
  const currentScheme = state.currentSchemeId
    ? schemeById(state.currentSchemeId)
    : undefined;
  const assassinVictim = state.players.find(
    (player) => player.id === assassinVictimId,
  );
  const deviceTreachery = gameMode === 'treachery' && dealTreachery;
  const leaderId =
    gameMode === 'treachery'
      ? startingPlayerId ?? treacheryLeaderId(state)
      : null;
  const firstSeatId = startingPlayerId ?? leaderId ?? undefined;
  /*
    Identities the table has already seen: from the server for a hosted pod, and
    from this device for a pod that dealt its own.
  */
  const publicIdentities = useMemo(() => {
    const merged: Record<string, PublicTreacheryIdentity> = {
      ...revealedIdentities,
    };
    for (const playerId of state.treacheryUnveiled ?? []) {
      const identity = treacheryIdentityById(
        state.treacheryIdentities?.[playerId] ?? -1,
      );
      if (identity) {
        merged[playerId] = {
          id: identity.id,
          name: identity.name,
          role: identity.role,
          image: identity.image,
        };
      }
    }
    return merged;
  }, [revealedIdentities, state.treacheryIdentities, state.treacheryUnveiled]);

  useEffect(() => {
    if (!commanderRules || !onChallengeComplete) {
      return;
    }
    for (const detected of detectAutomaticChallenges(state, challengePack)) {
      const key = `${detected.participantId}:${detected.challenge.id}`;
      const completed =
        challengeProgress?.[detected.participantId]?.completedChallengeIds.includes(
          detected.challenge.id,
        ) ?? false;
      if (completed || attemptedChallenges.current.has(key)) {
        continue;
      }
      attemptedChallenges.current.add(key);
      setChallengeSaving((count) => count + 1);
      void onChallengeComplete(
        detected.challenge.id,
        detected.participantId,
        'automatic',
      )
        .then((created) => {
          if (created) {
            setChallengeNotice(`${detected.challenge.name} completed`);
          }
        })
        .catch((caught: unknown) => {
          attemptedChallenges.current.delete(key);
          setChallengeError(
            caught instanceof Error
              ? caught.message
              : t('common.errors.saveChallenge'),
          );
        })
        .finally(() => setChallengeSaving((count) => Math.max(0, count - 1)));
    }
  }, [challengePack, challengeProgress, commanderRules, onChallengeComplete, state, t]);

  useEffect(() => {
    if (!challengeNotice) {
      return;
    }
    const timer = window.setTimeout(() => setChallengeNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [challengeNotice]);

  /*
    Calling the game closes whatever sheet called it, so the result lands on the
    board it describes rather than behind a menu.
  */
  useEffect(() => {
    if (!state.winnerId) {
      setResultHidden(false);
      setConfirmationDismissed(false);
      return;
    }
    setMenuOpen(false);
    setDiceToolsOpen(false);
    setChallengesOpen(false);
    setCommanderPlayerId(null);
    setCounterPlayerId(null);
    setDungeonPlayerId(null);
    setSchemeOpen(false);
  }, [state.winnerId]);

  /*
    The snapshot is dropped on the way out: the next game at this table is a new
    one, and a finished board restored from storage would be frozen from its
    first frame.
  */
  async function finish() {
    if (!state.winnerId || finishing) {
      return;
    }
    setFinishing(true);
    setFinishError(null);
    try {
      await onFinish(state.winnerId, Math.floor(elapsed / 1000));
      removeStored(storageKey);
    } catch (caught) {
      setFinishError(
        caught instanceof Error ? caught.message : t('common.errors.submitResult'),
      );
      setFinishing(false);
    }
  }

  /** Abandon setup and leave the tracker; drop any half-built snapshot. */
  function leaveSetup() {
    removeStored(storageKey);
    forgetActiveMatch();
    onQuit();
  }

  // Day / night on the table drives the app chrome: day is light mode, night is dark.
  useEffect(() => {
    if (state.dayNight === 'day') {
      setAppTheme('light');
    } else if (state.dayNight === 'night') {
      setAppTheme('dark');
    }
  }, [state.dayNight]);

  useEffect(() => {
    if (!persist) {
      removeStored(storageKey);
      return;
    }
    writeStored(storageKey, JSON.stringify(state));
  }, [state, persist, storageKey]);
  const dungeonPlayer =
    state.players.find((row) => row.id === dungeonPlayerId) ?? null;
  const commanderPlayer =
    state.players.find((row) => row.id === commanderPlayerId) ?? null;
  const counterPlayer =
    state.players.find((row) => row.id === counterPlayerId) ?? null;

  useEffect(() => {
    if (
      !dungeonPlayer &&
      !commanderPlayer &&
      !counterPlayer &&
      !menuOpen &&
      !challengesOpen &&
      !schemeOpen &&
      !rulesOpen &&
      !assassinTargetsOpen &&
      !assassinVictimId &&
      !treacheryRolesOpen &&
      !lifeEntry
    ) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setDungeonPlayerId(null);
        setCommanderPlayerId(null);
        setCounterPlayerId(null);
        setMenuOpen(false);
        setChallengesOpen(false);
        setSchemeOpen(false);
        setRulesOpen(false);
        setAssassinTargetsOpen(false);
        setAssassinVictimId(null);
        setTreacheryRolesOpen(false);
        setLifeEntry(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [
    challengesOpen,
    assassinTargetsOpen,
    assassinVictimId,
    commanderPlayer,
    counterPlayer,
    dungeonPlayer,
    menuOpen,
    rulesOpen,
    schemeOpen,
    treacheryRolesOpen,
    lifeEntry,
  ]);

  const rulesSheet = rulesOpen
    ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('tracker.gameRules')}
          className="bg-void/70 fixed inset-0 z-[70] flex items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] backdrop-blur-md"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setRulesOpen(false);
            }
          }}
        >
          <ModeRulesSheet
            gameMode={gameMode}
            rulesFormat={rulesFormat}
            onClose={() => setRulesOpen(false)}
          />
        </div>,
        document.body,
      )
    : null;

  if (
    gameMode === 'assassin' &&
    Object.keys(state.assassinTargets).length === 0
  ) {
    return (
      <>
        <PreGameScreen
          onCancel={leaveSetup}
          actions={
            <>
              <Button variant="glass" onClick={() => setRulesOpen(true)}>
                <BookOpen size={16} aria-hidden />
                {t('tracker.readRules')}
              </Button>
              <Button
                variant="neon"
                onClick={() =>
                  send({
                    type: 'action',
                    action: {
                      type: 'assassinContracts',
                      order: dealAssassinContracts(
                        state.players.map((player) => player.id),
                      ),
                    },
                  })
                }
              >
                <Shuffle size={16} aria-hidden />
                {t('tracker.dealContracts')}
              </Button>
            </>
          }
        >
          <div className="text-center">
            <Crosshair size={34} aria-hidden className="text-danger mx-auto mb-3" />
            <h2 className="font-display mb-2 text-2xl font-bold">
              {t('tracker.dealContractsTitle')}
            </h2>
            <p className="text-muted text-sm">
              {t('tracker.dealContractsHint')}
            </p>
          </div>
        </PreGameScreen>
        {rulesSheet}
      </>
    );
  }

  if (gameMode === 'assassin' && !state.assassinContractsReady) {
    return (
      <PreGameScreen onCancel={leaveSetup} contentClassName="max-w-2xl">
        <AssassinTargetsSheet
          players={state.players}
          targets={state.assassinTargets}
          scores={state.assassinScores}
          requireAllReviewed
          onReady={() =>
            send({ type: 'action', action: { type: 'assassinReady' } })
          }
          onClose={() => undefined}
        />
      </PreGameScreen>
    );
  }

  if (deviceTreachery && Object.keys(state.treacheryRoles).length === 0) {
    return (
      <>
        <PreGameScreen
          onCancel={leaveSetup}
          actions={
            <>
              <Button variant="glass" onClick={() => setRulesOpen(true)}>
                <BookOpen size={16} aria-hidden />
                {t('tracker.readRules')}
              </Button>
              <Button
                variant="neon"
                onClick={() =>
                  send({
                    type: 'action',
                    action: {
                      type: 'treacheryIdentities',
                      deal: dealTreacheryIdentities(
                        state.players.map((player) => player.id),
                      ),
                    },
                  })
                }
              >
                <Shuffle size={16} aria-hidden />
                {t('tracker.dealIdentities')}
              </Button>
            </>
          }
        >
          <div className="text-center">
            <Shield size={34} aria-hidden className="text-plasma mx-auto mb-3" />
            <h2 className="font-display mb-2 text-2xl font-bold">
              {t('tracker.dealIdentitiesTitle')}
            </h2>
            <p className="text-muted text-sm">
              {t('tracker.dealIdentitiesHint')}
            </p>
          </div>
        </PreGameScreen>
        {rulesSheet}
      </>
    );
  }

  if (deviceTreachery && !state.treacheryRolesReady) {
    return (
      <PreGameScreen onCancel={leaveSetup} contentClassName="max-w-2xl">
        <TreacheryRolesSheet
          players={state.players}
          roles={state.treacheryRoles}
          identities={state.treacheryIdentities}
          unveiled={state.treacheryUnveiled}
          requireAllReviewed
          onReady={() =>
            send({ type: 'action', action: { type: 'treacheryReady' } })
          }
          onClose={() => undefined}
        />
      </PreGameScreen>
    );
  }

  if (
    gameMode === 'star' &&
    state.players.length === 5 &&
    state.starOrder.length === 0
  ) {
    return (
      <>
        <PreGameScreen
          onCancel={leaveSetup}
          contentClassName="max-w-xl"
          actions={
            <>
              <p className="text-muted hidden text-center text-sm landscape:block">
                {t('tracker.starPositionsHint')}
              </p>
              <Button
                variant="glass"
                onClick={() => {
                  setStarOrder(
                    randomStarOrder(
                      state.players.map((player) => player.id),
                    ),
                  );
                  setSelectedStarPlayer(null);
                }}
              >
                <Shuffle size={16} aria-hidden />
                {t('tracker.randomPositions')}
              </Button>
              <Button variant="glass" onClick={() => setRulesOpen(true)}>
                <BookOpen size={16} aria-hidden />
                {t('tracker.readRules')}
              </Button>
              <Button
                variant="neon"
                onClick={() =>
                  send({
                    type: 'action',
                    action: { type: 'starSeats', order: starOrder },
                  })
                }
              >
                {t('tracker.confirmPositions')}
              </Button>
            </>
          }
        >
          <h2 className="font-display mb-2 text-center text-2xl font-bold">
            {t('tracker.chooseStarPositions')}
          </h2>
          <p className="text-muted mb-3 text-center text-sm landscape:hidden">
            {t('tracker.starPositionsHint')}
          </p>
          <div className="relative mx-auto aspect-square w-full max-w-[min(22rem,70dvh)] landscape:max-w-[min(24rem,78dvh)]">
            <svg
              aria-hidden
              viewBox="0 0 100 100"
              className="text-neon/30 absolute inset-[12%] h-[76%] w-[76%]"
            >
              <polygon
                points="50,3 79,94 3,37 97,37 21,94"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
            {starOrder.map((playerId, index) => {
              const player = state.players.find(
                (row) => row.id === playerId,
              );
              return (
                <button
                  key={playerId}
                  type="button"
                  onClick={() => {
                    if (!selectedStarPlayer) {
                      setSelectedStarPlayer(playerId);
                    } else if (selectedStarPlayer === playerId) {
                      setSelectedStarPlayer(null);
                    } else {
                      setStarOrder((current) =>
                        swapStarSeats(
                          current,
                          selectedStarPlayer,
                          playerId,
                        ),
                      );
                      setSelectedStarPlayer(null);
                    }
                  }}
                  className={cx(
                    'absolute z-10 flex h-14 w-24 items-center justify-center rounded-xl border px-2 text-center text-xs font-semibold shadow-lg transition',
                    starPositionClasses[index],
                    selectedStarPlayer === playerId
                      ? 'border-warning bg-warning/20 text-warning'
                      : 'border-neon/40 bg-void/95 text-ink',
                  )}
                >
                  <SeatLabel
                    index={playerSeatIndex(state.players, playerId)}
                    name={player?.name ?? playerId}
                  />
                </button>
              );
            })}
            <p className="text-muted absolute top-1/2 left-1/2 w-24 -translate-x-1/2 -translate-y-1/2 text-center text-[0.65rem] font-semibold tracking-wide uppercase whitespace-pre-line">
              {t('tracker.adjacentPlayersAlly')}
            </p>
          </div>
        </PreGameScreen>
        {rulesSheet}
      </>
    );
  }

  if (gameMode === 'emperor' && state.players.length === 6 && !state.teams) {
    const otherTeam = state.players.filter(
      (player) => !selectedEmperorTeam.includes(player.id),
    );
    const teamsReady = selectedEmperorTeam.length === 3;
    const teams: [string[], string[]] = [
      selectedEmperorTeam,
      otherTeam.map((player) => player.id),
    ];
    const emperorsReady =
      teamsReady &&
      selectedEmperors.every(
        (emperorId, index) =>
          emperorId !== null && Boolean(teams[index]?.includes(emperorId)),
      );
    const setEmperor = (teamIndex: 0 | 1, playerId: string) => {
      setSelectedEmperors((current) => {
        const next: [string | null, string | null] = [...current];
        next[teamIndex] = playerId;
        return next;
      });
    };
    return (
      <>
        <PreGameScreen
          onCancel={leaveSetup}
          contentClassName="max-w-2xl"
          actions={
            teamsReady ? (
              <>
                <Button
                  variant="glass"
                  onClick={() => setSelectedEmperors(randomEmperors(teams))}
                >
                  <Crown size={16} aria-hidden />
                  {t('tracker.randomEmperors')}
                </Button>
                <Button variant="glass" onClick={() => setRulesOpen(true)}>
                  <BookOpen size={16} aria-hidden />
                  {t('tracker.readRules')}
                </Button>
                <Button
                  variant="neon"
                  disabled={!emperorsReady}
                  onClick={() => {
                    if (!selectedEmperors[0] || !selectedEmperors[1]) {
                      return;
                    }
                    send({
                      type: 'action',
                      action: {
                        type: 'teams',
                        mode: 'emperor',
                        teams: [
                          seatEmperorTeam(teams[0], selectedEmperors[0]),
                          seatEmperorTeam(teams[1], selectedEmperors[1]),
                        ],
                        emperorIds: [
                          selectedEmperors[0],
                          selectedEmperors[1],
                        ],
                      },
                    });
                  }}
                >
                  {t('tracker.confirmTeams')}
                </Button>
              </>
            ) : (
              <Button variant="glass" onClick={() => setRulesOpen(true)}>
                <BookOpen size={16} aria-hidden />
                {t('tracker.readRules')}
              </Button>
            )
          }
        >
          <h2 className="font-display mb-2 text-center text-2xl font-bold">
            {t('tracker.buildEmperorTeams')}
          </h2>
          <p className="text-muted mb-4 text-center text-sm">
            {t('tracker.chooseTeamA')}
          </p>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {state.players.map((player, index) => {
              const teamA = selectedEmperorTeam.includes(player.id);
              return (
                <button
                  key={player.id}
                  type="button"
                  disabled={!teamA && selectedEmperorTeam.length >= 3}
                  onClick={() => {
                    setSelectedEmperorTeam((current) =>
                      current.includes(player.id)
                        ? current.filter((id) => id !== player.id)
                        : [...current, player.id],
                    );
                    setSelectedEmperors([null, null]);
                  }}
                  className={cx(
                    'rounded-xl border p-3 text-center text-sm font-semibold transition',
                    teamA
                      ? 'border-neon bg-neon/15 text-neon'
                      : teamsReady
                        ? 'border-warning bg-warning/15 text-warning'
                        : 'border-muted/25 bg-void/70 text-ink',
                  )}
                >
                  <SeatLabel index={index} name={player.name} />
                </button>
              );
            })}
          </div>
          <div className="mb-4 flex flex-wrap justify-center gap-2">
            <Button
              size="sm"
              variant="glass"
              onClick={() => {
                const [teamA] = randomEmperorTeams(
                  state.players.map((player) => player.id),
                );
                setSelectedEmperorTeam(teamA);
                setSelectedEmperors([null, null]);
              }}
            >
              <Shuffle size={15} aria-hidden />
              {t('tracker.randomTeams')}
            </Button>
            <Button
              size="sm"
              variant="glass"
              disabled={selectedEmperorTeam.length === 0}
              onClick={() => {
                setSelectedEmperorTeam([]);
                setSelectedEmperors([null, null]);
              }}
            >
              {t('tracker.resetTeams')}
            </Button>
          </div>
          {teamsReady ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {teams.map((team, teamIndex) => (
                <fieldset
                  key={teamIndex}
                  className="border-muted/20 rounded-xl border p-3"
                >
                  <legend className="text-muted px-1 text-xs font-bold tracking-wide uppercase">
                    {t('tracker.teamEmperor', {
                      team: teamIndex === 0 ? 'A' : 'B',
                    })}
                  </legend>
                  <div className="grid grid-cols-3 gap-2">
                    {team.map((playerId) => {
                      const seat = state.players.find(
                        (player) => player.id === playerId,
                      );
                      return (
                        <button
                          key={playerId}
                          type="button"
                          onClick={() =>
                            setEmperor(teamIndex as 0 | 1, playerId)
                          }
                          className={cx(
                            'rounded-lg border p-2 text-xs font-semibold transition',
                            selectedEmperors[teamIndex] === playerId
                              ? 'border-warning bg-warning/15 text-warning'
                              : 'border-muted/25 bg-void/70 text-ink',
                          )}
                        >
                          <SeatLabel
                            index={playerSeatIndex(state.players, playerId)}
                            name={seat?.name ?? playerId}
                          />
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          ) : null}
        </PreGameScreen>
        {rulesSheet}
      </>
    );
  }

  if (
    gameMode === 'archenemy-commander' &&
    state.players.length === 4 &&
    !state.teams
  ) {
    return (
      <>
        <PreGameScreen
          onCancel={leaveSetup}
          actions={
            <>
              <Button variant="glass" onClick={() => setRulesOpen(true)}>
                <BookOpen size={16} aria-hidden />
                {t('tracker.readRules')}
              </Button>
              <Button
                variant="glass"
                onClick={() =>
                  setSelectedArchenemy(
                    randomPlayerId(state.players.map((player) => player.id)) ??
                      null,
                  )
                }
              >
                <Shuffle size={16} aria-hidden />
                {t('common.random')}
              </Button>
              <Button
                variant="neon"
                disabled={!selectedArchenemy}
                onClick={() => {
                  if (!selectedArchenemy) {
                    return;
                  }
                  send({
                    type: 'action',
                    action: {
                      type: 'teams',
                      mode: 'archenemy-commander',
                      teams: [
                        [selectedArchenemy],
                        state.players
                          .filter((player) => player.id !== selectedArchenemy)
                          .map((player) => player.id),
                      ],
                      schemeOrder: shuffleSchemeIds(),
                    },
                  });
                }}
              >
                {t('tracker.confirmArchenemy')}
              </Button>
            </>
          }
        >
          <h2 className="font-display mb-2 text-center text-2xl font-bold">
            {t('tracker.chooseArchenemy')}
          </h2>
          <p className="text-muted mb-5 text-center text-sm">
            {t('tracker.chooseArchenemyHint')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {state.players.map((player, index) => (
              <button
                key={player.id}
                type="button"
                onClick={() => setSelectedArchenemy(player.id)}
                className={cx(
                  'rounded-xl border p-4 text-center font-semibold transition',
                  selectedArchenemy === player.id
                    ? 'border-warning bg-warning/15 text-warning'
                    : 'border-muted/25 bg-void/70 text-ink',
                )}
              >
                <SeatLabel index={index} name={player.name} />
              </button>
            ))}
          </div>
        </PreGameScreen>
        {rulesSheet}
      </>
    );
  }

  if (
    gameMode === 'two-headed-giant' &&
    state.players.length === 4 &&
    !state.teams
  ) {
    const remaining = state.players.filter(
      (player) => !selectedAllies.includes(player.id),
    );
    const teamsReady = selectedAllies.length === 2;
    return (
      <>
        <PreGameScreen
          onCancel={leaveSetup}
          actions={
            <>
              <Button variant="glass" onClick={() => setRulesOpen(true)}>
                <BookOpen size={16} aria-hidden />
                {t('tracker.readRules')}
              </Button>
              <Button
                variant="glass"
                onClick={() =>
                  setSelectedAllies(
                    randomTwoHeadedTeam(
                      state.players.map((player) => player.id),
                    ),
                  )
                }
              >
                <Shuffle size={16} aria-hidden />
                {t('common.random')}
              </Button>
              <Button
                variant="glass"
                disabled={selectedAllies.length === 0}
                onClick={() => setSelectedAllies([])}
              >
                {t('common.reset')}
              </Button>
              <Button
                variant="neon"
                disabled={!teamsReady}
                onClick={() =>
                  send({
                    type: 'action',
                    action: {
                      type: 'teams',
                      teams: [
                        selectedAllies,
                        remaining.map((player) => player.id),
                      ],
                    },
                  })
                }
              >
                {t('tracker.confirmTeams')}
              </Button>
            </>
          }
        >
          <h2 className="font-display mb-2 text-center text-2xl font-bold">
            {t('tracker.chooseAllies')}
          </h2>
          <p className="text-muted mb-5 text-center text-sm">
            {t('tracker.chooseAlliesHint')}
          </p>
          <div className="mb-5 grid grid-cols-2 gap-3">
            {state.players.map((player, index) => {
              const ally = selectedAllies.includes(player.id);
              return (
                <button
                  key={player.id}
                  type="button"
                  disabled={!ally && selectedAllies.length >= 2}
                  onClick={() =>
                    setSelectedAllies((current) =>
                      current.includes(player.id)
                        ? current.filter((id) => id !== player.id)
                        : [...current, player.id],
                    )
                  }
                  className={cx(
                    'rounded-xl border p-4 text-center font-semibold transition',
                    ally
                      ? 'border-neon bg-neon/15 text-neon'
                      : teamsReady
                        ? 'border-warning bg-warning/15 text-warning'
                        : 'border-muted/25 bg-void/70 text-ink',
                  )}
                >
                  <SeatLabel index={index} name={player.name} />
                </button>
              );
            })}
          </div>
          {teamsReady ? (
            <p className="text-muted text-center text-sm">
              <span className="text-neon">
                {selectedAllies
                  .map((id) => state.players.find((row) => row.id === id)?.name)
                  .join(' & ')}
              </span>{' '}
              {t('common.versus')}{' '}
              <span className="text-warning">
                {remaining.map((player) => player.name).join(' & ')}
              </span>
            </p>
          ) : null}
        </PreGameScreen>
        {rulesSheet}
      </>
    );
  }

  if (!state.firstPlayerId) {
    return (
      <>
        <PreGameScreen
          onCancel={leaveSetup}
          actions={
            <>
              <Button
                variant="glass"
                size="lg"
                className="h-16 min-w-40 text-xl landscape:h-12 landscape:min-w-0 landscape:text-base"
                onClick={() => setRulesOpen(true)}
              >
                <BookOpen size={20} aria-hidden />
                {t('tracker.readRules')}
              </Button>
              <Button
                variant="neon"
                size="lg"
                className="h-16 min-w-48 text-xl landscape:h-12 landscape:min-w-0 landscape:text-base"
                disabled={gameMode === 'treachery' && !firstSeatId}
                onClick={() => send({ type: 'first', playerId: firstSeatId })}
              >
                {gameMode === 'treachery' && !firstSeatId
                  ? t('tracker.loadingRoles')
                  : t('tracker.start')}
              </Button>
            </>
          }
        >
          <div className="text-center">
            <h2 className="font-display mb-2 text-2xl font-bold">
              {t('tracker.readyToBegin')}
            </h2>
            <p className="text-muted text-sm">
              {t('tracker.readyToBeginHint')}
            </p>
          </div>
        </PreGameScreen>
        {rulesSheet}
      </>
    );
  }

  return (
    /*
      A running game owns the viewport: the screen is exactly one phone tall and
      never scrolls, so the cards divide the full height.
    */
    <section className={screenClass}>
      {/* auto-rows-fr splits the leftover height evenly between the seats. */}
      <div
        ref={boardRef}
        className={cx(
          'relative grid min-h-0 flex-1 auto-rows-fr gap-2',
          archenemyBoard
            ? 'grid-cols-1 landscape:grid-cols-3'
            : seatGridClass(state.players.length),
        )}
      >
        {state.players.map((player, index) => {
          const facesAway = seatFacesAway(
            state.players.length,
            index,
            seatLayout,
            {
              archenemy: archenemyBoard,
              archenemyId: state.archenemyId,
              playerId: player.id,
            },
          );
          return (
          <article
            key={player.id}
            data-seat-id={player.id}
            className={cx(
              'border-muted/20 relative flex min-h-0 flex-col overflow-hidden rounded-xl border p-2 transition-transform duration-200',
              player.eliminated ? 'opacity-50' : 'bg-ink/[0.03]',
              archenemyBoard &&
                player.id === state.archenemyId &&
                'landscape:col-span-3',
              seatPlacementClass(state.players.length, index, seatLayout),
              spotlightIds.has(player.id) && spotlightCard,
              spotlightIds.has(player.id) &&
                (spotlight.phase === 'sweep'
                  ? spotlightSweep
                  : spotlightLanded[spotlight.phase]),
            )}
          >
            <div
              className={cx(
                'relative flex min-h-0 flex-1 flex-col',
                facesAway && 'landscape:rotate-180',
              )}
            >
            <CommanderArt
              commanders={player.commanders}
              eliminated={player.eliminated}
            />
            {spotlightIds.has(player.id) ? (
              <span aria-hidden className={spotlightWash} />
            ) : null}
            {emperorBoard && state.emperorIds.includes(player.id) ? (
              <span className="absolute top-2 right-2 z-20">
                <Badge tone="crown" title={t('tracker.emperorRange')}>
                  <Star size={12} aria-hidden />
                  <span className="sr-only">{t('tracker.emperor')}</span>
                </Badge>
              </span>
            ) : null}
            {leaderId === player.id ? (
              <span className="absolute top-2 right-2 z-20">
                <Badge tone="crown" title={t('tracker.leader')}>
                  <Star size={12} aria-hidden />
                  <span className="sr-only">{t('tracker.leader')}</span>
                </Badge>
              </span>
            ) : null}
            {gameMode === 'assassin' ? (
              <span className="absolute top-2 left-2 z-20">
                <Badge
                  tone="dev"
                  title={t('tracker.marks', {
                    count: state.assassinScores[player.id] ?? 0,
                  })}
                >
                  <Crosshair size={12} aria-hidden />
                  <span aria-hidden className="text-[0.65rem] font-semibold tabular-nums">
                    {state.assassinScores[player.id] ?? 0}
                  </span>
                  <span className="sr-only">
                    {t('tracker.marks', {
                      count: state.assassinScores[player.id] ?? 0,
                    })}
                  </span>
                </Badge>
              </span>
            ) : null}
            <div
              className={cx(
                'relative z-10 flex shrink-0 items-start justify-between gap-2',
                archenemyBoard
                  ? ''
                  : clockClearance(state.players.length, index, 'top', seatLayout),
              )}
            >
              {/*
                The counters take the top line, where the name used to sit. The
                commander art already says whose seat this is, and this is the
                first place the eye lands. It scrolls sideways rather than
                wrapping, so a hoard of counters can never push into the life
                total below.
              */}
              <span className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <CounterBadges
                  player={player}
                  disabled={Boolean(state.winnerId)}
                  hidePoison={sharedLifeBoard}
                  hideTax={!commanderRules}
                  onOpen={() => setCounterPlayerId(player.id)}
                />
              </span>
              <span className="flex shrink-0 flex-wrap justify-end gap-1">
                {emperorBoard && !state.emperorIds.includes(player.id) ? (
                  <Badge tone="idle" title={t('tracker.generalRange')}>
                    <span className="sr-only">{t('tracker.general')}</span>
                    G
                  </Badge>
                ) : null}
                {publicIdentities[player.id] ? (
                  <button
                    type="button"
                    className="border-warning/50 bg-warning/15 text-warning rounded-full border px-2 py-0.5 text-[0.65rem] font-bold"
                    onClick={() => setPublicIdentityPlayerId(player.id)}
                  >
                    {publicIdentities[player.id]?.name}
                  </button>
                ) : null}
                {winnerIds.has(player.id) ? (
                  <Badge tone="live">{t('tracker.winner')}</Badge>
                ) : null}
              </span>
            </div>

            {/*
              Life owns the card: it takes every pixel the rest leaves over.
              The buttons grow with the row up to their cap, and centring keeps
              them on the row's midline once the cap is reached instead of
              leaving them hanging from the top.
            */}
            {!sharedLifeBoard ? (
              <LifeRow
                life={player.life}
                flash={
                  lifeDelta?.playerId === player.id ? lifeDelta.amount : null
                }
                color={seatColor(index)}
                disabled={Boolean(state.winnerId)}
                onStep={(delta) =>
                  send({
                    type: 'action',
                    action: { type: 'life', playerId: player.id, delta },
                  })
                }
                onEnter={(sign) =>
                  setLifeEntry({ playerId: player.id, sign })
                }
              />
            ) : (
              <div className="min-h-0 flex-1" aria-hidden />
            )}

            {/*
              Laid flat there is width to spare and no height to waste, so the
              counters and the icon strip share a single row.
            */}
            <div
              className={cx(
                'relative z-10 flex shrink-0 flex-col landscape:flex-row landscape:items-center landscape:gap-2',
                archenemyBoard
                  ? ''
                  : clockClearance(
                      state.players.length,
                      index,
                      'bottom',
                      seatLayout,
                    ),
              )}
            >
              <div className="flex min-w-0 shrink-0 gap-1 overflow-x-auto [scrollbar-width:none] landscape:flex-1 [&::-webkit-scrollbar]:hidden">
                <IconButton
                  title={t('tracker.openCounters', { name: player.name })}
                  disabled={Boolean(state.winnerId)}
                  onClick={() => setCounterPlayerId(player.id)}
                >
                  <SlidersHorizontal size={18} aria-hidden />
                </IconButton>
                {!sharedLifeBoard && commanderDamageRules ? (
                  <CommanderDamageChip
                    state={state}
                    player={player}
                    disabled={Boolean(state.winnerId)}
                    onOpen={() => setCommanderPlayerId(player.id)}
                  />
                ) : null}
              </div>

              {/*
                Only the two toggles that are not counters, kept as a thin
                strip. Knocking a player out and naming a winner used to live
                here, a tap away from the life buttons, which made them easy to
                hit by accident and cost room the counters needed. Both are
                reached through the loss prompt instead.
              */}
              <div className="border-muted/15 mt-1.5 flex shrink-0 justify-end gap-1.5 border-t pt-1.5 landscape:mt-0 landscape:border-t-0 landscape:pt-0">
                <IconButton
                  title={
                    player.id === state.monarchId
                      ? t('tracker.isMonarch', { name: player.name })
                      : t('tracker.makeMonarch', { name: player.name })
                  }
                  active={player.id === state.monarchId}
                  disabled={Boolean(state.winnerId)}
                  onClick={() =>
                    send({
                      type: 'action',
                      action: { type: 'monarch', playerId: player.id },
                    })
                  }
                >
                  <Crown size={18} aria-hidden />
                </IconButton>
                <DungeonButton
                  name={player.name}
                  completed={uniqueCompletedDungeonCount(
                    state.completedDungeons?.[player.id],
                  )}
                  active={player.id === state.initiativeId}
                  disabled={Boolean(state.winnerId)}
                  onClick={() => setDungeonPlayerId(player.id)}
                />
                <IconButton
                  title={t('tracker.enduringStory', {
                    name: player.name,
                    has: t(
                      player.enduringStory ? 'tracker.has' : 'tracker.doesNotHave',
                    ),
                  })}
                  active={player.enduringStory}
                  disabled={Boolean(state.winnerId)}
                  onClick={() =>
                    send({
                      type: 'action',
                      action: {
                        type: 'designation',
                        playerId: player.id,
                        designation: 'enduringStory',
                        value: !player.enduringStory,
                      },
                    })
                  }
                >
                  <BookOpen size={18} aria-hidden />
                </IconButton>
                <IconButton
                  title={t('tracker.cityBlessing', {
                    name: player.name,
                    has: t(
                      player.cityBlessing ? 'tracker.has' : 'tracker.doesNotHave',
                    ),
                  })}
                  active={player.cityBlessing}
                  disabled={Boolean(state.winnerId)}
                  onClick={() =>
                    send({
                      type: 'action',
                      action: {
                        type: 'designation',
                        playerId: player.id,
                        designation: 'cityBlessing',
                        value: !player.cityBlessing,
                      },
                    })
                  }
                >
                  <Building2 size={18} aria-hidden />
                </IconButton>
              </div>
            </div>
            {player.pendingLoss ? (
              <div
                role="dialog"
                aria-modal="true"
                aria-label={t('tracker.didLose', { name: player.name })}
                className="bg-void/90 absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 overflow-auto rounded-xl p-4 text-center backdrop-blur-sm"
              >
                <p className="font-display text-base font-semibold">
                  {lossPrompt(player, state, t)}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      if (gameMode === 'assassin') {
                        setAssassinVictimId(player.id);
                        return;
                      }
                      send({
                        type: 'action',
                        action: { type: 'confirmLoss', playerId: player.id },
                      });
                    }}
                  >
                    {t('tracker.yesTheyLost')}
                  </Button>
                  <Button
                    size="sm"
                    variant="glass"
                    onClick={() =>
                      send({
                        type: 'action',
                        action: { type: 'declineLoss', playerId: player.id },
                      })
                    }
                  >
                    {t('tracker.noStillIn')}
                  </Button>
                </div>
              </div>
            ) : null}
            </div>
          </article>
          );
        })}
        <AllyArrows
          pairs={allyPairs}
          containerRef={boardRef}
          layoutKey={`${landscape ? 'l' : 'p'}:${forceRotate ? 'r' : 'n'}:${String(state.players.length)}`}
        />
        {/*
          A team's life reads like a single seat's: the total in the middle of
          the row with the buttons around it. It floats over the row rather than
          living in a card, so it is measured against the grid instead of the
          screen or it drifts down onto the seat controls.
        */}
        {sharedLifeBoard && state.teams
          ? state.teams.map((team, index) => {
              const first = state.players.find(
                (player) => player.id === team[0],
              );
              if (!first) {
                return null;
              }
              return (
                <div
                  key={team.join(':')}
                  className={cx(
                    'absolute left-1/2 z-20 flex w-[min(34rem,78vw)] -translate-x-1/2 -translate-y-[58%] flex-col items-stretch gap-0 px-1',
                    // Both sides shift toward the bottom of their row so the
                    // total clears the ally mark above (not mirrored about centre).
                    index === 0 ? 'top-[30%]' : 'top-[80%]',
                  )}
                >
                  <LifeRow
                    life={first.life}
                    flash={
                      lifeDelta?.playerId === first.id
                        ? lifeDelta.amount
                        : null
                    }
                    compact
                    colors={team.map((id) =>
                      seatColor(playerSeatIndex(state.players, id)),
                    )}
                    disabled={Boolean(state.winnerId)}
                    onStep={(delta) =>
                      send({
                        type: 'action',
                        action: {
                          type: 'life',
                          playerId: first.id,
                          delta,
                        },
                      })
                    }
                    onEnter={(sign) =>
                      setLifeEntry({ playerId: first.id, sign })
                    }
                  />
                  {/*
                    Shared poison and commander damage sit under the life total.
                    Poison only appears when the side has any; it sits to the
                    left and nudges the damage chip off centre.
                  */}
                  <div className="flex items-center justify-center gap-3 translate-x-1.5">
                    <CounterBadges
                      player={first}
                      disabled={Boolean(state.winnerId)}
                      onlyPoison
                      onOpen={() => setCounterPlayerId(first.id)}
                    />
                    {commanderDamageRules ? (
                      <CommanderDamageChip
                        state={state}
                        player={first}
                        disabled={Boolean(state.winnerId)}
                        onOpen={() => setCommanderPlayerId(first.id)}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })
          : null}
      </div>
      {/*
        The clock rides the seam between the seats, which is the one piece of
        the board no seat owns and the one place every player can reach. It is
        also the only match-wide control left on this screen, so it doubles as
        the way into the menu behind it.
      */}
      <button
        type="button"
        title={t('tracker.matchMenu')}
        aria-label={`${t('tracker.matchMenuElapsed', { clock: formatClock(elapsed) })}${state.pausedAt ? t('tracker.matchMenuPaused') : ''}${state.dayNight ? t('tracker.matchMenuDayNight', { phase: t(state.dayNight === 'day' ? 'tracker.day' : 'tracker.night') }) : ''}`}
        onClick={() => {
          setMenuOpen(true);
        }}
        className={cx(
          plate,
          'hover:border-neon/50 absolute z-20 flex size-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-full border font-mono shadow-[0_10px_30px_-8px_var(--color-void)] transition',
          clockPositionClass(state.players.length),
          state.pausedAt ? 'text-warning border-warning/50' : 'text-ink',
          state.pausedAt ? '' : dayNightRing(state.dayNight),
        )}
      >
        {/*
          Day and night are table-wide but had nowhere to show, since the menu
          that sets them is shut most of the game. The dial carries it instead:
          a sun or a moon washed in behind the digits, dim enough to read the
          time straight through. A negative layer keeps it above the plate and
          below the numbers.
        */}
        {state.dayNight ? (
          <span
            aria-hidden
            className="absolute inset-0 -z-10 flex items-center justify-center"
          >
            {state.dayNight === 'day' ? (
              <Sun
                size={46}
                className="text-warning/45 fill-warning/25"
                strokeWidth={1.5}
              />
            ) : (
              <Moon
                size={42}
                className="text-beam/50 fill-beam/30"
                strokeWidth={1.5}
              />
            )}
          </span>
        ) : null}
        <span className="text-sm leading-none font-bold tabular-nums">
          {formatClock(elapsed)}
        </span>
        {state.pausedAt ? (
          <Pause size={11} aria-hidden />
        ) : (
          <MoreHorizontal size={12} className="text-muted" aria-hidden />
        )}
      </button>
      {schemeOpen && currentScheme ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={currentScheme.name}
          className="bg-void/95 fixed inset-0 z-[75] flex items-center justify-center p-3 backdrop-blur-sm"
        >
          <SchemeSheet
            currentSchemeId={state.currentSchemeId}
            activeSchemeIds={state.activeSchemeIds}
            pastSchemeIds={state.pastSchemeIds}
            remaining={state.schemeOrder.length}
            disabled={Boolean(state.winnerId)}
            onNext={() =>
              send({ type: 'action', action: { type: 'scheme' } })
            }
            onAbandon={(schemeId) =>
              send({
                type: 'action',
                action: { type: 'abandonScheme', schemeId },
              })
            }
            onClose={() => setSchemeOpen(false)}
          />
        </div>
      ) : null}
      {lifeEntry
        ? createPortal(
            <LifeAmountPad
              sign={lifeEntry.sign}
              playerName={
                state.players.find((player) => player.id === lifeEntry.playerId)
                  ?.name ?? 'player'
              }
              facesAway={playerSeatFacesAway(
                state.players,
                lifeEntry.playerId,
                seatLayout,
                {
                  archenemy: archenemyBoard,
                  archenemyId: state.archenemyId,
                },
              )}
              forceRotate={forceRotate}
              onConfirm={(amount) => {
                send({
                  type: 'action',
                  action: {
                    type: 'life',
                    playerId: lifeEntry.playerId,
                    delta: lifeEntry.sign * amount,
                  },
                });
                setLifeEntry(null);
              }}
              onClose={() => setLifeEntry(null)}
            />,
            document.body,
          )
        : null}
      {/*
        Where the browser lets go of the orientation the board turns itself, so
        this only ever shows on a phone that refused — every iPhone, which has
        neither the lock nor the manifest's orientation. It cannot be tapped, so
        it never costs a life total, and it leaves the moment the phone turns.
      */}
      {landscape ? null : (
        <p className="text-muted bg-void/70 pointer-events-none absolute inset-x-0 bottom-1 z-30 mx-auto flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.65rem]">
          <RotateCw size={12} aria-hidden />
          {t('tracker.turnPhone')}
        </p>
      )}
      {/*
        A sheet leaves out the seat it belongs to, so one shared sheet had to
        drop a column and grow another whenever it changed player, and the art
        of the column that came back was decoded again. Every seat keeps its
        own sheet instead: nothing is ever unmounted, and opening one is only a
        z-index change. Closed sheets sit below the board, which is opaque, so
        they stay rendered and decoded out of sight. Columns are laid out the
        same in every sheet, so each crop is decoded once and shared.
      */}
      {commanderDamageRules
        ? state.players.map((seat) => {
        const open = commanderPlayerId === seat.id;
        const facesAway = playerSeatFacesAway(
          state.players,
          seat.id,
          seatLayout,
          {
            archenemy: archenemyBoard,
            archenemyId: state.archenemyId,
          },
        );
        return createPortal(
          <div
            role="dialog"
            aria-modal={open}
            aria-hidden={!open}
            inert={!open}
            aria-label={t('tracker.commanderDamageOn', { name: seat.name })}
            className={cx(
              'bg-void/95 fixed inset-x-0 top-0 flex h-[100dvh] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] backdrop-blur-sm',
              open ? 'z-50' : 'pointer-events-none z-30',
              seatFacingPortalClass(facesAway, forceRotate),
            )}
            onClick={(event) => {
              if (open && event.target === event.currentTarget) {
                setCommanderPlayerId(null);
              }
            }}
          >
            <CommanderSheet
              state={state}
              player={seat}
              disabled={Boolean(state.winnerId)}
              dispatch={(action) => send({ type: 'action', action })}
              onClose={() => setCommanderPlayerId(null)}
            />
          </div>,
          document.body,
          seat.id,
        );
      })
        : null}
      {counterPlayer
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t('tracker.countersFor', { name: counterPlayer.name })}
              className={cx(
                'bg-void/95 fixed inset-x-0 top-0 z-50 flex h-[100dvh] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] backdrop-blur-sm',
                seatFacingPortalClass(
                  playerSeatFacesAway(
                    state.players,
                    counterPlayer.id,
                    seatLayout,
                    {
                      archenemy: archenemyBoard,
                      archenemyId: state.archenemyId,
                    },
                  ),
                  forceRotate,
                ),
              )}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setCounterPlayerId(null);
                }
              }}
            >
              <CounterSheet
                player={counterPlayer}
                disabled={Boolean(state.winnerId)}
                includeCommanderTax={commanderRules}
                dispatch={(action) => send({ type: 'action', action })}
                onClose={() => setCounterPlayerId(null)}
              />
            </div>,
            document.body,
          )
        : null}
      {menuOpen
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t('tracker.matchMenu')}
              className="bg-void/95 fixed inset-x-0 top-0 z-50 flex h-[100dvh] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] backdrop-blur-sm"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setMenuOpen(false);
                }
              }}
            >
              <MatchMenu
                state={state}
                elapsed={elapsed}
                canUndo={past.length > 0}
                seatLayout={seatLayout}
                archenemyBoard={archenemyBoard}
                forceRotate={forceRotate}
                dispatch={(action) => send({ type: 'action', action })}
                onUndo={() => {
                  send({ type: 'undo' });
                }}
                onFinish={finish}
                onQuit={onQuit}
                onCheckRole={
                  deviceTreachery
                    ? () => setTreacheryRolesOpen(true)
                    : onCheckRole
                }
                onChallenges={
                  commanderRules && onChallengeComplete
                    ? () => {
                        setMenuOpen(false);
                        setChallengesOpen(true);
                      }
                    : undefined
                }
                onRules={() => {
                  setMenuOpen(false);
                  setRulesOpen(true);
                }}
                onDiceTools={() => {
                  setMenuOpen(false);
                  setDiceToolsOpen(true);
                }}
                onScheme={
                  archenemyBoard
                    ? () => {
                        setMenuOpen(false);
                        send({ type: 'action', action: { type: 'scheme' } });
                        setSchemeOpen(true);
                      }
                    : undefined
                }
                onTargets={
                  gameMode === 'assassin'
                    ? () => {
                        setMenuOpen(false);
                        setAssassinTargetsOpen(true);
                      }
                    : undefined
                }
                onPlayerLost={
                  gameMode === 'assassin'
                    ? (playerId) => {
                        setMenuOpen(false);
                        setAssassinVictimId(playerId);
                      }
                    : undefined
                }
                onClose={() => setMenuOpen(false)}
              />
            </div>,
            document.body,
          )
        : null}
      {diceToolsOpen
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t('tracker.diceTools')}
              className="bg-void/95 fixed inset-x-0 top-0 z-50 flex h-[100dvh] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] backdrop-blur-sm"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setDiceToolsOpen(false);
                }
              }}
            >
              <DiceToolsSheet onClose={() => setDiceToolsOpen(false)} />
            </div>,
            document.body,
          )
        : null}
      {rulesSheet}
      {assassinTargetsOpen
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t('tracker.secretContracts')}
              className="bg-void/95 fixed inset-x-0 top-0 z-[70] flex h-[100dvh] p-2 backdrop-blur-sm"
            >
              <AssassinTargetsSheet
                players={state.players}
                targets={state.assassinTargets}
                scores={state.assassinScores}
                onClose={() => setAssassinTargetsOpen(false)}
              />
            </div>,
            document.body,
          )
        : null}
      {treacheryRolesOpen
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t('tracker.secretIdentities')}
              className="bg-void/95 fixed inset-x-0 top-0 z-[70] flex h-[100dvh] p-2 backdrop-blur-sm"
            >
              <TreacheryRolesSheet
                players={state.players}
                roles={state.treacheryRoles}
                identities={state.treacheryIdentities}
                unveiled={state.treacheryUnveiled}
                onUnveil={(playerId) =>
                  send({
                    type: 'action',
                    action: { type: 'unveilTreachery', playerId },
                  })
                }
                onClose={() => setTreacheryRolesOpen(false)}
              />
            </div>,
            document.body,
          )
        : null}
      {assassinVictim
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t('tracker.whoEliminated', { name: assassinVictim.name })}
              className="bg-void/95 fixed inset-0 z-[75] flex items-center justify-center p-4 backdrop-blur-sm"
            >
              <section className="border-muted/25 bg-hull w-full max-w-md rounded-2xl border p-5 text-center">
                <Crosshair
                  size={28}
                  aria-hidden
                  className="text-danger mx-auto mb-2"
                />
                <h4 className="font-display mb-1 text-lg font-bold">
                  {t('tracker.whoEliminated', { name: assassinVictim.name })}
                </h4>
                <p className="text-muted mb-4 text-sm">
                  {t('tracker.whoEliminatedHint')}
                </p>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {state.players
                    .filter(
                      (player) =>
                        player.id !== assassinVictim.id && !player.eliminated,
                    )
                    .map((player) => (
                      <Button
                        key={player.id}
                        variant="glass"
                        onClick={() => {
                          send({
                            type: 'action',
                            action: {
                              type: 'assassinate',
                              victimId: assassinVictim.id,
                              killerId: player.id,
                            },
                          });
                          setAssassinVictimId(null);
                        }}
                      >
                        {player.name}
                      </Button>
                    ))}
                </div>
                <Button
                  variant="ghost"
                  onClick={() => {
                    send({
                      type: 'action',
                      action: {
                        type: 'assassinate',
                        victimId: assassinVictim.id,
                        killerId: null,
                      },
                    });
                    setAssassinVictimId(null);
                  }}
                >
                  {t('tracker.noPlayerUnknown')}
                </Button>
              </section>
            </div>,
            document.body,
          )
        : null}
      {publicIdentityPlayerId && publicIdentities[publicIdentityPlayerId]
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t('tracker.revealedIdentity')}
              className="bg-void/90 fixed inset-0 z-[80] flex items-center justify-center p-4 backdrop-blur-md"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setPublicIdentityPlayerId(null);
                }
              }}
            >
              <section className="relative max-h-full max-w-md">
                <img
                  src={assetUrl(publicIdentities[publicIdentityPlayerId].image)}
                  alt={publicIdentities[publicIdentityPlayerId].name}
                  className="max-h-[90dvh] max-w-full rounded-xl shadow-2xl"
                />
                <button
                  type="button"
                  aria-label={t('tracker.closeRevealedIdentity')}
                  className="bg-void/90 text-ink absolute top-2 right-2 flex size-9 items-center justify-center rounded-full"
                  onClick={() => setPublicIdentityPlayerId(null)}
                >
                  <X size={18} aria-hidden />
                </button>
              </section>
            </div>,
            document.body,
          )
        : null}
      {challengesOpen
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t('tracker.commanderChallenges')}
              className="bg-void/95 fixed inset-x-0 top-0 z-50 flex h-[100dvh] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] backdrop-blur-sm"
            >
              <ChallengeSheet
                pack={challengePack}
                players={state.players}
                progress={challengeProgress}
                onClaim={async (challengeId, participantId) => {
                  if (!onChallengeComplete) {
                    return;
                  }
                  setChallengeError(null);
                  try {
                    const created = await onChallengeComplete(
                      challengeId,
                      participantId,
                      'manual',
                    );
                    if (created) {
                      const challenge = challengePack.challenges.find(
                        (row) => row.id === challengeId,
                      );
                      setChallengeNotice(
                        t('tracker.challengeCompleted', {
                          name:
                            challenge?.name ?? t('tracker.challengeFallback'),
                        }),
                      );
                    }
                  } catch (caught) {
                    setChallengeError(
                      caught instanceof Error
                        ? caught.message
                        : t('common.errors.saveChallenge'),
                    );
                  }
                }}
                onClose={() => setChallengesOpen(false)}
              />
            </div>,
            document.body,
          )
        : null}
      {dungeonPlayer
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t('tracker.dungeonFor', { name: dungeonPlayer.name })}
              /*
                Height is what a dungeon card is short of, so the frame keeps
                only a hairline top and bottom. Width it has to spare, so the
                sides stay clear of a landscape notch.
              */
              className="bg-void/95 fixed inset-x-0 top-0 z-50 flex h-[100dvh] pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] backdrop-blur-sm"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setDungeonPlayerId(null);
                }
              }}
            >
              <DungeonTracker
                state={state}
                playerId={dungeonPlayer.id}
                dispatch={(action) => send({ type: 'action', action })}
                onClose={() => setDungeonPlayerId(null)}
              />
            </div>,
            document.body,
          )
        : null}
      {/*
        A called game answers every control with nothing, so the result is the
        one thing on screen that still does something: leave, or take the call
        back. The board stays visible around the card, because the pod usually
        wants a last look at the totals before the seats are cleared.
      */}
      {winner && !resultHidden
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={t('tracker.matchResult')}
              className="bg-void/70 fixed inset-x-0 top-0 z-[60] flex h-[100dvh] items-center justify-center p-3 backdrop-blur-sm"
            >
              <section className="border-warning/40 bg-hull/95 w-full max-w-xs rounded-2xl border p-4 text-center shadow-[0_18px_50px_-24px_var(--color-void)]">
                <Trophy
                  size={26}
                  aria-hidden
                  className="text-warning fill-warning/30 mx-auto mb-2"
                />
                <h2 className="font-display truncate text-lg leading-tight font-bold">
                  {t('tracker.wins', { name: winnerName })}
                </h2>
                <p className="text-muted mb-3 font-mono text-sm tabular-nums">
                  {formatClock(elapsed)}
                </p>
                {/*
                  The secret is only worth keeping while the game is live, and
                  the table always wants to know who was hunting whom.
                */}
                {deviceTreachery ? (
                  <ul className="border-muted/20 mb-3 space-y-1 rounded-xl border p-3 text-left text-xs">
                    {state.players.map((player) => {
                      const role = state.treacheryRoles?.[player.id];
                      return role ? (
                        <li
                          key={player.id}
                          className="flex items-baseline justify-between gap-2"
                        >
                          <span className="truncate">{player.name}</span>
                          <span className="shrink-0 font-semibold">
                            {t(`modes.treachery.roles.${role}.name`)}
                          </span>
                        </li>
                      ) : null;
                    })}
                  </ul>
                ) : null}
                {confirmation &&
                !(challengeProgress?.[confirmation.participantId]
                  ?.completedChallengeIds.includes(
                  confirmation.challenge.id,
                ) ?? false) &&
                !attemptedChallenges.current.has(
                  `${confirmation.participantId}:${confirmation.challenge.id}`,
                ) &&
                !confirmationDismissed ? (
                  <div className="border-warning/25 bg-warning/5 mb-3 rounded-xl border p-3">
                    <p className="mb-2 text-xs">
                      {confirmation.challenge.confirmationQuestion}
                    </p>
                    <div className="flex justify-center gap-2">
                      <Button
                        size="sm"
                        variant="neon"
                        onClick={() => {
                          const key = `${confirmation.participantId}:${confirmation.challenge.id}`;
                          attemptedChallenges.current.add(key);
                          setConfirmationDismissed(true);
                          setChallengeSaving((count) => count + 1);
                          void onChallengeComplete?.(
                            confirmation.challenge.id,
                            confirmation.participantId,
                            'confirmation',
                            true,
                          )
                            .then((created) => {
                              if (created) {
                                setChallengeNotice(
                                  t('tracker.challengeCompleted', {
                                    name: confirmation.challenge.name,
                                  }),
                                );
                              }
                            })
                            .catch((caught: unknown) => {
                              attemptedChallenges.current.delete(key);
                              setChallengeError(
                                caught instanceof Error
                                  ? caught.message
                                  : t('common.errors.saveChallenge'),
                              );
                            })
                            .finally(() =>
                              setChallengeSaving((count) =>
                                Math.max(0, count - 1),
                              ),
                            );
                        }}
                      >
                        {t('tracker.yes')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          attemptedChallenges.current.add(
                            `${confirmation.participantId}:${confirmation.challenge.id}`,
                          );
                          setConfirmationDismissed(true);
                        }}
                      >
                        {t('tracker.no')}
                      </Button>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    variant="neon"
                    size="sm"
                    disabled={finishing || challengeSaving > 0}
                    onClick={() => void finish()}
                  >
                    {finishing
                      ? t('common.submitting')
                      : challengeSaving > 0
                        ? t('tracker.savingChallenges')
                        : t('tracker.doneRequeue')}
                  </Button>
                  {past.length > 0 ? (
                    <Button
                      variant="glass"
                      size="sm"
                      onClick={() => {
                        send({ type: 'undo' });
                      }}
                    >
                      <Undo2 size={14} aria-hidden />
                      {t('tracker.undo')}
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setResultHidden(true)}
                  >
                    {t('tracker.reviewBoard')}
                  </Button>
                </div>
                {finishError ? (
                  <p className="text-danger mt-3 text-xs">{finishError}</p>
                ) : null}
                {challengeError ? (
                  <p className="text-danger mt-2 text-xs">{challengeError}</p>
                ) : null}
              </section>
            </div>,
            document.body,
          )
        : null}
      {challengeNotice ? (
        <p
          role="status"
          className="border-neon/40 bg-void/95 text-neon fixed top-[max(0.75rem,env(safe-area-inset-top))] left-1/2 z-[70] flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs shadow-lg"
        >
          <Sparkles size={13} aria-hidden />
          {challengeNotice}
        </p>
      ) : null}
    </section>
  );
}

/*
  Minutes are left to run past sixty rather than rolled into hours: a pod cares
  how long the game has gone, and "94:12" says that in the width the button has.
*/
export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
}

/** Warms the dial's rim to match whatever the sky behind it is doing. */
function dayNightRing(dayNight: TrackerState['dayNight']): string {
  if (dayNight === 'day') {
    return 'border-warning/50';
  }
  if (dayNight === 'night') {
    return 'border-beam/50';
  }
  return 'border-muted/25';
}

/** How long the landing strobe runs before the glow settles: three 150ms beats. */
const SPOTLIGHT_FLASH_MS = 450;

/**
 * Runs the draw for the starting seat and holds the result.
 *
 * The spotlight sweeps the board, strobes on the seat the engine drew, then
 * holds until the pod touches the screen (or any accepted action lands). The
 * first tap means the table has read it and the board has better uses for the
 * light. `moves` is the history depth, which is the cheapest signal that
 * something on the board actually changed.
 */
function useFirstPlayerSpotlight(
  state: TrackerState,
  moves: number,
): { playerId: string | null; phase: 'sweep' | 'flash' | 'hold' } {
  const [plan, setPlan] = useState<RevealHop[] | null>(null);
  const [hop, setHop] = useState(0);
  const [held, setHeld] = useState(false);
  /*
    A game restored from storage has already had its draw, and replaying the
    spin on every reload would be a lie about where the game stands. Only a
    board that starts under this mount earns the animation.
  */
  const drawn = useRef(Boolean(state.firstPlayerId));
  const movesAtDraw = useRef(moves);

  useEffect(() => {
    if (!state.firstPlayerId) {
      drawn.current = false;
      setPlan(null);
      setHop(0);
      setHeld(false);
      return;
    }
    if (drawn.current) {
      return;
    }
    drawn.current = true;
    movesAtDraw.current = moves;
    setHop(0);
    setHeld(false);
    setPlan(
      planFirstPlayerReveal(
        state.teamMode === 'emperor'
          ? state.emperorIds
          : state.teams
          ? state.teams.flatMap((team) => team[0] ?? [])
          : state.players.map((row) => row.id),
        state.firstPlayerId,
      ),
    );
  }, [
    moves,
    state.emperorIds,
    state.firstPlayerId,
    state.players,
    state.teamMode,
    state.teams,
  ]);

  useEffect(() => {
    const next = plan?.[hop + 1];
    if (!next) {
      return;
    }
    const timer = window.setTimeout(() => setHop(hop + 1), next.delayMs);
    return () => window.clearTimeout(timer);
  }, [hop, plan]);

  // The strobe is a one-shot, so the glow goes steady on its own clock rather
  // than waiting on the pod.
  const landed = plan !== null && hop === plan.length - 1;
  useEffect(() => {
    if (!landed) {
      return;
    }
    const timer = window.setTimeout(() => setHeld(true), SPOTLIGHT_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [landed]);

  // Any accepted action retires the spotlight, mid-spin included.
  useEffect(() => {
    if (plan && moves !== movesAtDraw.current) {
      setPlan(null);
    }
  }, [moves, plan]);

  // A bare touch or key also clears it — the table has seen the result.
  useEffect(() => {
    if (!plan) {
      return;
    }
    const dismiss = () => setPlan(null);
    window.addEventListener('pointerdown', dismiss, true);
    window.addEventListener('keydown', dismiss, true);
    return () => {
      window.removeEventListener('pointerdown', dismiss, true);
      window.removeEventListener('keydown', dismiss, true);
    };
  }, [plan]);

  return {
    playerId: plan?.[hop]?.playerId ?? null,
    phase: landed ? (held ? 'hold' : 'flash') : 'sweep',
  };
}

/** Ticks only while the clock is actually running, so a pause costs nothing. */
function useMatchClock(state: TrackerState): number {
  const [now, setNow] = useState(() => Date.now());
  const running = Boolean(state.firstPlayerId) && !state.pausedAt;
  useEffect(() => {
    if (!running) {
      return;
    }
    const id = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [running]);
  return elapsedMs(state, running ? now : Date.now());
}

/*
  Everything here belongs to the table rather than to a seat: the clock, the
  turn cycle's day and night, the walk-back, and calling the game. Anything that
  belongs to one player stays on that player's card, within their reach, which
  is why no counter or designation appears in here.
*/
function MatchMenu({
  state,
  elapsed,
  canUndo,
  seatLayout,
  archenemyBoard,
  forceRotate,
  dispatch,
  onUndo,
  onFinish,
  onQuit,
  onCheckRole,
  onChallenges,
  onRules,
  onDiceTools,
  onScheme,
  onTargets,
  onPlayerLost,
  onClose,
}: {
  state: TrackerState;
  elapsed: number;
  canUndo: boolean;
  seatLayout: 'default' | 'star';
  archenemyBoard: boolean;
  forceRotate: boolean;
  dispatch: (action: TrackerAction) => void;
  onUndo: () => void;
  onFinish: () => Promise<void>;
  onQuit: () => void;
  onCheckRole?: () => void;
  onChallenges?: () => void;
  onRules: () => void;
  onDiceTools: () => void;
  onScheme?: () => void;
  onTargets?: () => void;
  onPlayerLost?: (playerId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { openFeedback } = useFeedback();
  const [arrangeSeats, setArrangeSeats] = useState(false);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const paused = Boolean(state.pausedAt);
  const decided = Boolean(state.winnerId);
  const winner = state.players.find((row) => row.id === state.winnerId) ?? null;
  const menuWinnerTeam = winner ? teamForPlayer(state, winner.id) : [];
  const menuWinnerIds = new Set(menuWinnerTeam.map((player) => player.id));
  const menuWinnerName = menuWinnerTeam.map((player) => player.name).join(' & ');

  if (arrangeSeats) {
    return (
      <section className="flex h-full w-full flex-col">
        <header className="mb-1 flex shrink-0 items-center justify-between gap-3">
          <h4 className="font-display truncate text-sm leading-tight font-bold">
            {t('tracker.rearrangeSeats')}
          </h4>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={() => {
              setArrangeSeats(false);
              setSelectedSeatId(null);
            }}
            className="border-muted/25 text-muted hover:text-ink hover:border-muted/50 flex size-8 shrink-0 items-center justify-center rounded-full border transition"
          >
            <X size={18} aria-hidden />
          </button>
        </header>
        <p className="text-muted mb-2 shrink-0 text-center text-xs">
          {t('tracker.rearrangeSeatsHint')}
        </p>
        <div
          className={cx(
            'relative grid min-h-0 flex-1 auto-rows-fr gap-2',
            forceRotate && 'board-landscape',
            archenemyBoard
              ? 'grid-cols-1 landscape:grid-cols-3'
              : seatGridClass(state.players.length),
          )}
        >
          {state.players.map((seat, index) => {
            const color = seatColor(index);
            const selected = selectedSeatId === seat.id;
            const facesAway = seatFacesAway(
              state.players.length,
              index,
              seatLayout,
              {
                archenemy: archenemyBoard,
                archenemyId: state.archenemyId,
                playerId: seat.id,
              },
            );
            return (
              <button
                key={seat.id}
                type="button"
                onClick={() => {
                  if (!selectedSeatId) {
                    setSelectedSeatId(seat.id);
                    return;
                  }
                  if (selectedSeatId === seat.id) {
                    setSelectedSeatId(null);
                    return;
                  }
                  const order = swapStarSeats(
                    state.players.map((player) => player.id),
                    selectedSeatId,
                    seat.id,
                  );
                  dispatch({ type: 'reorderPlayers', order });
                  setSelectedSeatId(null);
                }}
                className={cx(
                  'relative flex min-h-0 flex-col items-center justify-center overflow-hidden rounded-xl border p-2 transition',
                  archenemyBoard &&
                    seat.id === state.archenemyId &&
                    'landscape:col-span-3',
                  seatPlacementClass(state.players.length, index, seatLayout),
                  selected
                    ? 'border-warning bg-warning/20 ring-warning/40 ring-2'
                    : 'border-muted/25 hover:border-muted/50',
                )}
                style={{
                  backgroundColor: selected ? undefined : `${color}28`,
                  boxShadow: selected
                    ? undefined
                    : `inset 0 0 0 1px ${color}66`,
                }}
              >
                <span
                  className={cx(
                    'flex max-w-full flex-col items-center gap-1.5',
                    facesAway && 'landscape:rotate-180',
                  )}
                >
                  <span
                    className="size-3.5 shrink-0 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <span className="font-display truncate text-sm font-bold">
                    {seat.name}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full w-full flex-col">
      <header className="mb-1 flex shrink-0 items-center justify-between gap-3">
        <h4 className="font-display truncate text-sm leading-tight font-bold">
          {t('tracker.match')}
        </h4>
        <div className="flex items-center gap-2">
          <LanguageSwitcher align="end" />
          <ThemeToggle />
          <button
            type="button"
            aria-label={t('tracker.closeMatchMenu')}
            onClick={onClose}
            className="border-muted/25 text-muted hover:text-ink hover:border-muted/50 flex size-8 shrink-0 items-center justify-center rounded-full border transition"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto">
        <p
          className={cx(
            'font-display text-[clamp(2rem,13vh,4rem)] leading-none font-bold tabular-nums',
            paused ? 'text-warning' : 'text-neon',
          )}
        >
          {formatClock(elapsed)}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {/*
            The Archenemy turns a scheme every turn, which makes this the most
            used control of that mode. It leads the menu rather than floating
            over the board, because the seats own every pixel out there.
          */}
          {onScheme ? (
            <Button
              size="sm"
              variant="neon"
              disabled={decided || state.schemeOrder.length === 0}
              onClick={onScheme}
            >
              <Sparkles size={14} aria-hidden />
              {state.currentSchemeId
                ? t('tracker.nextScheme')
                : t('tracker.firstScheme')}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={paused ? 'neon' : 'glass'}
            onClick={() => {
              dispatch({ type: 'pause' });
            }}
          >
            {paused ? (
              <Play size={14} aria-hidden />
            ) : (
              <Pause size={14} aria-hidden />
            )}
            {paused ? t('tracker.resume') : t('tracker.pause')}
          </Button>
          <Button size="sm" variant="glass" disabled={!canUndo} onClick={onUndo}>
            <Undo2 size={14} aria-hidden />
            {t('tracker.undo')}
          </Button>
          <Button
            size="sm"
            variant="glass"
            disabled={decided || state.players.length < 2}
            onClick={() => {
              setSelectedSeatId(null);
              setArrangeSeats(true);
            }}
          >
            <ArrowUpDown size={14} aria-hidden />
            {t('tracker.rearrangeSeats')}
          </Button>
          {onChallenges ? (
            <Button size="sm" variant="glass" onClick={onChallenges}>
              <Sparkles size={14} aria-hidden />
              {t('tracker.challenges')}
            </Button>
          ) : null}
          <Button size="sm" variant="glass" onClick={onRules}>
            <BookOpen size={14} aria-hidden />
            {t('tracker.readRules')}
          </Button>
          <Button size="sm" variant="glass" onClick={onDiceTools}>
            <Dices size={14} aria-hidden />
            {t('tracker.diceTools')}
          </Button>
          <Button
            size="sm"
            variant="glass"
            onClick={() =>
              openFeedback({
                participantStatus: 'playing',
                gameMode: state.gameMode,
              })
            }
          >
            <MessageSquare size={14} aria-hidden />
            {t('feedback.open')}
          </Button>
          {onTargets ? (
            <Button size="sm" variant="glass" onClick={onTargets}>
              <Crosshair size={14} aria-hidden />
              {t('tracker.checkTarget')}
            </Button>
          ) : null}
          {onCheckRole ? (
            <Button
              size="sm"
              variant="glass"
              onClick={() => {
                onClose();
                onCheckRole();
              }}
            >
              <Eye size={14} aria-hidden />
              {t('tracker.checkMyRole')}
            </Button>
          ) : null}
          {/*
            Day and night exist only once a card has set them, and no card ever
            takes the table back to neither, so this is a two-way switch.
          */}
          <Button
            size="sm"
            variant={state.dayNight === 'day' ? 'neon' : 'glass'}
            disabled={decided}
            onClick={() => {
              dispatch({ type: 'dayNight', value: 'day' });
            }}
          >
            <Sun size={14} aria-hidden />
            {t('tracker.dayButton')}
          </Button>
          <Button
            size="sm"
            variant={state.dayNight === 'night' ? 'neon' : 'glass'}
            disabled={decided}
            onClick={() => {
              dispatch({ type: 'dayNight', value: 'night' });
            }}
          >
            <Moon size={14} aria-hidden />
            {t('tracker.nightButton')}
          </Button>
        </div>
        {/*
          Life, poison, commander damage and Etrata hits raise a prompt on the
          card. Everything else that ends a seat — a mill-out, a concession, a
          card that says "you lose" — has to be named from here, because the
          board has no way to see it.
        */}
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-muted/15 pt-3">
          <span className="text-muted font-mono text-[0.68rem] tracking-wide uppercase">
            {t('tracker.playerLost')}
          </span>
          {state.players.map((seat) => (
            <Button
              key={seat.id}
              size="sm"
              variant="glass"
              disabled={decided || seat.eliminated}
              onClick={() => {
                if (onPlayerLost) {
                  onPlayerLost(seat.id);
                } else {
                  dispatch({ type: 'eliminate', playerId: seat.id });
                }
              }}
            >
              <UserX size={14} aria-hidden />
              {seat.name}
            </Button>
          ))}
        </div>
        {/*
          A pod usually ends by concession rather than by the last blow, and the
          board can only name a winner on its own once every other seat is out.
          Calling it freezes the clock and the board, which undo can lift.
        */}
        <div className="flex flex-wrap items-center justify-center gap-2 border-t border-muted/15 pt-3">
          <span className="text-muted font-mono text-[0.68rem] tracking-wide uppercase">
            {menuWinnerName
              ? t('tracker.won', { name: menuWinnerName })
              : t('tracker.gameWonBy')}
          </span>
          {state.players.map((seat) => (
            <Button
              key={seat.id}
              size="sm"
              variant={menuWinnerIds.has(seat.id) ? 'neon' : 'glass'}
              disabled={decided || seat.eliminated}
              onClick={() => {
                dispatch({ type: 'winner', playerId: seat.id });
              }}
            >
              <Trophy size={14} aria-hidden />
              {seat.name}
            </Button>
          ))}
          {/* The way out, for a pod that dismissed the result to read the board. */}
          {decided ? (
            <Button
              size="sm"
              variant="neon"
              onClick={() => void onFinish()}
            >
              {t('tracker.doneRequeue')}
            </Button>
          ) : null}
        </div>
        {/*
          Leaving is the one control here that abandons the screen rather than
          changing the board, so it sits apart from the table controls and wears
          the danger colour. The game itself survives, which the note says.
        */}
        <div className="border-danger/25 flex w-full flex-col items-center gap-1.5 border-t pt-3">
          <Button size="sm" variant="danger" onClick={onQuit}>
            <LogOut size={14} aria-hidden />
            {t('tracker.quitToHome')}
          </Button>
          <p className="text-muted text-center text-[0.65rem]">
            {t('tracker.quitHint')}
          </p>
        </div>
      </div>
    </section>
  );
}

/** Colour bubble + name on setup pickers so the table can claim a seat early. */
function SeatLabel({
  index,
  name,
}: {
  index: number;
  name: string;
}) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center justify-center gap-1.5">
      <span
        className="size-2.5 shrink-0 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
        style={{ backgroundColor: seatColor(index) }}
        title={t('tracker.seatColour', { name })}
        aria-hidden
      />
      <span>{name}</span>
    </span>
  );
}

function playerSeatIndex(
  players: Array<{ id: string }>,
  playerId: string,
): number {
  const index = players.findIndex((player) => player.id === playerId);
  return index < 0 ? 0 : index;
}

function LifeRow({
  life,
  flash,
  disabled,
  onStep,
  onEnter,
  compact = false,
  color,
  colors,
}: {
  life: number;
  flash: number | null;
  disabled: boolean;
  onStep: (delta: number) => void;
  onEnter: (sign: 1 | -1) => void;
  /** Shared-life chrome: no spare vertical padding around the total. */
  compact?: boolean;
  /** Seat colour for a single life total. */
  color?: string;
  /** Shared-life sides: blend every teammate’s colour across the total. */
  colors?: string[];
}) {
  // Slot is always five tabular digits wide; denser totals shrink to fit it.
  const digits = String(Math.abs(life)).length;
  const palette = colors?.length ? colors : color ? [color] : [];
  const lifeStyle =
    palette.length > 1
      ? {
          backgroundImage: `linear-gradient(90deg, ${palette.join(', ')})`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text' as const,
          color: 'transparent',
        }
      : palette[0]
        ? { color: palette[0] }
        : undefined;
  return (
    <div
      className={cx(
        'relative z-10 flex min-h-0 items-center',
        compact ? 'gap-1' : 'flex-1 gap-1.5 py-1',
      )}
    >
      <LifeButton
        delta={-1}
        disabled={disabled}
        compact={compact}
        onClick={() => onStep(-1)}
        onLongPress={() => onEnter(-1)}
      />
      <div
        className={cx(
          'relative flex min-w-0 flex-1 flex-col items-center justify-center',
          !compact && 'self-stretch',
        )}
      >
        <p
          className={cx(
            'font-display w-[8.5rem] shrink-0 text-center leading-none font-bold tabular-nums landscape:w-[10.5rem]',
            !lifeStyle && 'text-neon',
            digits >= 5
              ? 'text-[clamp(1.1rem,4.5vh,2rem)] landscape:text-[clamp(1.15rem,7vh,2.1rem)]'
              : digits >= 4
                ? 'text-[clamp(1.4rem,5.5vh,2.6rem)] landscape:text-[clamp(1.5rem,9vh,2.85rem)]'
                : digits >= 3
                  ? 'text-[clamp(1.85rem,7.5vh,3.5rem)] landscape:text-[clamp(2rem,12vh,4rem)]'
                  : 'text-[clamp(2.75rem,11vh,5.25rem)] landscape:text-[clamp(3rem,18vh,5.75rem)]',
            onArt,
          )}
          style={lifeStyle}
        >
          {life}
        </p>
        {flash && flash !== 0 ? (
          <p
            className={cx(
              'font-display absolute top-[calc(50%+1.45em)] text-sm leading-none font-bold tabular-nums',
              flash > 0 ? 'text-gain' : 'text-danger',
              onArt,
            )}
          >
            {flash > 0 ? `+${String(flash)}` : String(flash)}
          </p>
        ) : null}
      </div>
      <LifeButton
        delta={1}
        disabled={disabled}
        compact={compact}
        onClick={() => onStep(1)}
        onLongPress={() => onEnter(1)}
      />
    </div>
  );
}

function LifeButton({
  delta,
  disabled,
  onClick,
  onLongPress,
  compact = false,
}: {
  delta: number;
  disabled: boolean;
  onClick: () => void;
  onLongPress: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);

  function clearTimer() {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={
        delta > 0 ? t('tracker.addLife') : t('tracker.removeLife')
      }
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) {
          return;
        }
        longPressed.current = false;
        clearTimer();
        event.currentTarget.setPointerCapture(event.pointerId);
        timer.current = window.setTimeout(() => {
          longPressed.current = true;
          onLongPress();
        }, 420);
      }}
      onPointerUp={(event) => {
        const wasLong = longPressed.current;
        clearTimer();
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (!wasLong && !disabled) {
          onClick();
        }
        longPressed.current = false;
      }}
      onPointerCancel={(event) => {
        clearTimer();
        longPressed.current = false;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onContextMenu={(event) => event.preventDefault()}
      className={cx(
        plateAccent,
        'font-display border-neon/50 text-neon flex w-16 shrink-0 items-center justify-center rounded-xl border text-xl font-bold transition select-none disabled:opacity-40',
        compact ? 'h-10' : 'h-full max-h-20 min-h-11',
      )}
    >
      {delta > 0 ? '+1' : '-1'}
    </button>
  );
}

function LifeAmountPad({
  sign,
  playerName,
  facesAway = false,
  forceRotate = false,
  onConfirm,
  onClose,
}: {
  sign: 1 | -1;
  playerName: string;
  facesAway?: boolean;
  forceRotate?: boolean;
  onConfirm: (amount: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [digits, setDigits] = useState('');
  const amount = Number(digits);
  const ready = digits.length > 0 && amount > 0;
  const verb = sign > 0 ? t('tracker.add') : t('tracker.removeVerb');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        sign > 0
          ? t('tracker.addLifeFor', { name: playerName })
          : t('tracker.removeLifeFor', { name: playerName })
      }
      className={cx(
        'bg-void/95 fixed inset-0 z-[80] flex items-center justify-center p-4 backdrop-blur-md',
        seatFacingPortalClass(facesAway, forceRotate),
      )}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="border-muted/25 bg-hull w-full max-w-sm rounded-2xl border p-4 shadow-2xl">
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-muted text-xs font-bold tracking-wider uppercase">
              {sign > 0
                ? t('tracker.addLifeLabel', { name: playerName })
                : t('tracker.removeLifeLabel', { name: playerName })}
            </p>
            <p
              className={cx(
                'font-display text-4xl font-bold tabular-nums',
                sign > 0 ? 'text-gain' : 'text-danger',
              )}
            >
              {sign > 0 ? '+' : '−'}
              {digits || '0'}
            </p>
          </div>
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={onClose}
            className="border-muted/25 text-muted flex size-8 items-center justify-center rounded-full border"
          >
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="mb-3 grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'].map(
            (key) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  setDigits((current) => {
                    const next = `${current}${key}`.replace(/^0+(?=\d)/, '');
                    return next.slice(0, 3);
                  })
                }
                className={cx(
                  plate,
                  'border-muted/25 hover:border-neon/40 font-display h-12 rounded-xl border text-xl font-bold transition',
                )}
              >
                {key}
              </button>
            ),
          )}
          <button
            type="button"
            aria-label={t('tracker.deleteDigit')}
            onClick={() => setDigits((current) => current.slice(0, -1))}
            className={cx(
              plate,
              'border-muted/25 hover:border-neon/40 flex h-12 items-center justify-center rounded-xl border transition',
            )}
          >
            <Delete size={18} aria-hidden />
          </button>
        </div>
        <Button
          variant={sign > 0 ? 'neon' : 'danger'}
          size="lg"
          block
          disabled={!ready}
          onClick={() => onConfirm(amount)}
        >
          {verb} {ready ? String(amount) : ''}
        </Button>
      </section>
    </div>
  );
}

function Chip({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        plate,
        'border-muted/25 hover:border-neon/50 flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 font-mono text-xs transition disabled:opacity-40',
      )}
    >
      {children}
    </button>
  );
}

/* Recasting a commander costs two more mana each time, so the tax moves in twos. */
const COMMANDER_TAX_STEP = 2;

/*
  Both directions are reachable in a tap. Counters used to only climb, and with
  no undo button on the match screen a stray poison counter could not be taken
  back. The figure sits between the two arms so the group still reads as one
  control on a card that has little room to spare.
*/
function Counter({
  label,
  value,
  step = 1,
  maximum,
  disabled,
  onChange,
  children,
}: {
  label: string;
  value: number;
  step?: number;
  maximum?: number;
  disabled: boolean;
  onChange: (delta: number) => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={`${label}: ${String(value)}`}
      className={cx(
        plate,
        'border-muted/25 divide-muted/20 flex shrink-0 items-center divide-x rounded-lg border font-mono text-xs',
      )}
    >
      <button
        type="button"
        title={t('tracker.lower', { label })}
        aria-label={t('tracker.lower', { label })}
        disabled={disabled || value <= 0}
        onClick={() => onChange(-step)}
        className="hover:text-neon flex items-center px-1.5 py-1 transition disabled:opacity-30"
      >
        <Minus size={12} aria-hidden />
      </button>
      <span className="flex min-w-9 items-center justify-center gap-1 px-1 py-1 tabular-nums">
        {children}
        {value}
      </span>
      <button
        type="button"
        title={t('tracker.raise', { label })}
        aria-label={t('tracker.raise', { label })}
        disabled={disabled || (maximum !== undefined && value >= maximum)}
        onClick={() => onChange(step)}
        className="hover:text-neon flex items-center px-1.5 py-1 transition disabled:opacity-30"
      >
        <Plus size={12} aria-hidden />
      </button>
    </div>
  );
}

type CounterDefinition = {
  id: 'poison' | 'tax' | SecondaryCounter;
  label: string;
  step?: number;
  maximum?: number;
  /** Counts that are closing on a loss, so a badge can say so in colour. */
  danger?: { warn: number; alert: number };
  icon: (size: number) => React.ReactNode;
};

type CounterSpec = Omit<CounterDefinition, 'label'>;

/*
  Poison and the commander tax have fields of their own, but on screen they are
  counters like any other, so one table feeds both the sheet and the badges and
  the two cannot drift apart.
*/
const COUNTER_SPECS: CounterSpec[] = [
  {
    id: 'poison',
    danger: { warn: POISON_LIMIT - 3, alert: POISON_LIMIT },
    icon: (size) => <Skull size={size} aria-hidden />,
  },
  {
    id: 'tax',
    step: COMMANDER_TAX_STEP,
    icon: (size) => <Coins size={size} aria-hidden />,
  },
  {
    id: 'acorn',
    icon: (size) => <Nut size={size} aria-hidden />,
  },
  {
    id: 'energy',
    icon: (size) => <Zap size={size} aria-hidden />,
  },
  {
    id: 'experience',
    icon: (size) => <Award size={size} aria-hidden />,
  },
  {
    id: 'hit',
    maximum: HIT_LIMIT,
    danger: { warn: HIT_LIMIT - 1, alert: HIT_LIMIT },
    icon: (size) => <Crosshair size={size} aria-hidden />,
  },
  {
    id: 'rad',
    icon: (size) => <Radiation size={size} aria-hidden />,
  },
  {
    id: 'ring',
    maximum: 4,
    icon: (size) => <RingIcon size={size} />,
  },
  {
    id: 'speed',
    maximum: 4,
    icon: (size) => <Gauge size={size} aria-hidden />,
  },
  {
    id: 'ticket',
    icon: (size) => <Ticket size={size} aria-hidden />,
  },
];

function counterDefinitions(
  translate: TFunction = i18n.t.bind(i18n),
): CounterDefinition[] {
  return COUNTER_SPECS.map((spec) => ({
    ...spec,
    label: translate(`tracker.counters.${spec.id}`),
  }));
}

function counterValue(
  player: TrackerPlayer,
  id: CounterDefinition['id'],
): number {
  if (id === 'poison') {
    return player.poison;
  }
  if (id === 'tax') {
    return player.commanderTax;
  }
  return player.counters?.[id] ?? 0;
}

function counterAction(
  playerId: string,
  id: CounterDefinition['id'],
  delta: number,
): TrackerAction {
  if (id === 'poison') {
    return { type: 'poison', playerId, delta };
  }
  if (id === 'tax') {
    return { type: 'tax', playerId, delta };
  }
  return { type: 'counter', playerId, counter: id, delta };
}

function counterTone(definition: CounterDefinition, value: number): string {
  if (!definition.danger) {
    return '';
  }
  if (value >= definition.danger.alert) {
    return 'text-danger font-bold';
  }
  if (value >= definition.danger.warn) {
    return 'text-warning font-bold';
  }
  return '';
}

/** The counters a seat actually holds, in the order the sheet lists them. */
export function heldCounters(
  player: TrackerPlayer,
  definitions: CounterDefinition[] = counterDefinitions(),
): { definition: CounterDefinition; value: number; tone: string }[] {
  return definitions.map((definition) => ({
    definition,
    value: counterValue(player, definition.id),
  }))
    .filter((row) => row.value > 0)
    .map((row) => ({ ...row, tone: counterTone(row.definition, row.value) }));
}

/*
  A seat carries badges only for the counters it actually holds, so most games
  show none and the three poison next to the four energy still land in a single
  glance. Each badge opens the sheet it came from, which is where the counter is
  adjusted.
*/
function CounterBadges({
  player,
  disabled,
  onOpen,
  hidePoison = false,
  hideTax = false,
  onlyPoison = false,
}: {
  player: TrackerPlayer;
  disabled: boolean;
  onOpen: () => void;
  /** Shared-life seats keep poison on the team chrome instead. */
  hidePoison?: boolean;
  /** Normal Magic formats have no commander tax. */
  hideTax?: boolean;
  /** Team chrome: only the shared poison pill. */
  onlyPoison?: boolean;
}) {
  const { t } = useTranslation();
  const rows = heldCounters(player).filter((row) => {
    if (onlyPoison) {
      return row.definition.id === 'poison';
    }
    if (hidePoison && row.definition.id === 'poison') {
      return false;
    }
    if (hideTax && row.definition.id === 'tax') {
      return false;
    }
    return true;
  });
  return (
    <>
      {rows.map(({ definition, value, tone }) => (
        <button
          key={definition.id}
          type="button"
          title={t('tracker.counterOn', {
            label: definition.label,
            name: player.name,
            value,
          })}
          aria-label={t('tracker.counterOn', {
            label: definition.label,
            name: player.name,
            value,
          })}
          disabled={disabled}
          onClick={onOpen}
          /*
            Readouts rather than controls, so they are pill-shaped and a size
            down from the buttons along the bottom. They still open the sheet,
            which is the only place a counter changes.
          */
          className={cx(
            plate,
            'border-muted/20 hover:border-neon/50 flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.5 font-mono text-[0.6rem] leading-none transition disabled:opacity-40',
          )}
        >
          {definition.icon(11)}
          <span className={cx('tabular-nums', tone)}>{value}</span>
        </button>
      ))}
    </>
  );
}

function ChallengeSheet({
  pack,
  players,
  progress,
  onClaim,
  onClose,
}: {
  pack: ChallengePack;
  players: TrackerPlayer[];
  progress: Record<
    string,
    { points: number; completedChallengeIds: string[] }
  >;
  onClaim: (challengeId: string, participantId: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="flex h-full w-full flex-col">
      <header className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-display truncate text-sm font-bold">
            {pack.name}
          </h4>
          <p className="text-muted truncate text-[0.65rem]">
            {t('tracker.challengesSubtitle')}
          </p>
        </div>
        <button
          type="button"
          aria-label={t('tracker.closeChallenges')}
          onClick={onClose}
          className="border-muted/25 text-muted hover:text-ink flex size-8 shrink-0 items-center justify-center rounded-full border"
        >
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="mb-2 flex shrink-0 flex-wrap gap-1.5">
        {players.map((player) => (
          <Badge key={player.id}>
            {player.name} · {t('host.pts', { count: progress[player.id]?.points ?? 0 })}
          </Badge>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto landscape:grid-cols-2">
        {pack.challenges.map((challenge) => (
          <article
            key={challenge.id}
            className="border-muted/20 bg-hull/70 rounded-xl border p-3"
          >
            <div className="mb-1 flex items-start justify-between gap-2">
              <div>
                <h5 className="text-sm font-semibold">{challenge.name}</h5>
                <p className="text-muted text-xs">{challenge.description}</p>
              </div>
              <Badge tone={challenge.detectionMode === 'automatic' ? 'live' : undefined}>
                +{String(challenge.points)}
              </Badge>
            </div>
            <p className="text-muted mb-2 font-mono text-[0.6rem] tracking-wide uppercase">
              {challenge.detectionMode}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {players.map((player) => {
                const completed =
                  progress[player.id]?.completedChallengeIds.includes(
                    challenge.id,
                  ) ?? false;
                if (completed) {
                  return (
                    <span
                      key={player.id}
                      className="text-neon flex items-center gap-1 text-xs"
                    >
                      <Check size={12} aria-hidden />
                      {player.name}
                    </span>
                  );
                }
                if (challenge.detectionMode !== 'manual') {
                  return null;
                }
                return (
                  <Button
                    key={player.id}
                    size="sm"
                    variant="glass"
                    onClick={() => void onClaim(challenge.id, player.id)}
                  >
                    {t('tracker.claimFor', { name: player.name })}
                  </Button>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CounterSheet({
  player,
  disabled,
  dispatch,
  onClose,
  includeCommanderTax = true,
}: {
  player: TrackerPlayer;
  disabled: boolean;
  dispatch: (action: TrackerAction) => void;
  onClose: () => void;
  includeCommanderTax?: boolean;
}) {
  const { t } = useTranslation();
  const counters = counterDefinitions(t).filter(
    (counter) => includeCommanderTax || counter.id !== 'tax',
  );
  return (
    <section className="flex h-full w-full flex-col">
      <header className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <h4 className="font-display truncate text-sm leading-tight font-bold">
          {t('tracker.countersTitle', { name: player.name })}
        </h4>
        <button
          type="button"
          aria-label={t('tracker.closeCounters')}
          onClick={onClose}
          className="border-muted/25 text-muted hover:text-ink hover:border-muted/50 flex size-8 shrink-0 items-center justify-center rounded-full border transition"
        >
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-2 content-center gap-2 overflow-y-auto landscape:grid-cols-4">
        {counters.map((counter) => (
          <CounterCard key={counter.id} label={counter.label}>
            <Counter
              label={t('tracker.counterFor', {
                label: counter.label,
                name: player.name,
              })}
              value={counterValue(player, counter.id)}
              step={counter.step}
              maximum={counter.maximum}
              disabled={disabled}
              onChange={(delta) =>
                dispatch(counterAction(player.id, counter.id, delta))
              }
            >
              {counter.icon(18)}
            </Counter>
          </CounterCard>
        ))}
      </div>
    </section>
  );
}

function CounterCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-muted/20 bg-hull/75 flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-2">
      <span className="text-muted text-center text-xs font-semibold">{label}</span>
      {children}
    </div>
  );
}

/*
  Only the largest single figure is shown, since that is the one racing the
  twenty-one that kills, and colour carries the warning so a glance across the
  table is enough. Which commander it came from is a tap away in the sheet.
*/
const COMMANDER_DAMAGE_WARN = 16;
const COMMANDER_DAMAGE_ALERT = 18;

function CommanderDamageChip({
  state,
  player,
  disabled,
  onOpen,
}: {
  state: TrackerState;
  player: TrackerPlayer;
  disabled: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const worst = worstCommanderDamage(state, player);
  const value = worst?.value ?? 0;
  return (
    <Chip
      title={
        worst
          ? t('tracker.highestCommanderDamage', {
              name: player.name,
              value,
              commander: worst.commander,
            })
          : t('tracker.noCommanderDamage', { name: player.name })
      }
      disabled={disabled}
      onClick={onOpen}
    >
      <Shield size={14} aria-hidden />
      <span
        className={cx(
          'tabular-nums',
          value >= COMMANDER_DAMAGE_ALERT
            ? 'text-danger font-bold'
            : value >= COMMANDER_DAMAGE_WARN
              ? 'text-warning font-bold'
              : '',
        )}
      >
        {value}
      </span>
    </Chip>
  );
}

function IconButton({
  title,
  active = false,
  disabled,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex size-9 items-center justify-center rounded-lg border text-sm transition disabled:opacity-40',
        active
          ? cx(plateGold, gilded)
          : cx(plate, 'border-muted/25 text-muted hover:border-muted/45 hover:text-ink'),
      )}
    >
      {children}
    </button>
  );
}

/*
  Art identifies the seat at a glance, so it sits behind the whole card rather
  than spending any of the height the life counter needs. A scrim keeps the
  numbers readable in both themes, and a pair splits the card down the middle.

  A seat is far wider than an art crop, so cover trims the top and bottom. The
  focal point sits above centre because card art almost always frames the
  subject's head high, and an even crop decapitates it. The knocked-out skull is
  framed near the centre, with a slight upward nudge of its own.
*/
function CommanderArt({
  commanders,
  eliminated,
}: {
  commanders: Commander[];
  eliminated: boolean;
}) {
  const art = eliminated
    ? [
        {
          id: 'eliminated',
          artCropUri: ELIMINATED_ART,
          focus: 'object-[center_55%]',
        },
      ]
    : commanders
        .filter((commander) => commander.artCropUri)
        .map((commander) => ({ ...commander, focus: 'object-[center_15%]' }));
  if (art.length === 0) {
    return null;
  }
  return (
    <div className="absolute inset-0 z-0" aria-hidden>
      <div className="flex size-full gap-px">
        {art.map((entry) => (
          <img
            key={entry.id}
            src={entry.artCropUri}
            alt=""
            decoding="sync"
            className={cx('min-w-0 flex-1 object-cover', entry.focus)}
          />
        ))}
      </div>
      <div className="bg-void/45 absolute inset-0" />
    </div>
  );
}

function DungeonButton({
  name,
  completed,
  active,
  disabled,
  onClick,
}: {
  name: string;
  completed: number;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const filled = Math.min(completed, DUNGEON_COUNT);
  const title = active
    ? t('tracker.dungeonInitiativeActive', {
        name,
        filled,
        total: DUNGEON_COUNT,
      })
    : t('tracker.dungeonInitiativeCompleted', {
        name,
        filled,
        total: DUNGEON_COUNT,
      });
  return (
    <button
      type="button"
      title={title}
      aria-label={t('tracker.dungeonInitiative', { name, title })}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex min-h-9 w-9 flex-col items-center justify-center gap-0.5 rounded-lg border py-0.5 transition disabled:opacity-40',
        active
          ? cx(
              plateGold,
              'border-warning/60 text-warning shadow-[0_0_14px_-4px_var(--color-warning)] [&>svg]:fill-warning',
            )
          : cx(plate, 'border-muted/25 text-muted hover:border-muted/45 hover:text-ink'),
      )}
    >
      <DungeonIcon size={20} />
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: DUNGEON_COUNT }, (_, index) => (
          <span
            key={index}
            className={cx(
              'size-1 rounded-full',
              index < filled
                ? active
                  ? 'bg-warning'
                  : 'bg-neon'
                : 'bg-muted/35',
            )}
          />
        ))}
      </span>
    </button>
  );
}

function lossPrompt(
  player: TrackerPlayer,
  state: TrackerState,
  t: TFunction,
): string {
  const cause = player.pendingLoss;
  const shared =
    (state.teamMode === 'two-headed-giant' ||
      state.teamMode === 'archenemy-commander') &&
    teamForPlayer(state, player.id).length > 1;
  const subject = shared ? t('tracker.thisTeam') : player.name;
  const lose = shared
    ? t('tracker.didTheyLose')
    : t('tracker.didLose', { name: player.name });
  if (cause?.type === 'poison') {
    return shared
      ? t('tracker.sharedPoisonPrompt', {
          subject,
          count: player.poison,
          lose,
        })
      : t('tracker.poisonPrompt', { name: player.name, count: player.poison });
  }
  if (cause?.type === 'hit') {
    return t('tracker.hitPrompt', {
      name: player.name,
      count: player.counters.hit,
    });
  }
  if (cause?.type === 'commander') {
    const source = commanderById(state, cause.commanderId);
    const damage = player.commanderDamage[cause.commanderId] ?? 0;
    const from =
      source == null
        ? t('tracker.anotherCommander')
        : source.commander.name === source.owner.name
          ? source.owner.name
          : `${source.owner.name}'s ${source.commander.name}`;
    return shared
      ? t('tracker.sharedCommanderPrompt', {
          subject,
          damage,
          from,
          lose,
        })
      : t('tracker.commanderPrompt', {
          name: player.name,
          damage,
          from,
        });
  }
  return shared
    ? t('tracker.sharedLifePrompt', { subject, life: player.life, lose })
    : t('tracker.lifePrompt', { name: player.name, life: player.life });
}

/**
 * One column per opponent so a pod fits across a phone lying flat. Portrait
 * keeps two columns rather than one tall list, which is what pushes the last
 * commander under the fold.
 */
function opponentGridClass(count: number): string {
  if (count <= 1) {
    return 'grid-cols-1';
  }
  if (count === 2) {
    return 'grid-cols-2';
  }
  if (count === 3) {
    return 'grid-cols-2 landscape:grid-cols-3';
  }
  if (count === 4) {
    return 'grid-cols-2 landscape:grid-cols-4';
  }
  return 'grid-cols-2 landscape:grid-cols-5';
}

function CommanderSheet({
  state,
  player,
  disabled,
  dispatch,
  onClose,
}: {
  state: TrackerState;
  player: TrackerPlayer;
  disabled: boolean;
  dispatch: (action: TrackerAction) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const opponents = commanderOpponents(state, player.id);
  const shared = teamForPlayer(state, player.id).length > 1;
  return (
    <section className="flex h-full w-full flex-col">
      <header className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <h4 className="font-display truncate text-sm leading-tight font-bold">
          {shared
            ? t('tracker.sharedCommanderDamage')
            : t('tracker.commanderDamageOn', { name: player.name })}
        </h4>
        <button
          type="button"
          aria-label={t('tracker.closeCommanderDamage')}
          onClick={onClose}
          className="border-muted/25 text-muted hover:text-ink hover:border-muted/50 flex size-8 shrink-0 items-center justify-center rounded-full border transition"
        >
          <X size={18} aria-hidden />
        </button>
      </header>
      <div
        className={cx(
          'grid min-h-0 flex-1 gap-2',
          opponentGridClass(opponents.length),
        )}
      >
        {opponents.map((other) => (
          <div key={other.id} className="flex min-h-0 flex-col gap-1">
            <p className="text-muted truncate text-center text-xs font-semibold">
              {other.name}
            </p>
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              {other.commanders.map((commander) => (
                <CommanderTile
                  key={commander.id}
                  name={commander.name}
                  owner={other.name}
                  artCropUri={commander.artCropUri}
                  value={player.commanderDamage[commander.id] ?? 0}
                  disabled={disabled}
                  onChange={(delta) =>
                    dispatch({
                      type: 'commander',
                      commanderId: commander.id,
                      toId: player.id,
                      delta,
                    })
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/*
  The art is the label, so the whole tile is the control: a wide minus half, a
  wide plus half, and the running total between them. Names are dropped because
  players recognise their own commander art faster than they read a row.
*/
function CommanderTile({
  name,
  owner,
  artCropUri,
  value,
  disabled,
  onChange,
}: {
  name: string;
  owner: string;
  artCropUri?: string;
  value: number;
  disabled: boolean;
  onChange: (delta: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="border-muted/20 bg-void/60 relative min-h-16 flex-1 overflow-hidden rounded-xl border">
      {artCropUri ? (
        <img
          src={artCropUri}
          alt=""
          loading="eager"
          fetchPriority="high"
          className="absolute inset-0 size-full object-[center_15%] object-cover"
        />
      ) : (
        <span className="text-muted absolute inset-0 flex items-center justify-center">
          <Shield size={22} aria-hidden />
        </span>
      )}
      <div className="absolute inset-0 flex items-stretch">
        <button
          type="button"
          aria-label={t('tracker.removeCommanderDamage', { owner, name })}
          disabled={disabled || value <= 0}
          onClick={() => onChange(-1)}
          className="from-void/80 text-ink flex flex-1 items-center justify-center bg-gradient-to-r to-transparent transition active:from-void disabled:opacity-30"
        >
          <Minus size={22} aria-hidden />
        </button>
        <span
          className={cx(
            'font-display bg-void/70 pointer-events-none flex min-w-9 items-center justify-center text-xl font-bold tabular-nums',
            value > 0 ? 'text-neon' : 'text-muted',
          )}
        >
          {value}
        </span>
        <button
          type="button"
          aria-label={t('tracker.addCommanderDamage', { owner, name })}
          disabled={disabled}
          onClick={() => onChange(1)}
          className="from-void/80 text-ink flex flex-1 items-center justify-center bg-gradient-to-l to-transparent transition active:from-void disabled:opacity-30"
        >
          <Plus size={22} aria-hidden />
        </button>
      </div>
    </div>
  );
}

export type Msg =
  | { type: 'action'; action: TrackerAction }
  | { type: 'first'; playerId?: string }
  | { type: 'undo' };

/*
  A short history rather than a full one: undo is there to walk back the stray
  tap that the match screen has no other way to fix, and a pod is never going to
  reach thirty steps back to find it. It is deliberately not persisted, so a
  reload starts the game from where it stands and not from its past.
*/
export const HISTORY_LIMIT = 30;

export type TrackerHistory = { present: TrackerState; past: TrackerState[] };

export function reduceHistory(
  history: TrackerHistory,
  message: Msg,
): TrackerHistory {
  if (message.type === 'undo') {
    const previous = history.past.at(-1);
    return previous
      ? { present: previous, past: history.past.slice(0, -1) }
      : history;
  }
  const present =
    message.type === 'first'
      ? message.playerId
        ? applyTrackerAction(history.present, {
            type: 'first',
            playerId: message.playerId,
          })
        : pickFirstPlayer(history.present)
      : applyTrackerAction(history.present, message.action);
  // An action the engine refused changes nothing, so it earns no history entry.
  if (present === history.present) {
    return history;
  }
  return {
    present,
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
  };
}

function restore(
  storageKey: string,
  players: Array<{ id: string; name: string }>,
  persist: boolean,
  startingLife = STARTING_LIFE,
  gameMode: GameMode = 'commander',
  rulesFormat: RulesFormat = 'commander',
): TrackerState {
  if (!persist) {
    removeStored(storageKey);
    return createTracker(players, Date.now(), {
      startingLife,
      gameMode,
      rulesFormat,
    });
  }
  const raw = readStored(storageKey);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as TrackerState;
      if (parsed.players?.length === players.length) {
        const resolvedFormat = parsed.rulesFormat ?? rulesFormat;
        return {
          ...parsed,
          gameMode: parsed.gameMode ?? gameMode,
          rulesFormat: resolvedFormat,
          teams: parsed.teams ?? null,
          teamMode: parsed.teamMode ?? null,
          archenemyId: parsed.archenemyId ?? null,
          emperorIds: parsed.emperorIds ?? [],
          starOrder: parsed.starOrder ?? [],
          assassinTargets: parsed.assassinTargets ?? {},
          assassinScores: parsed.assassinScores ?? {},
          assassinContractsReady: parsed.assassinContractsReady ?? false,
          pastSchemeIds: parsed.pastSchemeIds ?? [],
          treacheryRoles: parsed.treacheryRoles ?? {},
          treacheryIdentities: parsed.treacheryIdentities ?? {},
          treacheryUnveiled: parsed.treacheryUnveiled ?? [],
          treacheryRolesReady: parsed.treacheryRolesReady ?? false,
          schemeOrder: parsed.schemeOrder ?? [],
          currentSchemeId: parsed.currentSchemeId ?? null,
          activeSchemeIds: parsed.activeSchemeIds ?? [],
          dayNight: parsed.dayNight ?? null,
          dungeons: parsed.dungeons ?? {},
          completedDungeons: normalizeCompletedDungeons(
            parsed.completedDungeons,
          ),
          eliminations: parsed.eliminations ?? [],
          players: parsed.players.map((player) =>
            normalizePlayer(player, parsed.players, resolvedFormat),
          ),
        };
      }
    } catch {
      /* start fresh */
    }
  }
  return createTracker(players, Date.now(), {
    startingLife,
    gameMode,
    rulesFormat,
  });
}

function normalizePlayer(
  player: TrackerPlayer,
  roster: TrackerPlayer[],
  rulesFormat: RulesFormat,
): TrackerPlayer {
  const withCommanders = rulesFormat === 'commander';
  const commanders =
    withCommanders && player.commanders?.length > 0
      ? player.commanders
      : withCommanders
        ? defaultCommanders(player.id, player.name)
        : [];
  const commanderDamage: Record<string, number> = {};
  for (const [key, value] of Object.entries(player.commanderDamage ?? {})) {
    if (typeof value !== 'number') {
      continue;
    }
    if (commanders.some((row) => row.id === key)) {
      commanderDamage[key] = value;
      continue;
    }
    // Older snapshots keyed damage by the dealing player's id.
    if (roster.some((row) => row.id === key)) {
      commanderDamage[primaryCommanderId(key)] = value;
    }
  }
  return {
    ...player,
    minimumLife: player.minimumLife ?? player.life,
    poison: player.poison ?? 0,
    commanderTax: player.commanderTax ?? 0,
    counters: {
      ...emptySecondaryCounters(),
      ...(player.counters ?? {}),
    },
    enduringStory: player.enduringStory ?? false,
    cityBlessing: player.cityBlessing ?? false,
    commanders,
    commanderDamage,
    pendingLoss: player.pendingLoss ?? null,
    answeredCauses: player.answeredCauses ?? [],
  };
}

function normalizeCompletedDungeons(
  raw: TrackerState['completedDungeons'] | undefined,
): TrackerState['completedDungeons'] {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const next: TrackerState['completedDungeons'] = {};
  for (const [playerId, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      next[playerId] = value;
    }
  }
  return next;
}
