import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { cx } from './cx';

/** Matches the `letter-explode` animation length in styles.css. */
export const LETTER_BURST_MS = 280;

/** Matches the `letter-fall` animation length in styles.css. */
export const LETTER_FALL_MS = 900;

/** Matches the `letter-fly` animation length in styles.css. */
export const LETTER_FLY_MS = 1100;

/** How long a burst letter stays gone before it returns to the sentence. */
export const LETTER_RETURN_MS = 600;

const LETTER = /^\p{L}$/u;

export type LetterMotion = 'burst' | 'fall' | 'fly';

export const LETTER_MOTIONS: readonly LetterMotion[] = ['burst', 'fall', 'fly'];

export function randomLetterMotion(): LetterMotion {
  const index = Math.floor(Math.random() * LETTER_MOTIONS.length);
  return LETTER_MOTIONS[index] ?? 'burst';
}

type Phase = 'idle' | 'exploding' | 'gone' | 'appearing';

type Burst = { x: string; y?: string; rot: string };

const restingBurst: Burst = { x: '0px', rot: '0deg' };

function randomBurst(): Burst {
  const x = Math.round((Math.random() - 0.5) * 28);
  const rot = Math.round((Math.random() - 0.5) * 48);
  return { x: `${String(x)}px`, rot: `${String(rot)}deg` };
}

function randomFall(): Burst {
  const x = Math.round((Math.random() - 0.5) * 72);
  const rot = Math.round((Math.random() < 0.5 ? -1 : 1) * (50 + Math.random() * 70));
  return { x: `${String(x)}px`, rot: `${String(rot)}deg` };
}

function randomFly(): Burst {
  const angle = Math.random() * Math.PI * 2;
  const x = Math.round(Math.cos(angle) * 110);
  const y = Math.round(Math.sin(angle) * 110);
  const turns = 2 + Math.floor(Math.random() * 3);
  const rot = (Math.random() < 0.5 ? -1 : 1) * turns * 360;
  return {
    x: `${String(x)}vw`,
    y: `${String(y)}vh`,
    rot: `${String(rot)}deg`,
  };
}

function launchOffset(motion: LetterMotion): Burst {
  if (motion === 'fall') {
    return randomFall();
  }
  if (motion === 'fly') {
    return randomFly();
  }
  return randomBurst();
}

function motionDuration(motion: LetterMotion): number {
  if (motion === 'fall') {
    return LETTER_FALL_MS;
  }
  if (motion === 'fly') {
    return LETTER_FLY_MS;
  }
  return LETTER_BURST_MS;
}

const MOTION_CLASS: Record<LetterMotion, string> = {
  burst: 'letter-explode',
  fall: 'letter-fall',
  fly: 'letter-fly',
};

function useLetterPlayback(durationMs: number) {
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) {
        window.clearTimeout(id);
      }
    };
  }, []);

  function play(assignBursts: () => void) {
    if (phaseRef.current !== 'idle') {
      return;
    }
    phaseRef.current = 'exploding';
    assignBursts();
    setPhase('exploding');
    const burstTimer = window.setTimeout(() => {
      phaseRef.current = 'gone';
      setPhase('gone');
      const returnTimer = window.setTimeout(() => {
        phaseRef.current = 'appearing';
        setPhase('appearing');
        const fadeTimer = window.setTimeout(() => {
          phaseRef.current = 'idle';
          setPhase('idle');
        }, 32);
        timers.current.push(fadeTimer);
      }, LETTER_RETURN_MS);
      timers.current.push(returnTimer);
    }, durationMs);
    timers.current.push(burstTimer);
  }

  return { phase, play };
}

function glyphClass(phase: Phase, motion: LetterMotion): string {
  const inMotion = phase === 'exploding' || phase === 'gone';
  return cx(
    'letter-return inline-block align-baseline',
    inMotion && MOTION_CLASS[motion],
    phase === 'exploding' && 'relative z-10',
    phase !== 'idle' && 'pointer-events-none',
    (phase === 'gone' || phase === 'appearing') && 'opacity-0',
  );
}

function glyphStyle(burst: Burst): CSSProperties {
  const style: Record<string, string> = {
    '--letter-burst-x': burst.x,
    '--letter-burst-rot': burst.rot,
  };
  if (burst.y) {
    style['--letter-fly-x'] = burst.x;
    style['--letter-fly-y'] = burst.y;
  }
  return style as CSSProperties;
}

const textButtonClass =
  'cursor-pointer border-0 bg-transparent p-0 text-inherit align-baseline touch-none focus-visible:ring-neon/50 rounded-sm focus-visible:ring-2 focus-visible:outline-none';

