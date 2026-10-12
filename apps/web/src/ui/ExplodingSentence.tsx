import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { cx } from './cx';

/** Matches the `letter-explode` animation length in styles.css. */
export const LETTER_BURST_MS = 280;

/** How long a burst letter stays gone before it returns to the sentence. */
export const LETTER_RETURN_MS = 2000;

const LETTER = /^\p{L}$/u;

type Phase = 'idle' | 'exploding' | 'gone';

export function ExplodingLetter({ char }: { char: string }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [burst, setBurst] = useState({ x: '0px', rot: '0deg' });
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

  function explode() {
    if (phaseRef.current !== 'idle') {
      return;
    }
    const x = Math.round((Math.random() - 0.5) * 28);
    const rot = Math.round((Math.random() - 0.5) * 48);
    phaseRef.current = 'exploding';
    setBurst({ x: `${String(x)}px`, rot: `${String(rot)}deg` });
    setPhase('exploding');
    const burstTimer = window.setTimeout(() => {
      phaseRef.current = 'gone';
      setPhase('gone');
      const returnTimer = window.setTimeout(() => {
        phaseRef.current = 'idle';
        setPhase('idle');
      }, LETTER_RETURN_MS);
      timers.current.push(returnTimer);
    }, LETTER_BURST_MS);
    timers.current.push(burstTimer);
  }

  return (
    <button
      type="button"
      className={cx(
        'inline-block cursor-pointer border-0 bg-transparent p-0 align-baseline text-inherit',
        'focus-visible:ring-neon/50 rounded-sm focus-visible:ring-2 focus-visible:outline-none',
        'disabled:opacity-100',
        phase === 'exploding' && 'letter-explode relative z-10',
        phase === 'gone' && 'invisible',
      )}
      style={
        {
          '--letter-burst-x': burst.x,
          '--letter-burst-rot': burst.rot,
        } as CSSProperties
      }
      disabled={phase !== 'idle'}
      onClick={explode}
    >
      {char}
    </button>
  );
}

export function ExplodingSentence({ text }: { text: string }) {
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
                <ExplodingLetter key={`${String(index)}-${String(charIndex)}`} char={char} />
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
