const LAYOUTS: Record<number, number[][]> = {
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
  onPick,
}: {
  seatCount: number;
  occupants: Array<{ participantId: string; displayName: string; seat: number }>;
  selfId: string;
  disabled?: boolean;
  onPick: (seat: number) => void;
}) {
  const layout = LAYOUTS[seatCount];
  const bySeat = new Map(occupants.map((row) => [row.seat, row]));
  const seats = layout
    ? null
    : Array.from({ length: seatCount }, (_, index) => index + 1);

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

  if (!layout) {
    return (
      <div className="flex flex-wrap justify-center gap-2">
        {seats?.map((seat) => chair(seat))}
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-sm gap-2">
      {layout.map((row, rowIndex) => (
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
  );
}
