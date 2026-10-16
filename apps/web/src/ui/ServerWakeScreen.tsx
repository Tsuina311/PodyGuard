import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Brand } from './Brand';
import {
  ExplodingSentence,
  LETTER_MOTIONS,
  randomLetterMotion,
  type LetterMotion,
} from './ExplodingSentence';
import { cx } from './cx';

export function ServerWakeScreen({ switchable = false }: { switchable?: boolean }) {
  const { t } = useTranslation();
  const [motion, setMotion] = useState<LetterMotion>(() =>
    switchable ? 'fly' : randomLetterMotion(),
  );

  return (
    <section className="bg-deep-space fixed inset-0 z-[80] flex flex-col items-center justify-center px-6 text-center">
      {switchable ? (
        <div className="absolute top-1/2 right-3 z-30 flex -translate-y-1/2 flex-col gap-2">
          {LETTER_MOTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={motion === option}
              className={cx(
                'rounded-md border px-2 py-1 font-mono text-[0.7rem] capitalize',
                motion === option
                  ? 'border-neon/60 text-neon'
                  : 'border-muted/30 text-muted',
              )}
              onClick={() => setMotion(option)}
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
      <Brand className="mb-8" />
      <h1
        className="font-display mb-3 text-3xl font-bold tracking-tight select-none"
        aria-label={t('wake.title')}
      >
        <ExplodingSentence key={motion} text={t('wake.title')} motion={motion} />
      </h1>
      <p className="text-muted max-w-sm text-sm leading-relaxed select-none">
        <ExplodingSentence key={motion} text={t('wake.message')} motion={motion} />
      </p>
    </section>
  );
}
