import { useEffect, useMemo, useReducer, useState } from 'react';
import { createPortal } from 'react-dom';
import { Coins, Crown, Flag, Minus, Plus, Shield, Skull, X } from 'lucide-react';
import {
  applyTrackerAction,
  commanderById,
  createTracker,
  defaultCommanders,
  pickFirstPlayer,
  primaryCommanderId,
  uniqueCompletedDungeonCount,
  worstCommanderDamage,
  type Commander,
  type TrackerSeed,
  type TrackerAction,
  type TrackerPlayer,
  type TrackerState,
} from './engine';
import { DUNGEON_COUNT } from './dungeons';
import { DungeonTracker } from './DungeonTracker';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { DungeonIcon } from '../ui/DungeonIcon';
import { cx } from '../ui/cx';

type Props = {
  storageKey: string;
  players: TrackerSeed[];
  /** When false, ignore stored snapshots so a reload is always a new game. */
  persist?: boolean;
};

/*
  Fixed to the dynamic viewport so mobile browser chrome cannot push the last
  card out of reach. The side padding honours landscape notch insets, which is
  the orientation a phone sits in on the table.
*/
const screenClass =
  'bg-deep-space fixed inset-x-0 top-0 z-40 flex h-[100dvh] flex-col overflow-hidden pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]';

/*
  Every control sits on top of commander art, so it needs its own plate. A
  translucent wash lets the picture bleed through and costs the icons their
  contrast, so these stay near-opaque and mix the accent into the base colour
  instead of layering a tint over it. Both read correctly in either theme.
*/
const plate = 'bg-void/85';
const plateAccent =
  'bg-[color-mix(in_oklab,var(--color-neon)_18%,var(--color-void))]';

/* Art shows through more than text can survive on its own. */
const onArt = '[text-shadow:0_2px_14px_var(--color-void)]';

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
}: Props) {
  const initial = useMemo(
    () => restore(storageKey, players, persist),
    [storageKey, players, persist],
  );
  const [state, dispatch] = useReducer(reduce, initial);
  const [dungeonPlayerId, setDungeonPlayerId] = useState<string | null>(null);
  const [commanderPlayerId, setCommanderPlayerId] = useState<string | null>(
    null,
  );
  usePreloadedEliminatedArt();

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

  useEffect(() => {
    if (!dungeonPlayer && !commanderPlayer) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setDungeonPlayerId(null);
        setCommanderPlayerId(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [commanderPlayer, dungeonPlayer]);

  if (!state.firstPlayerId) {
    return (
      <section className={cx(screenClass, 'items-center justify-center')}>
        <Button
          variant="neon"
          size="lg"
          className="h-16 min-w-48 text-xl"
          onClick={() => dispatch({ type: 'first' })}
        >
          Start
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
        {state.players.map((player) => (
          <article
            key={player.id}
            className={cx(
              'border-muted/20 relative flex min-h-0 flex-col overflow-hidden rounded-xl border p-2',
              player.eliminated ? 'opacity-50' : 'bg-ink/[0.03]',
            )}
          >
            <CommanderArt
              commanders={player.commanders}
              eliminated={player.eliminated}
            />
            <div className="relative z-10 flex shrink-0 items-start justify-between gap-2">
              <h3 className={cx('font-display truncate text-sm font-semibold', onArt)}>
                {player.name}
              </h3>
              <span className="flex flex-wrap justify-end gap-1">
                {player.id === state.firstPlayerId ? (
                  <Badge tone="idle">1st</Badge>
                ) : null}
                {player.id === state.monarchId ? (
                  <Badge tone="crown">
                    <Crown size={12} aria-hidden />
                  </Badge>
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

            {/* Life owns the card: it takes every pixel the rest leaves over. */}
            <div className="relative z-10 flex min-h-0 flex-1 items-stretch gap-1.5 py-1">
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
                  'font-display text-neon flex min-w-0 flex-1 items-center justify-center text-center text-[clamp(1.75rem,6.5vh,3.25rem)] leading-none font-bold tabular-nums landscape:text-[clamp(1.75rem,11vh,3.25rem)]',
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
            <div className="relative z-10 flex shrink-0 flex-col landscape:flex-row landscape:items-center landscape:gap-2">
              <div className="flex min-w-0 shrink-0 gap-1 overflow-x-auto [scrollbar-width:none] landscape:flex-1 [&::-webkit-scrollbar]:hidden">
                <Counter
                  label={`poison on ${player.name}`}
                  value={player.poison}
                  disabled={Boolean(state.winnerId)}
                  onChange={(delta) =>
                    dispatch({
                      type: 'action',
                      action: { type: 'poison', playerId: player.id, delta },
                    })
                  }
                >
                  <Skull size={14} aria-hidden />
                </Counter>
                <Counter
                  label={`commander tax for ${player.name}`}
                  value={player.commanderTax}
                  step={COMMANDER_TAX_STEP}
                  disabled={Boolean(state.winnerId)}
                  onChange={(delta) =>
                    dispatch({
                      type: 'action',
                      action: { type: 'tax', playerId: player.id, delta },
                    })
                  }
                >
                  <Coins size={14} aria-hidden />
                </Counter>
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
              </div>
            </div>
            {player.pendingLoss ? (
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`Did ${player.name} lose the game?`}
                className="bg-void/90 absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 overflow-auto rounded-xl p-4 text-center backdrop-blur-sm"
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
      {dungeonPlayer
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Dungeon for ${dungeonPlayer.name}`}
              className="bg-void/95 fixed inset-x-0 top-0 z-50 flex h-[100dvh] p-3 backdrop-blur-sm"
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
        'border-muted/25 hover:border-neon/50 flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-xs transition disabled:opacity-40',
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
  disabled,
  onChange,
  children,
}: {
  label: string;
  value: number;
  step?: number;
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
        disabled={disabled}
        onClick={() => onChange(step)}
        className="hover:text-neon flex items-center px-1.5 py-1 transition disabled:opacity-30"
      >
        <Plus size={12} aria-hidden />
      </button>
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
          ? cx(plateAccent, 'border-neon/60 text-neon')
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
  subject's head high, and an even crop decapitates it.
*/
function CommanderArt({
  commanders,
  eliminated,
}: {
  commanders: Commander[];
  eliminated: boolean;
}) {
  const art = eliminated
    ? [{ id: 'eliminated', artCropUri: ELIMINATED_ART }]
    : commanders.filter((commander) => commander.artCropUri);
  if (art.length === 0) {
    return null;
  }
  return (
    <div className="absolute inset-0 z-0" aria-hidden>
      <div className="flex size-full gap-px">
        {art.map((commander) => (
          <img
            key={commander.id}
            src={commander.artCropUri}
            alt=""
            decoding="sync"
            className="min-w-0 flex-1 object-[center_15%] object-cover"
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

type Msg =
  | { type: 'action'; action: TrackerAction }
  | { type: 'first' };

function reduce(state: TrackerState, message: Msg): TrackerState {
  if (message.type === 'first') {
    return pickFirstPlayer(state);
  }
  return applyTrackerAction(state, message.action);
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
