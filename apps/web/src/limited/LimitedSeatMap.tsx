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
  seatCount,
  occupants,
  selfId,
  disabled,
  layout = 'square',
  onLayout,
  onPick,
}: {
  seatCount: number;
  occupants: Array<{ participantId: string; displayName: string; seat: number }>;
  selfId: string;
  disabled?: boolean;
  layout?: LimitedSeatLayout;
  onLayout?: (layout: LimitedSeatLayout) => void;
  onPick: (seat: number) => void;
}) {
  const bySeat = new Map(occupants.map((row) => [row.seat, row]));
  const square = SQUARE[seatCount];
  const long = seatCount === 4 && layout === 'long';

  function chair(seat: number) {
    const person = bySeat.get(seat);
    const mine = person?.participantId === selfId;
    return (
      <button
        key={seat}
        type="button"
        disabled={disabled}
        onClick={() => onPick(seat)}
        className={`flex min-h-16 min-w-16 flex-col items-center justify-center rounded-xl border px-2 py-2 text-center text-xs font-semibold ${
          mine
            ? 'border-neon bg-neon/15 text-neon'
            : person
              ? 'border-white/20 bg-white/5 text-ink'
              : 'border-dashed border-white/25 text-muted'
        }`}
      >
        <span className="font-mono text-[0.65rem] uppercase tracking-widest">
          Seat {seat}
        </span>
        <span className="mt-1 max-w-20 truncate">
          {person ? person.displayName : 'Open'}
        </span>
      </button>
    );
  }

  return (
    <div>
      {seatCount === 4 && onLayout ? (
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
            : 'Tap a seat. You can swap once you have a chair.'}
      </p>
      {long ? (
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
