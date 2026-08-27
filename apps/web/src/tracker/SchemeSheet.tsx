import { useEffect, useState } from 'react';
import { Skull, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { schemeById, type SchemeCard } from './archenemy';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';

/**
 * The scheme in motion fills the sheet, and every other card the table still
 * cares about sits under it as a miniature: the ongoing schemes that are face
 * up, and the graveyard of everything that has finished. Tapping a miniature
 * brings that card up large without disturbing the game state, so the deck is
 * only ever advanced by Next scheme.
 */
export function SchemeSheet({
  currentSchemeId,
  activeSchemeIds,
  pastSchemeIds,
  remaining,
  disabled,
  onNext,
  onAbandon,
  onClose,
}: {
  currentSchemeId: string | null;
  activeSchemeIds: string[];
  pastSchemeIds: string[];
  remaining: number;
  disabled: boolean;
  onNext: () => void;
  onAbandon: (schemeId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [graveyardOpen, setGraveyardOpen] = useState(false);

  // A newly turned scheme is the one the table is resolving, so it takes over.
  useEffect(() => {
    setSelectedId(null);
    setGraveyardOpen(false);
  }, [currentSchemeId]);

  const shown = schemeById(selectedId ?? currentSchemeId ?? '');
  if (!shown) {
    return null;
  }
  const ongoing = activeSchemeIds
    .map((schemeId) => schemeById(schemeId))
    .filter((scheme): scheme is SchemeCard => Boolean(scheme));
  // Newest first, because the last card to leave is the one being asked about.
  const graveyard = [...pastSchemeIds]
    .reverse()
    .map((schemeId, index) => ({ key: `${schemeId}:${String(index)}`, scheme: schemeById(schemeId) }))
    .filter(
      (row): row is { key: string; scheme: SchemeCard } => Boolean(row.scheme),
    );
  const abandonable = activeSchemeIds.includes(shown.id);

  const schemeKind =
    shown.id === currentSchemeId
      ? shown.ongoing
        ? t('scheme.ongoingScheme')
        : t('scheme.scheme')
      : abandonable
        ? t('scheme.ongoingScheme')
        : t('scheme.pastScheme');

  return (
    <div className="flex max-h-full w-full max-w-4xl flex-col items-center gap-3 landscape:flex-row landscape:items-stretch">
      <img
        src={shown.imageUrl}
        alt={shown.name}
        className="max-h-[52dvh] min-h-0 rounded-xl object-contain shadow-2xl landscape:max-h-[94dvh] landscape:max-w-[62%]"
      />
      <div className="flex min-h-0 w-full max-w-sm flex-col justify-center gap-3 overflow-y-auto">
        <div>
          <p className="text-muted text-xs font-bold tracking-wider uppercase">
            {schemeKind}
          </p>
          <h2 className="font-display text-xl font-bold">{shown.name}</h2>
        </div>
        {abandonable ? (
          <Button
            size="sm"
            variant="glass"
            onClick={() => onAbandon(shown.id)}
          >
            {t('scheme.abandon', { name: shown.name })}
          </Button>
        ) : null}
        {ongoing.length > 0 ? (
          <div className="border-warning/30 bg-warning/10 rounded-xl border p-3">
            <p className="text-warning mb-2 text-xs font-bold tracking-wider uppercase">
              {t('scheme.ongoingSchemes')}
            </p>
            <SchemeStrip
              schemes={ongoing.map((scheme) => ({
                key: scheme.id,
                scheme,
              }))}
              selectedId={shown.id}
              onSelect={setSelectedId}
            />
          </div>
        ) : null}
        {graveyard.length > 0 ? (
          <div className="border-muted/20 rounded-xl border p-3">
            <button
              type="button"
              aria-expanded={graveyardOpen}
              onClick={() => setGraveyardOpen((open) => !open)}
              className="text-muted hover:text-ink flex w-full items-center gap-2 text-xs font-bold tracking-wider uppercase transition"
            >
              <Skull size={14} aria-hidden />
              {t('scheme.graveyard', { count: graveyard.length })}
            </button>
            {graveyardOpen ? (
              <div className="mt-2">
                <SchemeStrip
                  schemes={graveyard}
                  selectedId={shown.id}
                  onSelect={setSelectedId}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="neon"
            disabled={disabled || remaining === 0}
            onClick={onNext}
          >
            <Sparkles size={16} aria-hidden />
            {t('scheme.nextScheme')}
          </Button>
          <Button variant="glass" onClick={onClose}>
            {t('common.close')}
          </Button>
          <span className="text-muted text-[0.65rem]">
            {t('scheme.remainingInDeck', { count: remaining })}
          </span>
        </div>
        <p className="text-muted text-[0.65rem]">{t('scheme.scryfallCredit')}</p>
      </div>
    </div>
  );
}

function SchemeStrip({
  schemes,
  selectedId,
  onSelect,
}: {
  schemes: Array<{ key: string; scheme: SchemeCard }>;
  selectedId: string;
  onSelect: (schemeId: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {schemes.map(({ key, scheme }) => (
        <button
          key={key}
          type="button"
          aria-label={scheme.name}
          aria-pressed={scheme.id === selectedId}
          onClick={() => onSelect(scheme.id)}
          className={cx(
            'shrink-0 overflow-hidden rounded-lg border transition',
            scheme.id === selectedId
              ? 'border-neon shadow-[0_0_16px_-4px_var(--color-neon)]'
              : 'border-muted/25 opacity-70 hover:opacity-100',
          )}
        >
          <img
            src={scheme.thumbnailUrl}
            alt=""
            loading="lazy"
            className="h-20 w-auto"
          />
        </button>
      ))}
    </div>
  );
}
