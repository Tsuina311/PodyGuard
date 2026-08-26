import { BookOpen, X } from 'lucide-react';
import type { GameMode } from '@podyguard/shared';
import { rulesForMode } from './mode-rules';

export function ModeRulesSheet({
  gameMode,
  onClose,
}: {
  gameMode: GameMode;
  onClose: () => void;
}) {
  const rules = rulesForMode(gameMode);
  return (
    <section className="flex h-full w-full flex-col">
      <header className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <BookOpen size={18} aria-hidden className="text-neon shrink-0" />
          <h4 className="font-display truncate text-sm leading-tight font-bold">
            {rules.title}
          </h4>
        </div>
        <button
          type="button"
          aria-label="Close rules"
          onClick={onClose}
          className="border-muted/25 text-muted hover:text-ink hover:border-muted/50 flex size-8 shrink-0 items-center justify-center rounded-full border transition"
        >
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <p className="text-muted mb-4 text-sm">{rules.summary}</p>
        {rules.sections.map((section) => (
          <section key={section.heading} className="mb-4">
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
    </section>
  );
}
