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

/**
 * Small green arrows sit on the midpoint between each ally pair, rotated to
 * follow the line between those seats. Measured from the live seat boxes so
 * landscape nudges and shared-life layouts stay honest.
 */
export function AllyArrows({
  pairs,
  containerRef,
}: {
  pairs: [string, string][];
  containerRef: RefObject<HTMLElement | null>;
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
      const root = container.getBoundingClientRect();
      const next: { key: string; x: number; y: number; angle: number }[] = [];
      for (const [a, b] of pairs) {
        const elA = container.querySelector(`[data-seat-id="${CSS.escape(a)}"]`);
        const elB = container.querySelector(`[data-seat-id="${CSS.escape(b)}"]`);
        if (!(elA instanceof HTMLElement) || !(elB instanceof HTMLElement)) {
          continue;
        }
        const ra = elA.getBoundingClientRect();
        const rb = elB.getBoundingClientRect();
        const ax = ra.left + ra.width / 2 - root.left;
        const ay = ra.top + ra.height / 2 - root.top;
        const bx = rb.left + rb.width / 2 - root.left;
        const by = rb.top + rb.height / 2 - root.top;
        const dx = bx - ax;
        const dy = by - ay;
        // Sit in the gutter between seats, not on the centre-to-centre line
        // through the cards (or through the match dial on the bottom pair).
        let x: number;
        let y: number;
        if (Math.abs(dx) >= Math.abs(dy)) {
          const left = ra.left <= rb.left ? ra : rb;
          const right = ra.left <= rb.left ? rb : ra;
          x = (left.right + right.left) / 2 - root.left;
          const gap = right.left - left.right;
          // A wide horizontal gutter is the empty cell the match dial sits in;
          // park the arrow low so the dial can sit above it.
          if (gap > 48) {
            const top = Math.min(ra.top, rb.top) - root.top;
            const bottom = Math.max(ra.bottom, rb.bottom) - root.top;
            y = top + (bottom - top) * 0.82;
          } else {
            y = (ay + by) / 2;
          }
        } else {
          const top = ra.top <= rb.top ? ra : rb;
          const bottom = ra.top <= rb.top ? rb : ra;
          x = (ax + bx) / 2;
          y = (top.bottom + bottom.top) / 2 - root.top;
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
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [pairs, containerRef]);

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
