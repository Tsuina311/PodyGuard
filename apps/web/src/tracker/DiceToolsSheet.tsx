import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';

type Props = {
  onClose: () => void;
};

type CoinFace = 'heads' | 'tails';

type Result =
  | { kind: 'coin'; face: CoinFace }
  | { kind: 'die'; sides: number; value: number };

const DIE_SIDES = Array.from({ length: 49 }, (_, index) => index + 2);
const COMMON_SIDES = new Set([4, 6, 8, 10, 12, 20]);

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

function flipCoin(): CoinFace {
  return Math.random() < 0.5 ? 'heads' : 'tails';
}

/**
 * Table tools for the match menu: a coin and every die from d2 through d50.
 * Results stay on this sheet so a roll does not bury the board behind history.
 */
export function DiceToolsSheet({ onClose }: Props) {
  const { t } = useTranslation();
  const [result, setResult] = useState<Result | null>(null);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    if (!spinning) {
      return;
    }
    const timer = window.setTimeout(() => setSpinning(false), 420);
    return () => window.clearTimeout(timer);
  }, [spinning, result]);

  function reveal(next: Result) {
    setSpinning(true);
    setResult(next);
  }

  return (
    <section className="border-muted/20 bg-hull/95 flex h-full w-full flex-col rounded-2xl border p-4 shadow-[0_24px_80px_-40px_var(--color-void)]">
      <header className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <h4 className="font-display text-sm leading-tight font-bold">
          {t('tracker.diceTools')}
        </h4>
        <button
          type="button"
          aria-label={t('tracker.closeDiceTools')}
          onClick={onClose}
          className="border-muted/25 text-muted hover:text-ink hover:border-muted/50 flex size-8 shrink-0 items-center justify-center rounded-full border transition"
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      <div
        aria-live="polite"
        className={cx(
          'border-muted/20 bg-black/20 mb-3 flex min-h-28 w-full shrink-0 flex-col items-center justify-center rounded-2xl border px-4 py-4 text-center transition duration-300',
          spinning && 'scale-95 opacity-60',
        )}
      >
        {result === null ? (
          <p className="text-muted text-sm">{t('tracker.diceToolsHint')}</p>
        ) : result.kind === 'coin' ? (
          <>
            <Coins size={28} aria-hidden className="text-warning mb-2" />
            <p className="font-display text-3xl font-bold tracking-tight">
              {t(`tracker.coin.${result.face}`)}
            </p>
          </>
        ) : (
          <>
            <p className="text-muted mb-1 font-mono text-[0.68rem] tracking-wide uppercase">
              {t('tracker.dieLabel', { sides: result.sides })}
            </p>
            <p className="font-display text-neon text-5xl leading-none font-bold tabular-nums">
              {result.value}
            </p>
          </>
        )}
      </div>

      <div className="mb-3 shrink-0">
        <Button
          size="sm"
          variant="neon"
          block
          onClick={() => reveal({ kind: 'coin', face: flipCoin() })}
        >
          <Coins size={14} aria-hidden />
          {t('tracker.flipCoin')}
        </Button>
      </div>

      <p className="text-muted mb-2 shrink-0 font-mono text-[0.68rem] tracking-wide uppercase">
        {t('tracker.diceRange')}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-7">
          {DIE_SIDES.map((sides) => {
            const common = COMMON_SIDES.has(sides);
            const active =
              result?.kind === 'die' && result.sides === sides;
            return (
              <button
                key={sides}
                type="button"
                onClick={() =>
                  reveal({ kind: 'die', sides, value: rollDie(sides) })
                }
                className={cx(
                  'rounded-lg border px-1 py-2 font-mono text-xs font-semibold tabular-nums transition',
                  active
                    ? 'border-neon bg-neon/15 text-neon'
                    : common
                      ? 'border-neon/35 bg-neon/5 text-neon hover:border-neon/60'
                      : 'border-muted/25 text-muted hover:border-muted/50 hover:text-ink',
                )}
              >
                {t('tracker.rollDie', { sides })}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
