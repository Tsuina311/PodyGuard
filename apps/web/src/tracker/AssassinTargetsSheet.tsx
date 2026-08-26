import { Check, Crosshair, Eye, X } from 'lucide-react';
import { useState } from 'react';
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
              Hand the device to {selected.name}
            </h4>
            <p className="text-muted mb-5 max-w-sm text-sm">
              Everyone else should look away before the contract is revealed.
            </p>
            <Button variant="neon" onClick={() => setRevealed(true)}>
              <Eye size={16} aria-hidden />
              Reveal my target
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted mb-1 text-xs tracking-widest uppercase">
              Your target
            </p>
            <h4 className="font-display text-danger mb-2 text-3xl font-bold">
              {target?.name ?? 'No active target'}
            </h4>
            <p className="text-muted mb-5 text-sm">
              Marks scored: {scores[selected.id] ?? 0}
            </p>
            <Button
              variant="glass"
              onClick={() => {
                setReviewed((current) => new Set(current).add(selected.id));
                setSelectedId(null);
                setRevealed(false);
              }}
            >
              Hide & pass
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
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h4 className="font-display text-sm font-bold">Secret contracts</h4>
          <p className="text-muted text-xs">Choose only your own name.</p>
        </div>
        {!requireAllReviewed ? (
          <button
            type="button"
            aria-label="Close contracts"
            onClick={onClose}
            className="border-muted/25 text-muted flex size-8 items-center justify-center rounded-full border"
          >
            <X size={18} aria-hidden />
          </button>
        ) : null}
      </header>
      <div className="grid min-h-0 flex-1 content-center gap-2 overflow-y-auto sm:grid-cols-2">
        {selectable.map((player) => (
          <Button
            key={player.id}
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
        <Button
          variant="primary"
          size="lg"
          block
          disabled={!allReviewed}
          onClick={onReady}
        >
          All contracts checked
        </Button>
      ) : null}
    </section>
  );
}
