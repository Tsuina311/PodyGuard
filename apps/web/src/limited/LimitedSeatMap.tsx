import { Check, Plus, UserRound } from 'lucide-react';
import { cx } from '../ui/cx';

export type LimitedSeatLayout = 'square' | 'long';

const SQUARE: Record<number, number[][]> = {
  4: [
    [0, 1, 0],
    [4, 0, 2],
    [0, 3, 0],
  ],
  8: [
    [8, 1, 2],
    [7, 0, 3],
    [6, 5, 4],
  ],
};

export function LimitedSeatMap({
  shape,
  seatCount,
  occupants,
  selfId,
  disabled,
  layout = 'square',
  onLayout,
  onPick,
}: {
  shape?: import('@podyguard/shared').TableShape;
  seatCount: number;
  occupants: Array<{ participantId: string; displayName: string; seat: number }>;
  selfId: string;
  disabled?: boolean;
  layout?: LimitedSeatLayout;
  onLayout?: (layout: LimitedSeatLayout) => void;
  onPick: (seat: number) => void;
}) {
  const bySeat = new Map(occupants.map((row) => [row.seat, row]));
  const hasSeat = occupants.some((row) => row.participantId === selfId);
  const square = SQUARE[seatCount];
  const long = seatCount === 4 && layout === 'long';

  function chair(seat: number) {
    const person = bySeat.get(seat);
    const mine = person?.participantId === selfId;
    const Icon = mine ? Check : person ? UserRound : Plus;
    const label = person?.displayName ?? 'Open';
    return (
      <button
        key={seat}
        type="button"
        disabled={disabled || Boolean(person && !hasSeat)}
        aria-label={`Seat ${seat} ${label}`}
        aria-pressed={mine}
        onClick={() => onPick(seat)}
        className={cx(
          'flex min-h-16 min-w-16 flex-col items-center justify-center rounded-xl border px-2 py-2 text-center text-xs font-semibold transition-colors disabled:cursor-default',
          mine
            ? 'border-neon bg-neon/15 text-ink ring-2 ring-neon/40'
            : person
              ? 'border-muted/35 bg-ink/5 text-muted enabled:hover:border-muted'
              : 'border-gain/75 bg-gain/15 text-ink enabled:hover:bg-gain/25',
        )}
      >
        <span className="font-mono text-[0.65rem] uppercase tracking-widest">
          Seat {seat}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-1">
          <Icon size={13} aria-hidden className={cx('shrink-0', !person && 'text-gain')} />
          <span className="max-w-16 truncate">{label}</span>
        </span>
      </button>
    );
  }

  return (
    <div>
      {!shape && seatCount === 4 && onLayout ? (
        <div className="mb-3 flex justify-center gap-2">
          <LayoutButton
            selected={layout !== 'long'}
            disabled={disabled}
            onClick={() => onLayout('square')}
          >
            Square
          </LayoutButton>
          <LayoutButton
            selected={layout === 'long'}
            disabled={disabled}
            onClick={() => onLayout('long')}
          >
            Long table
          </LayoutButton>
        </div>
      ) : null}
      <p className="text-muted mb-3 text-center text-xs">
        {long
          ? 'Two players sit across from two. You play the person in front of you first.'
          : seatCount === 4
            ? 'One player on each side. You play the person opposite you first.'
            : seatCount === 8
              ? 'Pick a seat. Round 1 is against the player across from you.'
              : 'Tap a seat. You can swap once you have a chair.'}
      </p>
      {shape ? (
        <div className="relative mx-auto h-80 w-full max-w-sm">
          <div className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center border border-neon/40 bg-neon/5 text-xs text-muted ${shape === 'round' ? 'size-24 rounded-full' : shape === 'rectangle' ? 'h-20 w-36 rounded-xl' : 'size-24 rounded-xl'}`}>Table</div>
          {Array.from({ length: seatCount }, (_, index) => {
            const angle = index * 2 * Math.PI / seatCount - Math.PI / 2;
            return <div key={index} className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${50 + 37 * Math.cos(angle)}%`, top: `${50 + 38 * Math.sin(angle)}%` }}>{chair(index + 1)}</div>;
          })}
        </div>
      ) : long ? (
        <div className="mx-auto flex w-full max-w-xs flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">{chair(1)}{chair(2)}</div>
          <div className="border-muted/30 text-muted mx-4 flex h-8 items-center justify-center rounded-full border text-[0.65rem] uppercase tracking-widest">
            Table
          </div>
          <div className="grid grid-cols-2 gap-2">{chair(3)}{chair(4)}</div>
        </div>
      ) : square ? (
        <div className="mx-auto grid w-full max-w-sm gap-2">
          {square.map((row, rowIndex) => (
            <div
              key={rowIndex}
              className="grid grid-cols-3 items-center justify-items-center gap-2"
            >
              {row.map((seat, column) =>
                seat === 0 ? (
                  <div
                    key={`${rowIndex}-${column}`}
                    className={
                      rowIndex === 1 && column === 1
                        ? 'border-muted/30 text-muted flex size-16 items-center justify-center rounded-full border text-[0.65rem] uppercase tracking-widest'
                        : 'size-16'
                    }
                  >
                    {rowIndex === 1 && column === 1 ? 'Table' : null}
                  </div>
                ) : (
                  chair(seat)
                ),
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-2">
          {Array.from({ length: seatCount }, (_, index) => chair(index + 1))}
        </div>
      )}
    </div>
  );
}

function LayoutButton({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
        selected ? 'border-neon text-neon' : 'border-muted/20 text-muted'
      }`}
    >
      {children}
    </button>
  );
}
