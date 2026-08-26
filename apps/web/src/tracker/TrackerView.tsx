import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Award,
  BookOpen,
  Building2,
  Coins,
  Crosshair,
  Check,
  Crown,
  Eye,
  Flag,
  Gauge,
  Minus,
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
  Sparkles,
  Skull,
  SlidersHorizontal,
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
  type ChallengeDetectionMode,
  type ChallengePack,
  type GameMode,
  type PublicTreacheryIdentity,
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
import { planFirstPlayerReveal, type RevealHop } from './first-player-reveal';
import { DungeonTracker } from './DungeonTracker';
import { useLandscape, useLandscapeLock } from './orientation';
import {
  detectAutomaticChallenges,
  detectedConfirmation,
} from './challenges';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { DungeonIcon } from '../ui/DungeonIcon';
import { RingIcon } from '../ui/RingIcon';
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
  /** Treachery's public Leader replaces the normal random starting seat. */
  startingPlayerId?: string;
  onCheckRole?: () => void;
  revealedIdentities?: Record<string, PublicTreacheryIdentity>;
};

/*
  Fixed to the dynamic viewport so mobile browser chrome cannot push the last
  card out of reach. The side padding honours landscape notch insets, which is
  the orientation a phone sits in on the table.
*/
const screenClass =
  'bg-deep-space fixed inset-x-0 top-0 z-40 flex h-[100dvh] touch-manipulation flex-col overflow-hidden pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]';

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
 * Clearance for the chrome row that runs into the match clock.
 *
 * Four seats laid flat form a two by two board, so the middle of the screen is
 * the inner corner of every card and the dial covers whatever sits there. Each
 * seat pushes the row that owns that corner clear of it. Held upright the seats
 * stack into one column and the corner is nowhere near the middle, so the
 * clearance is landscape-only.
 */
