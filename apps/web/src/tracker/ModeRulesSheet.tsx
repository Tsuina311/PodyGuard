import { ArrowLeft, BookOpen, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GameMode, RulesFormat } from '@podyguard/shared';
import { Button } from '../ui/Button';
import { rulesForMode } from './mode-rules';

/**
 * A card rather than a full screen: the rules are read alongside the board a
 * pod is already looking at, so the popup stays small and scrolls internally.
 */
export function ModeRulesSheet({
  gameMode,
  rulesFormat = null,
  onClose,
}: {
  gameMode: GameMode;
  rulesFormat?: RulesFormat | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const rules = rulesForMode(gameMode, t, rulesFormat);
  return (
    <section className="border-muted/25 bg-hull flex max-h-[min(80dvh,34rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border shadow-[0_18px_50px_-24px_var(--color-void)]">
      <header className="border-muted/15 flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpen size={17} aria-hidden className="text-neon shrink-0" />
          <h4 className="font-display truncate text-sm leading-tight font-bold">
            {rules.title}
          </h4>
        </div>
        <button
          type="button"
          aria-label={t('modeRulesSheet.closeRules')}
          onClick={onClose}
          className="border-muted/25 text-muted hover:text-ink hover:border-muted/50 flex size-8 shrink-0 items-center justify-center rounded-full border transition"
        >
          <X size={17} aria-hidden />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        <p className="text-muted mb-4 text-sm">{rules.summary}</p>
        {rules.sections.map((section) => (
          <section key={section.heading} className="mb-4 last:mb-0">
            <h5 className="text-muted mb-2 font-mono text-[0.68rem] tracking-wide uppercase">
              {section.heading}
            </h5>
            <ul className="space-y-2 text-sm leading-relaxed">
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="border-muted/15 shrink-0 border-t p-3">
        <Button variant="glass" block onClick={onClose}>
          <ArrowLeft size={16} aria-hidden />
          {t('modeRulesSheet.backToGame')}
        </Button>
      </div>
    </section>
  );
}
