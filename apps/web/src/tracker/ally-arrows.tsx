import {
  useLayoutEffect,
  useState,
  type RefObject,
} from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { GameMode } from '@podyguard/shared';
import type { TrackerState } from './engine';

/** Undirected ally edges the board should mark between seats. */
export function allySeatPairs(
  state: TrackerState,
  gameMode: GameMode,
): [string, string][] {
  if (gameMode === 'star' && state.starOrder.length === 5) {
    const order = state.starOrder;
    return order.map((id, index) => [
      id,
      order[(index + 1) % order.length]!,
    ]);
  }
  if (
    (gameMode === 'two-headed-giant' ||
      gameMode === 'emperor' ||
      gameMode === 'archenemy-commander') &&
    state.teams
  ) {
    const pairs: [string, string][] = [];
    for (const team of state.teams) {
      if (team.length < 2) {
        continue;
      }
      for (let index = 0; index < team.length - 1; index += 1) {
        pairs.push([team[index]!, team[index + 1]!]);
      }
    }
    return pairs;
  }
  return [];
}

/** Own CSS translate in local px (layout offset* ignores transforms). */
function elementTranslate(el: HTMLElement): { x: number; y: number } {
  const transform = getComputedStyle(el).transform;
  if (!transform || transform === 'none') {
    return { x: 0, y: 0 };
  }
  const matrix = new DOMMatrixReadOnly(transform);
  return { x: matrix.m41, y: matrix.m42 };
}

/**
 * Seat centre in the board's local layout space. Prefer offset* over
 * getBoundingClientRect so an ancestor rotate (iPhone force-landscape shell)
 * cannot map screen AABB deltas into wrong left/top coordinates.
 */
function seatCenter(seat: HTMLElement): { x: number; y: number } {
  const { x: tx, y: ty } = elementTranslate(seat);
  return {
    x: seat.offsetLeft + seat.offsetWidth / 2 + tx,
    y: seat.offsetTop + seat.offsetHeight / 2 + ty,
  };
}

function seatBox(seat: HTMLElement): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  const { x: tx, y: ty } = elementTranslate(seat);
  const left = seat.offsetLeft + tx;
  const top = seat.offsetTop + ty;
  return {
    left,
    top,
    right: left + seat.offsetWidth,
    bottom: top + seat.offsetHeight,
  };
}

/**
 * Small green arrows sit on the midpoint between each ally pair, rotated to
 * follow the line between those seats. Measured from the live seat boxes so
 * landscape nudges and shared-life layouts stay honest.
 */
export function AllyArrows({
  pairs,
  containerRef,
  /** Remeasure when board geometry changes without a pairs identity change. */
  layoutKey = '',
}: {
  pairs: [string, string][];
  containerRef: RefObject<HTMLElement | null>;
  layoutKey?: string;
}) {
  const [segments, setSegments] = useState<
    { key: string; x: number; y: number; angle: number }[]
  >([]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || pairs.length === 0) {
      setSegments([]);
      return;
    }

    const measure = () => {
      const next: { key: string; x: number; y: number; angle: number }[] = [];
      for (const [a, b] of pairs) {
        const elA = container.querySelector(`[data-seat-id="${CSS.escape(a)}"]`);
        const elB = container.querySelector(`[data-seat-id="${CSS.escape(b)}"]`);
        if (!(elA instanceof HTMLElement) || !(elB instanceof HTMLElement)) {
          continue;
        }
        // Grid/flex often paints a 0×0 frame before fr rows settle; wait for RO.
        if (
          elA.offsetWidth === 0 ||
          elA.offsetHeight === 0 ||
          elB.offsetWidth === 0 ||
          elB.offsetHeight === 0
        ) {
          continue;
        }
        const aCenter = seatCenter(elA);
        const bCenter = seatCenter(elB);
        const ra = seatBox(elA);
        const rb = seatBox(elB);
        const dx = bCenter.x - aCenter.x;
        const dy = bCenter.y - aCenter.y;
        // Sit in the gutter between seats, not on the centre-to-centre line
        // through the cards (or through the match dial on the bottom pair).
        let x: number;
        let y: number;
        if (Math.abs(dx) >= Math.abs(dy)) {
          const left = ra.left <= rb.left ? ra : rb;
          const right = ra.left <= rb.left ? rb : ra;
          x = (left.right + right.left) / 2;
          const gap = right.left - left.right;
          const top = Math.min(ra.top, rb.top);
          const bottom = Math.max(ra.bottom, rb.bottom);
          if (gap > 48) {
            // Wide gutter (Star empty cell): park low so the dial can sit above.
            y = top + (bottom - top) * 0.82;
          } else {
            // Teammates with a shared life total in the middle of the row:
            // sit just above that total (life chrome sits near the row mid).
            y = top + (bottom - top) * 0.26;
          }
        } else {
          const top = ra.top <= rb.top ? ra : rb;
          const bottom = ra.top <= rb.top ? rb : ra;
          x = (aCenter.x + bCenter.x) / 2;
          y = (top.bottom + bottom.top) / 2;
        }
        next.push({
          key: `${a}:${b}`,
          x,
          y,
          angle: (Math.atan2(dy, dx) * 180) / Math.PI,
        });
      }
      setSegments(next);
    };

    measure();
    // First paint after Start often lands before fr rows / landscape classes
    // finish; a double rAF catches the settled board without waiting for a tap.
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      measure();
      raf2 = window.requestAnimationFrame(measure);
    });

    const observer = new ResizeObserver(measure);
    observer.observe(container);
    for (const [a, b] of pairs) {
      const elA = container.querySelector(`[data-seat-id="${CSS.escape(a)}"]`);
      const elB = container.querySelector(`[data-seat-id="${CSS.escape(b)}"]`);
      if (elA instanceof HTMLElement) {
        observer.observe(elA);
      }
      if (elB instanceof HTMLElement) {
        observer.observe(elB);
      }
    }
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [pairs, layoutKey, containerRef]);

  if (segments.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[15] overflow-visible"
      aria-hidden
    >
      {segments.map((segment) => (
        <span
          key={segment.key}
          title="Allies"
          className="bg-void/80 text-gain absolute flex size-7 items-center justify-center rounded-full shadow-[0_0_10px_-2px_var(--color-gain)]"
          style={{
            left: segment.x,
            top: segment.y,
            transform: `translate(-50%, -50%) rotate(${segment.angle}deg)`,
          }}
        >
          <ArrowLeftRight size={16} strokeWidth={2.75} />
        </span>
      ))}
    </div>
  );
}
