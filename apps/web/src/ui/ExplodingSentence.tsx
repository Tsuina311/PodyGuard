import { useEffect, useRef, useState, type CSSProperties } from 'react';
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
  'cursor-pointer border-0 bg-transparent p-0 text-inherit align-baseline touch-manipulation focus-visible:ring-neon/50 rounded-sm focus-visible:ring-2 focus-visible:outline-none';

function fineHoverDevice(): boolean {
  try {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  } catch {
    return false;
  }
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

  function burstLetter() {
    play(() => setBurst(launchOffset(motion)));
  }

  return (
    <button
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

export function ExplodingSentence({
  text,
  motion = 'burst',
}: {
  text: string;
  motion?: LetterMotion;
}) {
  const parts = text.split(/(\s+)/);
  return (
    <>
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
    </>
  );
}
