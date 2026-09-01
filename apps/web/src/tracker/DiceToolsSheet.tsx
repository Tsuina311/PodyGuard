import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins, Minus, Plus, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';
import d10Outline from './assets/d10-outline.png';
import mtgM from './assets/mtg-m.png';

export type DiceToolsFocus = 'coin' | 'dice';

type Props = {
  focus: DiceToolsFocus;
  onClose: () => void;
};

type CoinFace = 'heads' | 'tails';

type Result =
  | { kind: 'coin'; faces: CoinFace[]; rollId: number }
  | { kind: 'die'; sides: number; values: number[]; rollId: number };

const DIE_SIDES = [4, 6, 8, 10, 12, 20];
const MAX_COUNT = 10;
const COIN_FLIP_MS = 900;
const DIE_TUMBLE_MS = 1000;
const STAGGER_MS = 70;

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

function flipCoin(): CoinFace {
  return Math.random() < 0.5 ? 'heads' : 'tails';
}

function flipCoins(count: number): CoinFace[] {
  return Array.from({ length: count }, flipCoin);
}

function rollDice(sides: number, count: number): number[] {
  return Array.from({ length: count }, () => rollDie(sides));
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Table tools for the match menu: coin flips or standard polyhedral dice,
 * one or many at once, with CSS flip/tumble animations.
 */
export function DiceToolsSheet({ focus, onClose }: Props) {
  const { t } = useTranslation();
  const [count, setCount] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [rollId, setRollId] = useState(0);
  const coinMode = focus === 'coin';

  useEffect(() => {
    if (!spinning || !result) {
      return;
    }
    const items =
      result.kind === 'coin' ? result.faces.length : result.values.length;
    const base = result.kind === 'coin' ? COIN_FLIP_MS : DIE_TUMBLE_MS;
    const duration = prefersReducedMotion()
      ? 0
      : base + Math.max(0, items - 1) * STAGGER_MS;
    const timer = window.setTimeout(() => setSpinning(false), duration);
    return () => window.clearTimeout(timer);
  }, [spinning, result]);

  function reveal(
    next:
      | { kind: 'coin'; faces: CoinFace[] }
      | { kind: 'die'; sides: number; values: number[] },
  ) {
    const nextId = rollId + 1;
    setRollId(nextId);
    setSpinning(true);
    setResult({ ...next, rollId: nextId });
  }

  function adjustCount(delta: number) {
    setCount((current) => Math.min(MAX_COUNT, Math.max(1, current + delta)));
  }

  const heads =
    result?.kind === 'coin'
      ? result.faces.filter((face) => face === 'heads').length
      : 0;
  const tails =
    result?.kind === 'coin' ? result.faces.length - heads : 0;

  return (
    <section className="border-muted/20 bg-hull/95 flex h-full w-full flex-col rounded-2xl border p-4 shadow-[0_24px_80px_-40px_var(--color-void)]">
      <header className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h4 className="font-display text-sm leading-tight font-bold">
          {coinMode ? t('tracker.coins') : t('tracker.dice')}
        </h4>
        <button
          type="button"
          aria-label={
            coinMode ? t('tracker.closeCoins') : t('tracker.closeDice')
          }
          onClick={onClose}
          className="border-muted/25 text-muted hover:text-ink hover:border-muted/50 flex size-8 shrink-0 items-center justify-center rounded-full border transition"
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      <div className="mb-3 flex min-h-0 shrink-0 items-stretch gap-2">
        <div
          aria-live="polite"
          className="border-muted/20 bg-black/20 flex min-h-40 min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-2 text-center"
        >
          {result === null ? (
            <p className="text-muted text-sm">
              {coinMode ? t('tracker.coinHint') : t('tracker.diceHint')}
            </p>
          ) : result.kind === 'coin' ? (
            <>
              <div className="flex max-h-44 flex-wrap items-center justify-center gap-x-1 gap-y-1 overflow-hidden">
                {result.faces.map((face, index) => (
                  <AnimatedCoin
                    key={`${String(result.rollId)}-${String(index)}`}
                    face={face}
                    delayMs={index * STAGGER_MS}
                    headsLabel={t('tracker.coin.heads')}
                    tailsLabel={t('tracker.coin.tails')}
                  />
                ))}
              </div>
              {!spinning && result.faces.length > 1 ? (
                <p className="text-muted font-mono text-[0.7rem] tracking-wide uppercase">
                  {t('tracker.coinTally', { heads, tails })}
                </p>
              ) : null}
            </>
          ) : (
            <div className="flex max-h-44 flex-wrap items-center justify-center gap-x-1 gap-y-1 overflow-hidden">
              {result.values.map((value, index) => (
                <AnimatedDie
                  key={`die-${String(index)}`}
                  rollId={result.rollId}
                  value={value}
                  sides={result.sides}
                  delayMs={index * STAGGER_MS}
                />
              ))}
            </div>
          )}
        </div>

        <div
          role="group"
          aria-label={
            coinMode ? t('tracker.coinCount') : t('tracker.diceCount')
          }
          className="border-muted/20 bg-ink/[0.03] flex w-12 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border py-2"
        >
          <button
            type="button"
            aria-label={t('tracker.increaseCount')}
            disabled={count >= MAX_COUNT}
            onClick={() => adjustCount(1)}
            className="text-ink hover:bg-ink/10 flex size-9 items-center justify-center rounded-lg transition disabled:opacity-40"
          >
            <Plus size={16} aria-hidden />
          </button>
          <span className="font-display text-center text-lg font-bold tabular-nums">
            {count}
          </span>
          <button
            type="button"
            aria-label={t('tracker.decreaseCount')}
            disabled={count <= 1}
            onClick={() => adjustCount(-1)}
            className="text-ink hover:bg-ink/10 flex size-9 items-center justify-center rounded-lg transition disabled:opacity-40"
          >
            <Minus size={16} aria-hidden />
          </button>
        </div>
      </div>

      {coinMode ? (
        <Button
          size="lg"
          variant="neon"
          block
          disabled={spinning}
          onClick={() =>
            reveal({ kind: 'coin', faces: flipCoins(count) })
          }
        >
          <Coins size={18} aria-hidden />
          {count === 1
            ? t('tracker.flipCoin')
            : t('tracker.flipCoins', { count })}
        </Button>
      ) : (
        <div className="grid shrink-0 grid-cols-3 gap-2 sm:grid-cols-6">
          {DIE_SIDES.map((sides) => {
            const active =
              result?.kind === 'die' && result.sides === sides;
            return (
              <button
                key={sides}
                type="button"
                disabled={spinning}
                onClick={() =>
                  reveal({
                    kind: 'die',
                    sides,
                    values: rollDice(sides, count),
                  })
                }
                className={cx(
                  'rounded-xl border px-2 py-3 font-mono text-sm font-semibold tabular-nums transition disabled:opacity-50',
                  active
                    ? 'border-neon bg-neon/15 text-neon'
                    : 'border-neon/35 bg-neon/5 text-neon hover:border-neon/60',
                )}
              >
                {t('tracker.rollDie', { sides })}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * Magic “M” mark for coin heads — the user’s MTG icon asset.
 */
function MtgMIcon({ size = 26 }: { size?: number }) {
  return (
    <img
      src={mtgM}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className="pointer-events-none block object-contain"
    />
  );
}

function AnimatedCoin({
  face,
  delayMs,
  headsLabel,
  tailsLabel,
}: {
  face: CoinFace;
  delayMs: number;
  headsLabel: string;
  tailsLabel: string;
}) {
  const [phase, setPhase] = useState<'pending' | 'flipping' | 'done'>(
    'pending',
  );

  useEffect(() => {
    if (prefersReducedMotion()) {
      setPhase('done');
      return;
    }
    setPhase('pending');
    const start = window.setTimeout(() => setPhase('flipping'), delayMs);
    const end = window.setTimeout(
      () => setPhase('done'),
      delayMs + COIN_FLIP_MS,
    );
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(end);
    };
  }, [delayMs, face]);

  return (
    <div className="table-coin-stage">
      <div
        className="table-coin"
        aria-label={face === 'heads' ? headsLabel : tailsLabel}
      >
        <div
          className={cx(
            'table-coin__spinner',
            phase === 'flipping' &&
              (face === 'heads' ? 'is-flipping-heads' : 'is-flipping-tails'),
          )}
          style={
            phase === 'done'
              ? {
                  transform:
                    face === 'tails' ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }
              : undefined
          }
        >
          <div className="table-coin__face table-coin__face--heads" aria-hidden>
            <MtgMIcon size={28} />
          </div>
          <div className="table-coin__face table-coin__face--tails" aria-hidden>
            1
          </div>
        </div>
      </div>
    </div>
  );
}

function AnimatedDie({
  value,
  sides,
  delayMs,
  rollId,
}: {
  value: number;
  sides: number;
  delayMs: number;
  rollId: number;
}) {
  const [phase, setPhase] = useState<'pending' | 'tumbling' | 'settled'>(
    'pending',
  );
  /*
    Keep whatever face is showing across re-rolls. First mount picks a random
    face so the final answer is not leaked before the tumble.
  */
  const [display, setDisplay] = useState(() => rollDie(sides));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(value);
      setPhase('settled');
      return;
    }
    setPhase('pending');
    setDisplay((current) => (current >= 1 && current <= sides ? current : rollDie(sides)));
    let flicker: ReturnType<typeof window.setInterval> | undefined;
    const start = window.setTimeout(() => {
      setPhase('tumbling');
      flicker = window.setInterval(() => {
        setDisplay(rollDie(sides));
      }, 70);
    }, delayMs);
    const stopFlicker = window.setTimeout(() => {
      if (flicker !== undefined) {
        window.clearInterval(flicker);
        flicker = undefined;
      }
      setDisplay(value);
    }, delayMs + DIE_TUMBLE_MS - 120);
    const end = window.setTimeout(() => {
      setDisplay(value);
      setPhase('settled');
    }, delayMs + DIE_TUMBLE_MS);
    return () => {
      window.clearTimeout(start);
      window.clearTimeout(stopFlicker);
      window.clearTimeout(end);
      if (flicker !== undefined) {
        window.clearInterval(flicker);
      }
    };
  }, [delayMs, rollId, sides, value]);

  return (
    <div className="table-die-stage">
      <div
        className={cx(
          'table-die',
          `table-die--d${String(sides)}`,
          phase === 'tumbling' && 'is-tumbling',
          phase === 'settled' && 'is-settled',
        )}
        aria-label={String(value)}
      >
        {sides === 10 ? (
          <>
            {/*
              Soft fill behind the traced outline so d10 matches the other
              dice shells; the PNG mask draws the exact seams on top.
            */}
            <svg
              className="table-die__svg table-die__d10-fill"
              viewBox="0 0 131 150"
              preserveAspectRatio="xMidYMid meet"
              aria-hidden
            >
              <polygon
                className="table-die__shell"
                points="63,14.3 121.9,82.9 63,136.7 2.7,81.6"
              />
            </svg>
            <span
              className="table-die__d10-art"
              style={{
                maskImage: `url(${d10Outline})`,
                WebkitMaskImage: `url(${d10Outline})`,
              }}
            />
            <span className="table-die__d10-value">{display}</span>
          </>
        ) : (
          <DieFace sides={sides} value={display} />
        )}
      </div>
    </div>
  );
}

/*
  Flat silhouettes per die (d10 uses the traced PNG mask instead).
*/
function DieFace({ sides, value }: { sides: number; value: number }) {
  const label = String(value);
  const valueY = 32;

  return (
    <svg
      className="table-die__svg"
      viewBox="0 0 64 64"
      aria-hidden
    >
      {sides === 4 ? (
        <polygon className="table-die__shell" points="32,2 58,47 6,47" />
      ) : null}
      {sides === 6 ? (
        <rect
          className="table-die__shell"
          x="10"
          y="10"
          width="44"
          height="44"
          rx="5"
        />
      ) : null}
      {sides === 8 ? (
        <>
          <polygon
            className="table-die__shell"
            points="32,4 56,18 56,46 32,60 8,46 8,18"
          />
          <polygon className="table-die__seam" points="32,4 56,46 8,46" />
        </>
      ) : null}
      {sides === 12 ? (
        <>
          <polygon
            className="table-die__shell"
            points="32,4 48,10 58,24 58,40 48,54 32,60 16,54 6,40 6,24 16,10"
          />
          <polygon
            className="table-die__seam"
            points="32,18 44,26 40,42 24,42 20,26"
          />
          <line className="table-die__seam" x1="32" y1="4" x2="32" y2="18" />
          <line className="table-die__seam" x1="48" y1="10" x2="44" y2="26" />
          <line className="table-die__seam" x1="58" y1="24" x2="44" y2="26" />
          <line className="table-die__seam" x1="58" y1="40" x2="40" y2="42" />
          <line className="table-die__seam" x1="48" y1="54" x2="40" y2="42" />
          <line className="table-die__seam" x1="32" y1="60" x2="32" y2="42" />
          <line className="table-die__seam" x1="16" y1="54" x2="24" y2="42" />
          <line className="table-die__seam" x1="6" y1="40" x2="20" y2="42" />
          <line className="table-die__seam" x1="6" y1="24" x2="20" y2="26" />
          <line className="table-die__seam" x1="16" y1="10" x2="20" y2="26" />
        </>
      ) : null}
      {sides === 20 ? (
        <>
          <polygon
            className="table-die__shell"
            points="32,4 56,18 56,46 32,60 8,46 8,18"
          />
          <polygon className="table-die__seam" points="32,14 48,46 16,46" />
          <line className="table-die__seam" x1="32" y1="4" x2="32" y2="14" />
          <line className="table-die__seam" x1="56" y1="18" x2="48" y2="46" />
          <line className="table-die__seam" x1="56" y1="46" x2="48" y2="46" />
          <line className="table-die__seam" x1="32" y1="60" x2="32" y2="46" />
          <line className="table-die__seam" x1="8" y1="46" x2="16" y2="46" />
          <line className="table-die__seam" x1="8" y1="18" x2="16" y2="46" />
          <line className="table-die__seam" x1="32" y1="14" x2="56" y2="18" />
          <line className="table-die__seam" x1="32" y1="14" x2="8" y2="18" />
          <line className="table-die__seam" x1="16" y1="46" x2="32" y2="60" />
          <line className="table-die__seam" x1="48" y1="46" x2="32" y2="60" />
        </>
      ) : null}
      <text className="table-die__value" x="32" y={valueY}>
        {label}
      </text>
    </svg>
  );
}
