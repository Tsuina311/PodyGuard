import { useState } from 'react';
import {
  TREACHERY_ROLE_INFO,
  type TreacheryRoleAssignment,
} from '@podyguard/shared';
import { Button } from './ui/Button';

const roleColour = {
  leader: 'border-warning/60 text-warning shadow-[0_0_40px_-12px_var(--color-warning)]',
  guardian: 'border-beam/60 text-beam shadow-[0_0_40px_-12px_var(--color-beam)]',
  assassin: 'border-danger/60 text-danger shadow-[0_0_40px_-12px_var(--color-danger)]',
  traitor: 'border-plasma/60 text-plasma shadow-[0_0_40px_-12px_var(--color-plasma)]',
} as const;

export function TreacheryRoleDialog({
  assignment,
  revealed,
  onReveal,
  onClose,
  onUnveil,
}: {
  assignment: TreacheryRoleAssignment;
  revealed: boolean;
  onReveal: () => void;
  onClose: () => void;
  onUnveil?: () => Promise<void>;
}) {
  const info = TREACHERY_ROLE_INFO[assignment.role];
  const [confirmingUnveil, setConfirmingUnveil] = useState(false);
  const [unveiling, setUnveiling] = useState(false);
  const [unveilError, setUnveilError] = useState<string | null>(null);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={revealed ? `Your role: ${info.name}` : 'You received a role'}
      className="bg-void/90 fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto p-4 backdrop-blur-md"
    >
      <section
        className={`bg-hull my-auto w-full max-w-md rounded-2xl border p-5 text-center ${
          revealed ? roleColour[assignment.role] : 'border-neon/30'
        }`}
      >
        {!revealed ? (
          <>
            <p className="text-muted mb-2 font-mono text-xs tracking-[0.22em] uppercase">
              Treachery
            </p>
            <h2 className="font-display mb-3 text-2xl font-bold">
              You have received your role
            </h2>
            <p className="text-muted mb-6 text-sm">
              Make sure nobody else can see your screen before revealing it.
            </p>
            <Button variant="neon" size="lg" block onClick={onReveal}>
              Reveal
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted mb-2 font-mono text-xs tracking-[0.22em] uppercase">
              Your role
            </p>
            <h2 className="font-display mb-4 text-4xl font-black uppercase">
              {info.name}
            </h2>
            <img
              src={assignment.identity.image}
              alt={`${assignment.identity.name}, ${info.name} identity`}
              className="mx-auto mb-4 max-h-[52dvh] w-auto max-w-full rounded-xl shadow-2xl"
            />
            <h3 className="font-display mb-1 text-xl font-bold">
              {assignment.identity.name}
            </h3>
            <p className="text-muted mb-4 text-xs">
              Illustrated by {assignment.identity.artist}
            </p>
            <div className="text-ink mb-5 space-y-3 text-left">
              <div>
                <p className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">
                  Your objective
                </p>
                <p className="font-semibold">{info.objective}</p>
              </div>
              <p className="text-muted text-sm">{info.guidance}</p>
              {info.public ? (
                <p className="text-warning text-sm font-semibold">
                  Your role is public. Tell the table you are the Leader.
                </p>
              ) : (
                <p className="text-neon text-sm font-semibold">
                  Keep this role secret.
                </p>
              )}
            </div>
            {assignment.unveiled ? (
              <p className="text-warning mb-3 text-sm font-bold tracking-wide uppercase">
                Unveiled to the table
              </p>
            ) : onUnveil ? (
              confirmingUnveil ? (
                <div className="border-danger/30 mb-3 rounded-xl border p-3">
                  <p className="text-danger mb-3 text-sm font-semibold">
                    Everyone at your table will see this identity. Its ability
                    must be resolved in the game.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="ghost"
                      disabled={unveiling}
                      onClick={() => setConfirmingUnveil(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      disabled={unveiling}
                      onClick={() => {
                        setUnveiling(true);
                        setUnveilError(null);
                        void onUnveil()
                          .then(() => setConfirmingUnveil(false))
                          .catch((caught: unknown) => {
                            setUnveilError(
                              caught instanceof Error
                                ? caught.message
                                : 'Could not unveil your identity.',
                            );
                          })
                          .finally(() => setUnveiling(false));
                      }}
                    >
                      {unveiling ? 'Unveiling…' : 'Confirm unveil'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="neon"
                  block
                  className="mb-3"
                  onClick={() => setConfirmingUnveil(true)}
                >
                  Unveil to the table
                </Button>
              )
            ) : null}
            {unveilError ? (
              <p className="text-danger mb-3 text-sm">{unveilError}</p>
            ) : null}
            <Button variant="glass" size="lg" block onClick={onClose}>
              Hide my identity
            </Button>
          </>
        )}
      </section>
    </div>
  );
}
