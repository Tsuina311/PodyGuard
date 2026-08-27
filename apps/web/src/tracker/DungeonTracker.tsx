import { useState, type ReactNode } from 'react';
import { Flag, Undo2, X } from 'lucide-react';
import {
  DUNGEONS,
  dungeonById,
  legalNextRoomIds,
  type DungeonRoom,
} from './dungeons';
import type { TrackerAction, TrackerState } from './engine';
import { useBoardLandscape } from './orientation';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';

type Props = {
  state: TrackerState;
  playerId: string;
  dispatch: (action: TrackerAction) => void;
  onClose: () => void;
};

/** Card scans are 488x680, so the whole map lives in that coordinate space. */
const CARD_W = 488;
const CARD_H = 680;

/*
  A phone on the table never faces everyone, so it gets turned constantly and
  the width is the space actually worth spending. A portrait card in a landscape
  viewport can only be as wide as the viewport is tall, which on a phone leaves
  the map about half the size it could be. Turning the card on its side trades
  the wasted margins for roughly double the map.
*/
export function DungeonTracker({ state, playerId, dispatch, onClose }: Props) {
  const { landscape } = useBoardLandscape();
  const progress = state.dungeons[playerId];
  const completedIds = new Set(state.completedDungeons[playerId] ?? []);
  const canStepBack = (progress?.visitedRoomIds.length ?? 0) > 1;
  const stepBack = canStepBack
    ? () => dispatch({ type: 'stepBackDungeon', playerId })
    : undefined;
  const holdsInitiative = state.initiativeId === playerId;
  /*
    Taking the initiative also opens Undercity when this seat is free to enter
    a dungeon. Ask first so a fat-finger tap does not silently seize it.
  */
  const [confirmInitiative, setConfirmInitiative] = useState(false);
  const willEnterUndercity = !progress || progress.completed;

  const takeInitiative = () => {
    dispatch({ type: 'initiative', playerId });
    setConfirmInitiative(false);
  };

  const initiative = {
    active: holdsInitiative,
    onToggle: () => {
      if (holdsInitiative) {
        dispatch({ type: 'initiative', playerId: null });
        return;
      }
      setConfirmInitiative(true);
    },
  };

  const confirmOverlay = confirmInitiative ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Take the initiative?"
      className="bg-void/90 absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 overflow-auto rounded-xl p-4 text-center backdrop-blur-sm"
    >
      <Flag
        size={28}
        aria-hidden
        className="text-warning fill-warning/35"
      />
      <p className="font-display text-base font-semibold">
        Take the initiative?
      </p>
      <p className="text-muted max-w-sm text-xs">
        {willEnterUndercity
          ? 'This also ventures into Undercity. Only take it when the table just gave this seat the initiative.'
          : 'Finish or leave the current dungeon before Undercity can open. Only take the initiative when the table just gave it to this seat.'}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button size="sm" variant="neon" onClick={takeInitiative}>
          Take initiative
          {willEnterUndercity ? ' & enter Undercity' : ''}
        </Button>
        <Button
          size="sm"
          variant="glass"
          onClick={() => setConfirmInitiative(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  ) : null;

  if (!progress || progress.completed) {
    return (
      <Shell initiative={initiative} onClose={onClose} onStepBack={stepBack}>
        <div className="relative grid min-h-0 flex-1 grid-cols-2 place-items-center gap-1 landscape:grid-cols-4">
          {DUNGEONS.map((dungeon) => {
            const isUndercity = dungeon.initiativeOnly;
            const lockedOut = isUndercity && holdsInitiative;
            return (
              <button
                key={dungeon.id}
                type="button"
                title={
                  isUndercity
                    ? holdsInitiative
                      ? 'You already hold the initiative'
                      : 'Take the initiative and enter Undercity'
                    : completedIds.has(dungeon.id)
                      ? `${dungeon.name} (completed)`
                      : `Venture into ${dungeon.name}`
                }
                className={cx(
                  'border-muted/20 relative aspect-[488/680] h-auto max-h-full w-full max-w-full min-h-0 overflow-hidden rounded-lg border transition',
                  isUndercity && !holdsInitiative
                    ? 'hover:border-warning/70 hover:shadow-[0_0_22px_-8px_var(--color-warning)]'
                    : lockedOut
                      ? 'cursor-default opacity-55'
                      : 'hover:border-neon/60 hover:shadow-[0_0_22px_-8px_var(--color-neon)]',
                  completedIds.has(dungeon.id) && 'border-amber-400/50',
                )}
                onClick={() => {
                  if (isUndercity) {
                    if (!holdsInitiative) {
                      setConfirmInitiative(true);
                    }
                    return;
                  }
                  dispatch({
                    type: 'enterDungeon',
                    playerId,
                    dungeonId: dungeon.id,
                  });
                }}
              >
                <img
                  src={dungeon.image}
                  alt={dungeon.name}
                  loading="lazy"
                  className="size-full object-cover"
                />
                {completedIds.has(dungeon.id) ? (
                  <span className="absolute top-1.5 right-1.5 rounded-full bg-amber-400/90 px-1.5 py-0.5 font-mono text-[0.6rem] font-bold text-void">
                    Done
                  </span>
                ) : null}
              </button>
            );
          })}
          {confirmOverlay}
        </div>
      </Shell>
    );
  }

  const dungeon = dungeonById(progress.dungeonId);
  const legal = new Set(legalNextRoomIds(progress));
  const visited = new Set(progress.visitedRoomIds);

  return (
    <Shell initiative={initiative} onClose={onClose} onStepBack={stepBack}>
      <div className="relative flex min-h-0 min-w-0 flex-1">
        {/*
          Card art and overlay share one viewBox, so the map stays aligned at any
          size and simply letterboxes into whatever space is available.
        */}
        <svg
          className="min-h-0 w-full min-w-0 flex-1"
          viewBox={
            landscape
              ? `0 0 ${String(CARD_H)} ${String(CARD_W)}`
              : `0 0 ${String(CARD_W)} ${String(CARD_H)}`
          }
          preserveAspectRatio="xMidYMid meet"
        >
          {/*
            Turned anticlockwise so the rooms still run in reading order: the top
            of the card becomes the left edge, and the dungeon flows rightwards.
          */}
          <g
            transform={
              landscape
                ? `translate(0 ${String(CARD_W)}) rotate(-90)`
                : undefined
            }
          >
            <image
              href={dungeon.image}
              x="0"
              y="0"
              width={CARD_W}
              height={CARD_H}
            />

            {dungeon.rooms.map((room) => {
              const isCurrent = room.id === progress.roomId;
              const isLegal = legal.has(room.id);
              const wasVisited = visited.has(room.id);
              const box = pixelRect(room);
              return (
                <rect
                  key={room.id}
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  rx="8"
                  fill={
                    isCurrent
                      ? '#fcd34d'
                      : isLegal
                        ? 'var(--color-neon)'
                        : wasVisited
                          ? 'var(--color-void)'
                          : 'transparent'
                  }
                  fillOpacity={
                    isCurrent ? 0.28 : isLegal ? 0.26 : wasVisited ? 0.35 : 0
                  }
                  stroke={
                    isCurrent
                      ? '#fde68a'
                      : isLegal
                        ? 'var(--color-neon)'
                        : 'transparent'
                  }
                  strokeWidth="3"
                  className={
                    isLegal
                      ? 'cursor-pointer outline-none focus-visible:stroke-[6px]'
                      : undefined
                  }
                  role={isLegal ? 'button' : undefined}
                  tabIndex={isLegal ? 0 : undefined}
                  aria-label={
                    isLegal
                      ? `Venture to ${room.name}: ${room.effect}`
                      : undefined
                  }
                  aria-current={isCurrent ? 'step' : undefined}
                  onClick={
                    isLegal
                      ? () =>
                          dispatch({
                            type: 'advanceDungeon',
                            playerId,
                            roomId: room.id,
                          })
                      : undefined
                  }
                  onKeyDown={
                    isLegal
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            dispatch({
                              type: 'advanceDungeon',
                              playerId,
                              roomId: room.id,
                            });
                          }
                        }
                      : undefined
                  }
                />
              );
            })}
          </g>
        </svg>
        {confirmOverlay}
      </div>
    </Shell>
  );
}

