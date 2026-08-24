import type { ReactNode } from 'react';
import { Flag, Undo2, X } from 'lucide-react';
import {
  DUNGEONS,
  dungeonById,
  legalNextRoomIds,
  type DungeonRoom,
} from './dungeons';
import type { TrackerAction, TrackerState } from './engine';
import { useLandscape } from './orientation';
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
  const landscape = useLandscape();
  const progress = state.dungeons[playerId];
  const completedIds = new Set(state.completedDungeons[playerId] ?? []);
  const canStepBack = (progress?.visitedRoomIds.length ?? 0) > 1;
  const stepBack = canStepBack
    ? () => dispatch({ type: 'stepBackDungeon', playerId })
    : undefined;
  const initiative = {
    active: state.initiativeId === playerId,
    onTake: () => dispatch({ type: 'initiative', playerId }),
  };

  if (!progress || progress.completed) {
    return (
      <Shell initiative={initiative} onClose={onClose} onStepBack={stepBack}>
        {/*
          Laid flat the cards sit in one row. Width is the scarce axis either
          way, so a second row would only halve the height the cards already
          have to spare and shrink them. The gap and the frame stay hairline
          because every pixel taken from them is width the cards get back.
        */}
        <div className="grid min-h-0 flex-1 grid-cols-2 place-items-center gap-1 landscape:grid-cols-4">
          {DUNGEONS.map((dungeon) => (
            <button
              key={dungeon.id}
              type="button"
              disabled={dungeon.initiativeOnly}
              title={
                dungeon.initiativeOnly
                  ? 'Entered only by taking the initiative'
                  : completedIds.has(dungeon.id)
                    ? `${dungeon.name} (completed)`
                    : `Venture into ${dungeon.name}`
              }
              /*
                The button carries the card's own proportions, so it ends where
                the art ends instead of framing it in an empty panel. The cells
                are always narrower than they are tall, so width is what is
                pinned and the height follows.
              */
              className={cx(
                'border-muted/20 relative aspect-[488/680] h-auto max-h-full w-full max-w-full min-h-0 overflow-hidden rounded-lg border transition',
                dungeon.initiativeOnly
                  ? 'cursor-not-allowed opacity-40'
                  : 'hover:border-neon/60 hover:shadow-[0_0_22px_-8px_var(--color-neon)]',
                completedIds.has(dungeon.id) && 'border-amber-400/50',
              )}
              onClick={() =>
                dispatch({
                  type: 'enterDungeon',
                  playerId,
                  dungeonId: dungeon.id,
                })
              }
            >
              {/* The button already matches the scan, so this fills it exactly. */}
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
          ))}
        </div>
      </Shell>
    );
  }

  const dungeon = dungeonById(progress.dungeonId);
  const legal = new Set(legalNextRoomIds(progress));
  const visited = new Set(progress.visitedRoomIds);

  return (
    <Shell initiative={initiative} onClose={onClose} onStepBack={stepBack}>
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
  initiative: { active: boolean; onTake: () => void };
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
            initiative.active ? 'Has the initiative' : 'Take the initiative'
          }
          active={initiative.active}
          onClick={initiative.onTake}
        >
          <Flag size={18} aria-hidden />
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
          ? 'border-neon/60 bg-[color-mix(in_oklab,var(--color-neon)_18%,var(--color-void))] text-neon'
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