function clockClearance(
  count: number,
  index: number,
  row: 'top' | 'bottom',
): string {
  if (count !== 4) {
    return '';
  }
  // The two seats along the top of the board meet the dial with their bottom
  // corners, the two along the bottom with their top ones.
  const meets = index < 2 ? 'bottom' : 'top';
  if (row !== meets) {
    return '';
  }
  // Left-hand seats meet it on their right, right-hand seats on their left.
  return index % 2 === 0 ? 'landscape:pr-7' : 'landscape:pl-7';
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
  startingPlayerId,
  onCheckRole,
  revealedIdentities = {},
}: Props) {
  const initial = useMemo<TrackerHistory>(
    () => ({ present: restore(storageKey, players, persist), past: [] }),
    [storageKey, players, persist],
  );
  const [{ present: state, past }, dispatch] = useReducer(
    reduceHistory,
    initial,
  );
  const [dungeonPlayerId, setDungeonPlayerId] = useState<string | null>(null);
  const [commanderPlayerId, setCommanderPlayerId] = useState<string | null>(
    null,
  );
  const [counterPlayerId, setCounterPlayerId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
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
  const attemptedChallenges = useRef(new Set<string>());
  const landscape = useLandscape();
  useLandscapeLock();
  usePreloadedEliminatedArt();
  const elapsed = useMatchClock(state);
  const spotlight = useFirstPlayerSpotlight(state, past.length);
  const winner = state.players.find((row) => row.id === state.winnerId) ?? null;
  const confirmation = detectedConfirmation(state, challengePack);

  useEffect(() => {
    if (!onChallengeComplete) {
      return;
    }
    for (const detected of detectAutomaticChallenges(state, challengePack)) {
      const key = `${detected.participantId}:${detected.challenge.id}`;
      const completed =
        challengeProgress[
          detected.participantId
        ]?.completedChallengeIds.includes(detected.challenge.id) ?? false;
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
              : 'Could not save challenge progress.',
          );
        })
        .finally(() => setChallengeSaving((count) => Math.max(0, count - 1)));
    }
  }, [challengePack, challengeProgress, onChallengeComplete, state]);

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
    setChallengesOpen(false);
    setCommanderPlayerId(null);
    setCounterPlayerId(null);
    setDungeonPlayerId(null);
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
      sessionStorage.removeItem(storageKey);
    } catch (caught) {
      setFinishError(
        caught instanceof Error ? caught.message : 'Could not submit the result.',
      );
      setFinishing(false);
    }
  }

  useEffect(() => {
    if (!persist) {
      sessionStorage.removeItem(storageKey);
      return;
    }
    sessionStorage.setItem(storageKey, JSON.stringify(state));
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
      !challengesOpen
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
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [
    challengesOpen,
    commanderPlayer,
    counterPlayer,
    dungeonPlayer,
    menuOpen,
  ]);

  if (!state.firstPlayerId) {
    return (
      <section className={cx(screenClass, 'items-center justify-center')}>
        <Button
          variant="neon"
          size="lg"
          className="h-16 min-w-48 text-xl"
          disabled={gameMode === 'treachery' && !startingPlayerId}
          onClick={() => dispatch({ type: 'first', playerId: startingPlayerId })}
        >
          {gameMode === 'treachery' && !startingPlayerId
            ? 'Loading roles…'
            : 'Start'}
        </Button>
      </section>
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
        className={cx(
          'grid min-h-0 flex-1 auto-rows-fr gap-2',
          seatGridClass(state.players.length),
        )}
      >
        {state.players.map((player, index) => (
          <article
            key={player.id}
            className={cx(
              'border-muted/20 relative flex min-h-0 flex-col overflow-hidden rounded-xl border p-2 transition-transform duration-200',
              player.eliminated ? 'opacity-50' : 'bg-ink/[0.03]',
              player.id === spotlight.playerId && spotlightCard,
              player.id === spotlight.playerId &&
                (spotlight.phase === 'sweep'
                  ? spotlightSweep
                  : spotlightLanded[spotlight.phase]),
            )}
          >
            <CommanderArt
              commanders={player.commanders}
              eliminated={player.eliminated}
            />
            {player.id === spotlight.playerId ? (
              <span aria-hidden className={spotlightWash} />
            ) : null}
            <div
              className={cx(
                'relative z-10 flex shrink-0 items-start justify-between gap-2',
                clockClearance(state.players.length, index, 'top'),
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
                  onOpen={() => setCounterPlayerId(player.id)}
                />
              </span>
              <span className="flex shrink-0 flex-wrap justify-end gap-1">
                {revealedIdentities[player.id] ? (
                  <button
                    type="button"
                    className="border-warning/50 bg-warning/15 text-warning rounded-full border px-2 py-0.5 text-[0.65rem] font-bold"
                    onClick={() => setPublicIdentityPlayerId(player.id)}
                  >
                    {revealedIdentities[player.id]?.name}
                  </button>
                ) : null}
                {player.id === state.initiativeId ? (
                  <Badge tone="dev">
                    <Flag size={12} aria-hidden />
                  </Badge>
                ) : null}
                {player.id === state.winnerId ? (
                  <Badge tone="live">Winner</Badge>
                ) : null}
              </span>
            </div>

            {/*
              Life owns the card: it takes every pixel the rest leaves over.
              The buttons grow with the row up to their cap, and centring keeps
              them on the row's midline once the cap is reached instead of
              leaving them hanging from the top.
            */}
            <div className="relative z-10 flex min-h-0 flex-1 items-center gap-1.5 py-1">
              {[-5, -1].map((delta) => (
                <LifeButton
                  key={`life-${String(delta)}`}
                  delta={delta}
                  disabled={Boolean(state.winnerId)}
                  onClick={() =>
                    dispatch({
                      type: 'action',
                      action: { type: 'life', playerId: player.id, delta },
                    })
                  }
                />
              ))}
              <p
                className={cx(
                  'font-display text-neon flex min-w-0 flex-1 items-center justify-center self-stretch text-center text-[clamp(1.75rem,6.5vh,3.25rem)] leading-none font-bold tabular-nums landscape:text-[clamp(1.75rem,11vh,3.25rem)]',
                  onArt,
                )}
              >
                {player.life}
              </p>
              {[1, 5].map((delta) => (
                <LifeButton
                  key={`life-${String(delta)}`}
                  delta={delta}
                  disabled={Boolean(state.winnerId)}
                  onClick={() =>
                    dispatch({
                      type: 'action',
                      action: { type: 'life', playerId: player.id, delta },
                    })
                  }
                />
              ))}
            </div>

            {/*
              Laid flat there is width to spare and no height to waste, so the
              counters and the icon strip share a single row.
            */}
            <div
              className={cx(
                'relative z-10 flex shrink-0 flex-col landscape:flex-row landscape:items-center landscape:gap-2',
                clockClearance(state.players.length, index, 'bottom'),
              )}
            >
              <div className="flex min-w-0 shrink-0 gap-1 overflow-x-auto [scrollbar-width:none] landscape:flex-1 [&::-webkit-scrollbar]:hidden">
                <IconButton
                  title={`Open counters for ${player.name}`}
                  disabled={Boolean(state.winnerId)}
                  onClick={() => setCounterPlayerId(player.id)}
                >
                  <SlidersHorizontal size={18} aria-hidden />
                </IconButton>
                <CommanderDamageChip
                  state={state}
                  player={player}
                  disabled={Boolean(state.winnerId)}
                  onOpen={() => setCommanderPlayerId(player.id)}
                />
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
                      ? `${player.name} is the monarch`
                      : `Make ${player.name} the monarch`
                  }
                  active={player.id === state.monarchId}
                  disabled={Boolean(state.winnerId)}
                  onClick={() =>
                    dispatch({
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
                    state.completedDungeons[player.id],
                  )}
                  active={player.id === state.initiativeId}
                  disabled={Boolean(state.winnerId)}
                  onClick={() => setDungeonPlayerId(player.id)}
                />
                <IconButton
                  title={`${player.name} ${player.enduringStory ? 'has' : 'does not have'} an enduring story`}
                  active={player.enduringStory}
                  disabled={Boolean(state.winnerId)}
                  onClick={() =>
                    dispatch({
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
                  title={`${player.name} ${player.cityBlessing ? 'has' : 'does not have'} the city's blessing`}
                  active={player.cityBlessing}
                  disabled={Boolean(state.winnerId)}
                  onClick={() =>
                    dispatch({
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
                aria-label={`Did ${player.name} lose the game?`}
                className="bg-void/90 absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 overflow-auto rounded-xl p-4 text-center backdrop-blur-sm"
              >
                <p className="font-display text-base font-semibold">
                  {lossPrompt(player, state)}
                </p>
                <p className="text-muted text-xs">
                  Effects like Platinum Angel or Phyrexian Unlife can keep a
                  player in the game.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      dispatch({
                        type: 'action',
                        action: { type: 'confirmLoss', playerId: player.id },
                      })
                    }
                  >
                    Yes, they lost
                  </Button>
                  <Button
                    size="sm"
                    variant="glass"
                    onClick={() =>
                      dispatch({
                        type: 'action',
                        action: { type: 'declineLoss', playerId: player.id },
                      })
                    }
                  >
                    No, still in
                  </Button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {/*
        The clock rides the seam between the seats, which is the one piece of
        the board no seat owns and the one place every player can reach. It is
        also the only match-wide control left on this screen, so it doubles as
        the way into the menu behind it.
      */}
      <button
        type="button"
        title="Match menu"
        aria-label={`Match menu. ${formatClock(elapsed)} elapsed${state.pausedAt ? ', paused' : ''}${state.dayNight ? `, it is ${state.dayNight}` : ''}`}
        onClick={() => {
          setMenuOpen(true);
        }}
        className={cx(
          plate,
          'hover:border-neon/50 absolute top-1/2 left-1/2 z-20 flex size-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-full border font-mono shadow-[0_10px_30px_-8px_var(--color-void)] transition',
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
      {/*
        Where the browser lets go of the orientation the board turns itself, so
        this only ever shows on a phone that refused — every iPhone, which has
        neither the lock nor the manifest's orientation. It cannot be tapped, so
        it never costs a life total, and it leaves the moment the phone turns.
      */}
      {landscape ? null : (
        <p className="text-muted bg-void/70 pointer-events-none absolute inset-x-0 bottom-1 z-30 mx-auto flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.65rem]">
          <RotateCw size={12} aria-hidden />
          Turn your phone for the full board
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
      {state.players.map((seat) => {
        const open = commanderPlayerId === seat.id;
        return createPortal(
          <div
            role="dialog"
            aria-modal={open}
            aria-hidden={!open}
            inert={!open}
            aria-label={`Commander damage on ${seat.name}`}
            className={cx(
              'bg-void/95 fixed inset-x-0 top-0 flex h-[100dvh] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] backdrop-blur-sm',
              open ? 'z-50' : 'pointer-events-none z-30',
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
              dispatch={(action) => dispatch({ type: 'action', action })}
              onClose={() => setCommanderPlayerId(null)}
            />
          </div>,
          document.body,
          seat.id,
        );
      })}
      {counterPlayer
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Counters for ${counterPlayer.name}`}
              className="bg-void/95 fixed inset-x-0 top-0 z-50 flex h-[100dvh] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] backdrop-blur-sm"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setCounterPlayerId(null);
                }
              }}
            >
              <CounterSheet
                player={counterPlayer}
                disabled={Boolean(state.winnerId)}
                dispatch={(action) => dispatch({ type: 'action', action })}
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
              aria-label="Match menu"
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
                dispatch={(action) => dispatch({ type: 'action', action })}
                onUndo={() => {
                  dispatch({ type: 'undo' });
                }}
                onFinish={finish}
                onQuit={onQuit}
                onCheckRole={onCheckRole}
                onChallenges={() => {
                  setMenuOpen(false);
                  setChallengesOpen(true);
                }}
                onClose={() => setMenuOpen(false)}
              />
            </div>,
            document.body,
          )
        : null}
      {publicIdentityPlayerId && revealedIdentities[publicIdentityPlayerId]
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Revealed Treachery identity"
              className="bg-void/90 fixed inset-0 z-[80] flex items-center justify-center p-4 backdrop-blur-md"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setPublicIdentityPlayerId(null);
                }
              }}
            >
              <section className="relative max-h-full max-w-md">
                <img
                  src={revealedIdentities[publicIdentityPlayerId].image}
                  alt={revealedIdentities[publicIdentityPlayerId].name}
                  className="max-h-[90dvh] max-w-full rounded-xl shadow-2xl"
                />
                <button
                  type="button"
                  aria-label="Close revealed identity"
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
              aria-label="Commander challenges"
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
                        `${challenge?.name ?? 'Challenge'} completed`,
                      );
                    }
                  } catch (caught) {
                    setChallengeError(
                      caught instanceof Error
                        ? caught.message
                        : 'Could not save challenge progress.',
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
              aria-label={`Dungeon for ${dungeonPlayer.name}`}
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
                dispatch={(action) => dispatch({ type: 'action', action })}
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
              aria-label="Match result"
              className="bg-void/70 fixed inset-x-0 top-0 z-[60] flex h-[100dvh] items-center justify-center p-3 backdrop-blur-sm"
            >
              <section className="border-warning/40 bg-hull/95 w-full max-w-xs rounded-2xl border p-4 text-center shadow-[0_18px_50px_-24px_var(--color-void)]">
                <Trophy
                  size={26}
                  aria-hidden
                  className="text-warning fill-warning/30 mx-auto mb-2"
                />
                <h2 className="font-display truncate text-lg leading-tight font-bold">
                  {winner.name} wins
                </h2>
                <p className="text-muted mb-3 font-mono text-sm tabular-nums">
                  {formatClock(elapsed)}
                </p>
                {confirmation &&
                !(challengeProgress[
                  confirmation.participantId
                ]?.completedChallengeIds.includes(
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
                                  `${confirmation.challenge.name} completed`,
                                );
                              }
                            })
                            .catch((caught: unknown) => {
                              attemptedChallenges.current.delete(key);
                              setChallengeError(
                                caught instanceof Error
                                  ? caught.message
                                  : 'Could not save challenge progress.',
                              );
                            })
                            .finally(() =>
                              setChallengeSaving((count) =>
                                Math.max(0, count - 1),
                              ),
                            );
                        }}
                      >
                        Yes
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
                        No
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
                      ? 'Submitting…'
                      : challengeSaving > 0
                        ? 'Saving challenges…'
                        : 'Done & requeue'}
                  </Button>
                  {past.length > 0 ? (
                    <Button
                      variant="glass"
                      size="sm"
                      onClick={() => {
                        dispatch({ type: 'undo' });
                      }}
                    >
                      <Undo2 size={14} aria-hidden />
                      Undo
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setResultHidden(true)}
                  >
                    Review board
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
 * holds steady until the pod touches anything, on the grounds that the first tap
 * means the table has read it and the board has better uses for the light.
 * `moves` is the history depth, which is the cheapest signal that something on
 * the board actually changed.
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
        state.players.map((row) => row.id),
        state.firstPlayerId,
      ),
    );
  }, [moves, state.firstPlayerId, state.players]);

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
  dispatch,
  onUndo,
  onFinish,
  onQuit,
  onCheckRole,
  onChallenges,
  onClose,
}: {
  state: TrackerState;
  elapsed: number;
  canUndo: boolean;
  dispatch: (action: TrackerAction) => void;
  onUndo: () => void;
  onFinish: () => Promise<void>;
  onQuit: () => void;
  onCheckRole?: () => void;
  onChallenges: () => void;
  onClose: () => void;
}) {
  const paused = Boolean(state.pausedAt);
  const decided = Boolean(state.winnerId);
  const winner = state.players.find((row) => row.id === state.winnerId) ?? null;
  return (
    <section className="flex h-full w-full flex-col">
      <header className="mb-1 flex shrink-0 items-center justify-between gap-3">
        <h4 className="font-display truncate text-sm leading-tight font-bold">
          Match
        </h4>
        <button
          type="button"
          aria-label="Close match menu"
          onClick={onClose}
          className="border-muted/25 text-muted hover:text-ink hover:border-muted/50 flex size-8 shrink-0 items-center justify-center rounded-full border transition"
        >
          <X size={18} aria-hidden />
        </button>
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
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button size="sm" variant="glass" disabled={!canUndo} onClick={onUndo}>
            <Undo2 size={14} aria-hidden />
            Undo
          </Button>
          <Button size="sm" variant="glass" onClick={onChallenges}>
            <Sparkles size={14} aria-hidden />
            Challenges
          </Button>
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
              Check my role
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
            Day
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
            Night
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
            Player lost
          </span>
          {state.players.map((seat) => (
            <Button
              key={seat.id}
              size="sm"
              variant="glass"
              disabled={decided || seat.eliminated}
              onClick={() => {
                dispatch({ type: 'eliminate', playerId: seat.id });
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
            {winner ? `${winner.name} won` : 'Game won by'}
          </span>
          {state.players.map((seat) => (
            <Button
              key={seat.id}
              size="sm"
              variant={seat.id === state.winnerId ? 'neon' : 'glass'}
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
              Done & requeue
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
            Quit to home
          </Button>
          <p className="text-muted text-center text-[0.65rem]">
            The game is kept — reopen it from the home screen.
          </p>
        </div>
      </div>
    </section>
  );
}

function LifeButton({
  delta,
  disabled,
  onClick,
}: {
  delta: number;
  disabled: boolean;
  onClick: () => void;
}) {
  const single = Math.abs(delta) === 1;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`${delta > 0 ? 'Add' : 'Remove'} ${String(Math.abs(delta))} life`}
      className={cx(
        'font-display flex h-full max-h-16 min-h-9 shrink-0 items-center justify-center rounded-xl border font-bold transition select-none disabled:opacity-40',
        single
          ? cx(plateAccent, 'border-neon/50 text-neon w-12 text-lg')
          : cx(plate, 'border-muted/25 text-muted hover:text-ink hover:border-muted/45 w-10 text-sm'),
      )}
    >
      {delta > 0 ? `+${String(delta)}` : String(delta)}
    </button>
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
        title={`Lower ${label}`}
        aria-label={`Lower ${label}`}
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
        title={`Raise ${label}`}
        aria-label={`Raise ${label}`}
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

/*
  Poison and the commander tax have fields of their own, but on screen they are
  counters like any other, so one table feeds both the sheet and the badges and
  the two cannot drift apart.
*/
const PLAYER_COUNTERS: CounterDefinition[] = [
  {
    id: 'poison',
    label: 'Poison',
    danger: { warn: POISON_LIMIT - 3, alert: POISON_LIMIT },
    icon: (size) => <Skull size={size} aria-hidden />,
  },
  {
    id: 'tax',
    label: 'Commander tax',
    step: COMMANDER_TAX_STEP,
    icon: (size) => <Coins size={size} aria-hidden />,
  },
  {
    id: 'acorn',
    label: 'Acorns',
    icon: (size) => <Nut size={size} aria-hidden />,
  },
  {
    id: 'energy',
    label: 'Energy',
    icon: (size) => <Zap size={size} aria-hidden />,
  },
  {
    id: 'experience',
    label: 'Experience',
    icon: (size) => <Award size={size} aria-hidden />,
  },
  {
    id: 'hit',
    label: 'Etrata hits',
    maximum: HIT_LIMIT,
    danger: { warn: HIT_LIMIT - 1, alert: HIT_LIMIT },
    icon: (size) => <Crosshair size={size} aria-hidden />,
  },
  {
    id: 'rad',
    label: 'Radiation',
    icon: (size) => <Radiation size={size} aria-hidden />,
  },
  {
    id: 'ring',
    label: 'Ring temptation',
    maximum: 4,
    icon: (size) => <RingIcon size={size} />,
  },
  {
    id: 'speed',
    label: 'Speed',
    maximum: 4,
    icon: (size) => <Gauge size={size} aria-hidden />,
  },
  {
    id: 'ticket',
    label: 'Tickets',
    icon: (size) => <Ticket size={size} aria-hidden />,
  },
];

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
): { definition: CounterDefinition; value: number; tone: string }[] {
  return PLAYER_COUNTERS.map((definition) => ({
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
}: {
  player: TrackerPlayer;
  disabled: boolean;
  onOpen: () => void;
}) {
  return (
    <>
      {heldCounters(player).map(({ definition, value, tone }) => (
        <button
          key={definition.id}
          type="button"
          title={`${definition.label} on ${player.name}: ${String(value)}`}
          aria-label={`${definition.label} on ${player.name}: ${String(value)}`}
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
  return (
    <section className="flex h-full w-full flex-col">
      <header className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-display truncate text-sm font-bold">
            {pack.name}
          </h4>
          <p className="text-muted truncate text-[0.65rem]">
            Same challenges for every player · points never affect matching
          </p>
        </div>
        <button
          type="button"
          aria-label="Close challenges"
          onClick={onClose}
          className="border-muted/25 text-muted hover:text-ink flex size-8 shrink-0 items-center justify-center rounded-full border"
        >
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="mb-2 flex shrink-0 flex-wrap gap-1.5">
        {players.map((player) => (
          <Badge key={player.id}>
            {player.name} · {String(progress[player.id]?.points ?? 0)} pts
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
                    Claim for {player.name}
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
}: {
  player: TrackerPlayer;
  disabled: boolean;
  dispatch: (action: TrackerAction) => void;
  onClose: () => void;
}) {
  return (
    <section className="flex h-full w-full flex-col">
      <header className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <h4 className="font-display truncate text-sm leading-tight font-bold">
          Counters for {player.name}
        </h4>
        <button
          type="button"
          aria-label="Close counters"
          onClick={onClose}
          className="border-muted/25 text-muted hover:text-ink hover:border-muted/50 flex size-8 shrink-0 items-center justify-center rounded-full border transition"
        >
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-2 content-center gap-2 overflow-y-auto landscape:grid-cols-4">
        {PLAYER_COUNTERS.map((counter) => (
          <CounterCard key={counter.id} label={counter.label}>
            <Counter
              label={`${counter.label.toLowerCase()} for ${player.name}`}
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
  const worst = worstCommanderDamage(state, player);
  const value = worst?.value ?? 0;
  return (
    <Chip
      title={
        worst
          ? `Highest commander damage on ${player.name}: ${String(value)} from ${worst.commander}`
          : `No commander damage on ${player.name}`
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
  const filled = Math.min(completed, DUNGEON_COUNT);
  const title = `${name} has completed ${String(filled)} of ${String(DUNGEON_COUNT)} unique dungeons`;
  return (
    <button
      type="button"
      title={title}
      aria-label={`Dungeon and initiative for ${name}. ${title}`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex min-h-9 w-9 flex-col items-center justify-center gap-0.5 rounded-lg border py-0.5 transition disabled:opacity-40',
        active
          ? cx(plateAccent, 'border-neon/60 text-neon')
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
              index < filled ? 'bg-neon' : 'bg-muted/35',
            )}
          />
        ))}
      </span>
    </button>
  );
}

function lossPrompt(player: TrackerPlayer, state: TrackerState): string {
  const cause = player.pendingLoss;
  if (cause?.type === 'poison') {
    return `${player.name} has ${String(player.poison)} poison counters. Did they lose?`;
  }
  if (cause?.type === 'hit') {
    return `${player.name} owns ${String(player.counters.hit)} exiled cards with hit counters. Did they lose?`;
  }
  if (cause?.type === 'commander') {
    const source = commanderById(state, cause.commanderId);
    const damage = player.commanderDamage[cause.commanderId] ?? 0;
    const from =
      source == null
        ? 'another commander'
        : source.commander.name === source.owner.name
          ? source.owner.name
          : `${source.owner.name}'s ${source.commander.name}`;
    return `${player.name} has taken ${String(damage)} commander damage from ${from}. Did they lose?`;
  }
  return `${player.name} is at ${String(player.life)} life. Did they lose?`;
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
  const opponents = state.players.filter((other) => other.id !== player.id);
  return (
    <section className="flex h-full w-full flex-col">
      <header className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <h4 className="font-display truncate text-sm leading-tight font-bold">
          Commander damage on {player.name}
        </h4>
        <button
          type="button"
          aria-label="Close commander damage"
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
          aria-label={`Remove commander damage from ${owner}'s ${name}`}
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
          aria-label={`Add commander damage from ${owner}'s ${name}`}
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
): TrackerState {
  if (!persist) {
    sessionStorage.removeItem(storageKey);
    return createTracker(players);
  }
  const raw = sessionStorage.getItem(storageKey);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as TrackerState;
      if (parsed.players?.length === players.length) {
        return {
          ...parsed,
          dayNight: parsed.dayNight ?? null,
          dungeons: parsed.dungeons ?? {},
          completedDungeons: normalizeCompletedDungeons(
            parsed.completedDungeons,
          ),
          eliminations: parsed.eliminations ?? [],
          players: parsed.players.map((player) =>
            normalizePlayer(player, parsed.players),
          ),
        };
      }
    } catch {
      /* start fresh */
    }
  }
  return createTracker(players);
}

function normalizePlayer(
  player: TrackerPlayer,
  roster: TrackerPlayer[],
): TrackerPlayer {
  const commanders =
    player.commanders?.length > 0
      ? player.commanders
      : defaultCommanders(player.id, player.name);
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
