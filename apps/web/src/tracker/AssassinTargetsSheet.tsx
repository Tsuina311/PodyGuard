import { Check, Crosshair, Eye, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import type { TrackerPlayer } from './engine';

export function AssassinTargetsSheet({
  players,
  targets,
  scores,
  requireAllReviewed = false,
  onReady,
  onClose,
}: {
  players: TrackerPlayer[];
  targets: Record<string, string>;
  scores: Record<string, number>;
  requireAllReviewed?: boolean;
  onReady?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(() => new Set<string>());
  const selectable = players.filter(
    (player) => !player.eliminated && targets[player.id],
  );
  const selected = players.find((player) => player.id === selectedId);
  const target = players.find(
    (player) => player.id === targets[selectedId ?? ''],
  );

  if (selected) {
    return (
      <section className="flex h-full w-full flex-col items-center justify-center text-center">
        <Crosshair size={28} aria-hidden className="text-danger mb-3" />
        {!revealed ? (
          <>
            <h4 className="font-display mb-2 text-xl font-bold">
              {t('assassinTargets.handDeviceTo', { name: selected.name })}
            </h4>
            <p className="text-muted mb-5 max-w-sm text-sm">
              {t('assassinTargets.lookAway')}
            </p>
            <Button variant="neon" onClick={() => setRevealed(true)}>
              <Eye size={16} aria-hidden />
              {t('assassinTargets.revealTarget')}
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted mb-1 text-xs tracking-widest uppercase">
              {t('assassinTargets.yourTarget')}
            </p>
            <h4 className="font-display text-danger mb-2 text-3xl font-bold">
              {target?.name ?? t('assassinTargets.noActiveTarget')}
            </h4>
            <p className="text-muted mb-5 text-sm">
              {t('assassinTargets.marksScored', {
                count: scores[selected.id] ?? 0,
              })}
            </p>
            <Button
              variant="glass"
              onClick={() => {
                setReviewed((current) => new Set(current).add(selected.id));
                setSelectedId(null);
                setRevealed(false);
              }}
            >
              {t('assassinTargets.hideAndPass')}
            </Button>
          </>
        )}
      </section>
    );
  }

  const allReviewed =
    selectable.length > 0 &&
    selectable.every((player) => reviewed.has(player.id));
  return (
    <section className="flex h-full w-full flex-col">
      <header className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <div>
          <h4 className="font-display text-sm font-bold">
            {t('assassinTargets.title')}
          </h4>
          <p className="text-muted text-xs">{t('assassinTargets.chooseOwnName')}</p>
        </div>
        {!requireAllReviewed ? (
          <button
            type="button"
            aria-label={t('assassinTargets.closeContracts')}
            onClick={onClose}
            className="border-muted/25 text-muted flex size-8 items-center justify-center rounded-full border"
          >
            <X size={18} aria-hidden />
          </button>
        ) : null}
      </header>
      <div className="grid min-h-0 flex-1 content-center gap-3 overflow-y-auto p-0.5 sm:grid-cols-2">
        {selectable.map((player) => (
          <Button
            key={player.id}
            size="lg"
            variant={reviewed.has(player.id) ? 'glass' : 'neon'}
            onClick={() => setSelectedId(player.id)}
          >
            {reviewed.has(player.id) ? <Check size={15} aria-hidden /> : null}
            {player.name}
            <span className="text-muted text-xs">
              · {scores[player.id] ?? 0}
            </span>
          </Button>
        ))}
      </div>
      {requireAllReviewed ? (
        <div className="border-muted/15 mt-4 shrink-0 border-t pt-4">
          <Button
            variant="primary"
            size="lg"
            block
            disabled={!allReviewed}
            onClick={onReady}
          >
            {t('assassinTargets.allContractsChecked')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
