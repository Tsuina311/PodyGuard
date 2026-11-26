import type { TableShape } from '@podyguard/shared';
import { tableDiagramSize, tableSeatGeometry } from './table-seat-geometry';

export type LimitedSeatLayout = 'square' | 'long';

export function LimitedSeatMap({
  shape,
  seatCount,
  seatOffset = 0,
  tableLabel = 'Table',
  occupants,
  selfId,
  disabled,
  layout = 'square',
  onLayout,
  onPick,
}: {
  shape?: TableShape;
  seatCount: number;
  seatOffset?: number;
  tableLabel?: string;
  occupants: Array<{ participantId: string; displayName: string; seat: number }>;
  selfId: string;
  disabled?: boolean;
  layout?: LimitedSeatLayout;
  onLayout?: (layout: LimitedSeatLayout) => void;
  onPick: (seat: number) => void;
}) {
  const bySeat = new Map(occupants.map((row) => [row.seat, row]));
  const long = !shape && seatCount === 4 && layout === 'long';
  const { table, mats } = tableSeatGeometry(shape ?? (long ? 'rectangle' : 'square'), seatCount);
  // The original four-seat long layout numbers both rows left to right.
  const positions = long ? [mats[0]!, mats[1]!, mats[3]!, mats[2]!] : mats;
  const xPercent = (pixels: number) => `${pixels / tableDiagramSize.width * 100}%`;
  const yPercent = (pixels: number) => `${pixels / tableDiagramSize.height * 100}%`;

  function chair(seat: number, mat: (typeof mats)[number]) {
    const person = bySeat.get(seat);
    const mine = person?.participantId === selfId;
    return (
      <button
        key={seat}
        type="button"
        disabled={disabled}
        onClick={() => onPick(seat)}
        style={{ left: xPercent(mat.x), top: yPercent(mat.y), width: xPercent(mat.width), height: yPercent(mat.height) }}
        data-edge={mat.edge}
        className={`absolute flex min-h-10 min-w-10 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-md border px-0.5 text-center text-xs font-semibold ${
          mine
            ? 'border-neon bg-neon/15 text-neon'
            : person
              ? 'border-white/20 bg-white/5 text-ink'
              : 'border-dashed border-white/25 text-muted'
        }`}
      >
        <span className="font-mono text-[0.65rem] uppercase">
          Seat {seat}
        </span>
        <span className="max-w-full truncate">
          {person ? person.displayName : 'Open'}
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
      {!shape && <p className="text-muted mb-3 text-center text-xs">
        {long
          ? 'Two players sit across from two. You play the person in front of you first.'
          : seatCount === 4
            ? 'One player on each side. You play the person opposite you first.'
            : 'Tap a seat. You can swap once you have a chair.'}
      </p>}
      <div className="relative mx-auto aspect-[360/280] w-full max-w-sm">
        <div
          className="absolute flex items-center justify-center border border-neon/40 bg-neon/5 px-2 text-center text-xs text-muted"
          style={{
            left: xPercent(table.x), top: yPercent(table.y),
            width: xPercent(table.width), height: yPercent(table.height),
            borderRadius: shape === 'round' ? '50%' : '0.75rem',
          }}
        >
          {tableLabel}
        </div>
        {positions.map((mat, index) => chair(seatOffset + index + 1, mat))}
      </div>
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
