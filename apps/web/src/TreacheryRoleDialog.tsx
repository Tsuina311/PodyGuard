import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type TreacheryRole,
  type TreacheryRoleAssignment,
} from '@podyguard/shared';
import { assetUrl } from './asset-url';
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
  holderName,
  onReveal,
  onClose,
  onUnveil,
}: {
  assignment: Pick<TreacheryRoleAssignment, 'role' | 'identity' | 'unveiled'>;
  revealed: boolean;
  /** Named when the table shares one device, so it can be handed over. */
  holderName?: string;
  onReveal: () => void;
  onClose: () => void;
  onUnveil?: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const roleKey = assignment.role as TreacheryRole;
  const roleName = t(`modes.treachery.roles.${roleKey}.name`);
  const roleObjective = t(`modes.treachery.roles.${roleKey}.objective`);
  const roleGuidance = t(`modes.treachery.roles.${roleKey}.guidance`);
  const rolePublicNote = t(`modes.treachery.roles.${roleKey}.publicNote`);
  const isPublicRole = roleKey === 'leader';
  const [confirmingUnveil, setConfirmingUnveil] = useState(false);
  const [unveiling, setUnveiling] = useState(false);
  const [unveilError, setUnveilError] = useState<string | null>(null);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={
        revealed
          ? t('treacheryRole.yourRole') + `: ${roleName}`
          : t('treacheryRole.receivedRole')
      }
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
              {t('treacheryRole.treachery')}
            </p>
            <h2 className="font-display mb-3 text-2xl font-bold">
              {holderName
                ? t('treacheryRole.handDeviceTo', { name: holderName })
                : t('treacheryRole.receivedRole')}
            </h2>
            <p className="text-muted mb-6 text-sm">
              {holderName
                ? t('treacheryRole.lookAwayIdentity')
                : t('treacheryRole.lookAwayScreen')}
            </p>
            <Button variant="neon" size="lg" block onClick={onReveal}>
              {t('treacheryRole.reveal')}
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted mb-2 font-mono text-xs tracking-[0.22em] uppercase">
              {t('treacheryRole.yourRole')}
            </p>
            <h2 className="font-display mb-4 text-4xl font-black uppercase">
              {roleName}
            </h2>
            <img
              src={assetUrl(assignment.identity.image)}
              alt={t('treacheryRole.identityAlt', {
                name: assignment.identity.name,
                role: roleName,
              })}
              className="mx-auto mb-4 max-h-[52dvh] w-auto max-w-full rounded-xl shadow-2xl"
            />
            <h3 className="font-display mb-1 text-xl font-bold">
              {assignment.identity.name}
            </h3>
            <p className="text-muted mb-4 text-xs">
              {t('treacheryRole.illustratedBy', {
                artist: assignment.identity.artist,
              })}
            </p>
            <div className="text-ink mb-5 space-y-3 text-left">
              <div>
                <p className="text-muted mb-1 text-xs font-semibold tracking-wide uppercase">
                  {t('treacheryRole.yourObjective')}
                </p>
                <p className="font-semibold">{roleObjective}</p>
              </div>
              <p className="text-muted text-sm">{roleGuidance}</p>
              {isPublicRole ? (
                <p className="text-warning text-sm font-semibold">
                  {rolePublicNote}
                </p>
              ) : (
                <p className="text-neon text-sm font-semibold">
                  {rolePublicNote}
                </p>
              )}
            </div>
            {assignment.unveiled ? (
              <p className="text-warning mb-3 text-sm font-bold tracking-wide uppercase">
                {t('treacheryRole.unveiledToTable')}
              </p>
            ) : onUnveil ? (
              confirmingUnveil ? (
                <div className="border-danger/30 mb-3 rounded-xl border p-3">
                  <p className="text-danger mb-3 text-sm font-semibold">
                    {t('treacheryRole.unveilWarning')}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="ghost"
                      disabled={unveiling}
                      onClick={() => setConfirmingUnveil(false)}
                    >
                      {t('common.cancel')}
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
                                : t('common.errors.unveilIdentity'),
                            );
                          })
                          .finally(() => setUnveiling(false));
                      }}
                    >
                      {unveiling
                        ? t('common.unveiling')
                        : t('treacheryRole.confirmUnveil')}
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
                  {t('treacheryRole.unveilToTable')}
                </Button>
              )
            ) : null}
            {unveilError ? (
              <p className="text-danger mb-3 text-sm">{unveilError}</p>
            ) : null}
            <Button variant="glass" size="lg" block onClick={onClose}>
              {holderName
                ? t('treacheryRole.hideAndPass')
                : t('treacheryRole.hideIdentity')}
            </Button>
          </>
        )}
      </section>
    </div>
  );
}