/*
  The card carries its own name, its rooms and their effects, so a title bar and
  a room list only repeat what a bigger picture already says. The controls drop
  to a thin strip along the bottom and everything above it belongs to the map.
*/
function Shell({
  initiative,
  onClose,
  onStepBack,
  children,
}: {
  initiative: { active: boolean; onToggle: () => void };
  onClose: () => void;
  onStepBack?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex h-full min-h-0 w-full items-stretch gap-2">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      {/*
        A column costs the map a button's width instead of a button's height,
        and height is what a card turned on its side is short of. It lands on
        the edge nearest the card's foot, within reach of the hand holding it.
      */}
      <div className="flex shrink-0 flex-col justify-end gap-2">
        <ControlButton
          label={
            initiative.active ? 'Release the initiative' : 'Take the initiative'
          }
          active={initiative.active}
          onClick={initiative.onToggle}
        >
          <Flag
            size={18}
            aria-hidden
            className={initiative.active ? 'fill-warning' : undefined}
          />
        </ControlButton>
        {onStepBack ? (
          <ControlButton label="Undo room" onClick={onStepBack}>
            <Undo2 size={18} aria-hidden />
          </ControlButton>
        ) : null}
        <ControlButton label="Close dungeon" onClick={onClose}>
          <X size={18} aria-hidden />
        </ControlButton>
      </div>
    </section>
  );
}

function ControlButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'flex size-10 shrink-0 items-center justify-center rounded-xl border transition',
        active
          ? 'border-warning/60 bg-[color-mix(in_oklab,var(--color-warning)_18%,var(--color-void))] text-warning shadow-[0_0_14px_-4px_var(--color-warning)]'
          : 'border-muted/25 bg-void/85 text-muted hover:border-muted/45 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function pixelRect(room: DungeonRoom) {
  return {
    x: (room.rect.x / 100) * CARD_W,
    y: (room.rect.y / 100) * CARD_H,
    w: (room.rect.w / 100) * CARD_W,
    h: (room.rect.h / 100) * CARD_H,
  };
}