function fineHoverDevice(): boolean {
  try {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch {
    return false;
  }
}

type LetterLaunch = () => void;

type LetterTouchApi = {
  register: (node: HTMLButtonElement, launch: LetterLaunch) => () => void;
};

const LetterTouchContext = createContext<LetterTouchApi | null>(null);

function buttonOf(node: EventTarget | Node | null): HTMLButtonElement | null {
  if (!(node instanceof Element)) {
    return null;
  }
  const button = node instanceof HTMLButtonElement ? node : node.closest('button');
  return button instanceof HTMLButtonElement ? button : null;
}

function isFinger(event: ReactPointerEvent<HTMLElement>): boolean {
  if (event.pointerType === 'touch' || event.pointerType === 'pen') {
    return true;
  }
  if (event.pointerType === 'mouse') {
    return false;
  }
  return !fineHoverDevice();
}

export function ExplodingLetter({
  char,
  motion = 'burst',
}: {
  char: string;
  motion?: LetterMotion;
}) {
  const { phase, play } = useLetterPlayback(motionDuration(motion));
  const [burst, setBurst] = useState(restingBurst);
  const nodeRef = useRef<HTMLButtonElement | null>(null);
  const touch = useContext(LetterTouchContext);
  const launchRef = useRef<LetterLaunch>(() => {});

  function burstLetter() {
    play(() => setBurst(launchOffset(motion)));
  }

  launchRef.current = burstLetter;

  useEffect(() => {
    const node = nodeRef.current;
    if (!node || !touch) {
      return;
    }
    return touch.register(node, () => {
      launchRef.current();
    });
  }, [touch]);

  return (
    <button
      ref={nodeRef}
      type="button"
      className={cx(textButtonClass, glyphClass(phase, motion))}
      style={glyphStyle(burst)}
      disabled={phase !== 'idle'}
      onClick={burstLetter}
      onPointerEnter={() => {
        if (fineHoverDevice()) {
          burstLetter();
        }
      }}
    >
      {char}
    </button>
  );
}

function FingerTrail({ children }: { children: ReactNode }) {
  const launches = useRef(new Map<HTMLButtonElement, LetterLaunch>());
  const fingers = useRef(new Set<number>());
  const api = useMemo<LetterTouchApi>(
    () => ({
      register(node, launch) {
        launches.current.set(node, launch);
        return () => {
          if (launches.current.get(node) === launch) {
            launches.current.delete(node);
          }
        };
      },
    }),
    [],
  );

  function launchHit(x: number, y: number): boolean {
    const seen = new Set<Element>();
    const candidates: Array<Element | null> = [];
    if (typeof document.elementsFromPoint === 'function') {
      candidates.push(...document.elementsFromPoint(x, y));
    }
    if (typeof document.elementFromPoint === 'function') {
      candidates.push(document.elementFromPoint(x, y));
    }
    for (const node of candidates) {
      if (!node || seen.has(node)) {
        continue;
      }
      seen.add(node);
      const button = buttonOf(node);
      const launch = button ? launches.current.get(button) : undefined;
      if (launch) {
        launch();
        return true;
      }
    }
    return false;
  }

  function launchUnder(x: number, y: number, fallback: EventTarget | null) {
    // A fingertip is wider than a letter, so look a few pixels off the contact point.
    const samples = [
      [0, 0],
      [0, -12],
      [0, 12],
      [-10, 0],
      [10, 0],
    ];
    for (const [dx, dy] of samples) {
      if (launchHit(x + (dx ?? 0), y + (dy ?? 0))) {
        return;
      }
    }
    const button = buttonOf(fallback);
    const launch = button ? launches.current.get(button) : undefined;
    launch?.();
  }

  function onPointerDown(event: ReactPointerEvent<HTMLSpanElement>) {
    if (!isFinger(event)) {
      return;
    }
    fingers.current.add(event.pointerId);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some test environments have no pointer capture.
    }
    launchUnder(event.clientX, event.clientY, event.target);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLSpanElement>) {
    if (!fingers.current.has(event.pointerId)) {
      return;
    }
    // Touch moves stay on the first contact. Ask the screen which letter is under the finger.
    launchUnder(event.clientX, event.clientY, null);
  }

  function endFinger(event: ReactPointerEvent<HTMLSpanElement>) {
    fingers.current.delete(event.pointerId);
  }

  return (
    <LetterTouchContext.Provider value={api}>
      <span
        className="touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endFinger}
        onPointerCancel={endFinger}
      >
        {children}
      </span>
    </LetterTouchContext.Provider>
  );
}

export function ExplodingSentence({
  text,
  motion = 'burst',
}: {
  text: string;
  motion?: LetterMotion;
}) {
  const parts = text.split(/(\s+)/);
  return (
    <FingerTrail>
      {parts.map((part, index) => {
        if (/^\s+$/.test(part)) {
          return <span key={index}>{part}</span>;
        }
        return (
          <span key={index} className="whitespace-nowrap">
            {Array.from(part).map((char, charIndex) =>
              LETTER.test(char) ? (
                <ExplodingLetter
                  key={`${String(index)}-${String(charIndex)}`}
                  char={char}
                  motion={motion}
                />
              ) : (
                <span key={`${String(index)}-${String(charIndex)}`}>{char}</span>
              ),
            )}
          </span>
        );
      })}
    </FingerTrail>
  );
}
