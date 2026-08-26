import { Check, Shield, X } from 'lucide-react';
import { useState } from 'react';
import {
  treacheryIdentityById,
  type TreacheryRole,
} from '@podyguard/shared';
import { TreacheryRoleDialog } from '../TreacheryRoleDialog';
import { Button } from '../ui/Button';
import type { TrackerPlayer } from './engine';

export function TreacheryRolesSheet({
  players,
  roles,
  identities,
  unveiled,
  requireAllReviewed = false,
  onUnveil,
  onReady,
  onClose,
}: {
  players: TrackerPlayer[];
  roles: Record<string, TreacheryRole>;
  identities: Record<string, number>;
  unveiled: string[];
  requireAllReviewed?: boolean;
  onUnveil?: (playerId: string) => void;
  onReady?: () => void;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(() => new Set<string>());
  const selectable = players.filter((player) => roles[player.id]);
  const selected = players.find((player) => player.id === selectedId);
  const role = selected ? roles[selected.id] : undefined;
  const identity = selected
    ? treacheryIdentityById(identities[selected.id] ?? -1)
    : undefined;

  if (selected && role && identity) {
    return (
      <TreacheryRoleDialog
        assignment={{
          role,
          identity,
          unveiled: unveiled.includes(selected.id),
        }}
        holderName={selected.name}
        revealed={revealed}
        onReveal={() => setRevealed(true)}
        onUnveil={
          onUnveil
            ? async () => {
                onUnveil(selected.id);
              }
            : undefined
        }
        onClose={() => {
          setReviewed((current) => new Set(current).add(selected.id));
          setSelectedId(null);
          setRevealed(false);
        }}
      />
    );
  }

  const allReviewed =
    selectable.length > 0 &&
    selectable.every((player) => reviewed.has(player.id));
  return (
    <section className="flex h-full w-full flex-col">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h4 className="font-display text-sm font-bold">Secret identities</h4>
          <p className="text-muted text-xs">Choose only your own name.</p>
        </div>
        {!requireAllReviewed ? (
          <button
            type="button"
            aria-label="Close identities"
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
            {unveiled.includes(player.id) ? (
              <Shield size={14} aria-hidden className="text-warning" />
            ) : null}
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
          All identities checked
        </Button>
      ) : null}
    </section>
  );
}
