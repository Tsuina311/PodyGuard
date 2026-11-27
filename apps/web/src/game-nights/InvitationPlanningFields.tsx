import { useTranslation } from 'react-i18next';
import type { PlaygroupOverview } from '@podyguard/shared';
import { Field } from '../ui/Field';

export function InvitationPlanningFields({ enabled, onEnabled, signedIn, playgroup, invitedIds, onInvitedIds, startsAt, onStartsAt, location, onLocation }: {
  enabled: boolean; onEnabled: (value: boolean) => void; signedIn: boolean;
  playgroup: PlaygroupOverview | null; invitedIds: string[]; onInvitedIds: (ids: string[]) => void;
  startsAt: string; onStartsAt: (value: string) => void; location: string; onLocation: (value: string) => void;
}) {
  const { t } = useTranslation();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <section className="mb-4 rounded-xl border border-muted/25 p-3">
    <label className="flex min-h-11 items-center gap-2 font-semibold">
      <input type="checkbox" checked={enabled} disabled={!signedIn} onChange={event => onEnabled(event.target.checked)} />
      {t('invitationPlan.plan')}
    </label>
    <p className="mb-2 text-sm text-muted">{t(signedIn ? 'invitationPlan.hint' : 'invitationPlan.signIn')}</p>
    {enabled && <>
      <Field label={t('invitationPlan.when', { timeZone })} type="datetime-local" required value={startsAt} onChange={event => onStartsAt(event.target.value)} />
      <Field label={t('invitationPlan.location')} required maxLength={200} value={location} onChange={event => onLocation(event.target.value)} />
      <fieldset>
        <legend className="mb-2 font-semibold">{t('invitationPlan.invited')}</legend>
        {!playgroup && <p className="text-sm text-muted">{t('invitationPlan.chooseGroup')}</p>}
        <div className="flex flex-wrap gap-2">
          {playgroup?.guests.map(({ guest }) => <label key={guest.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-muted/25 px-3 py-2 text-sm">
            <input type="checkbox" checked={invitedIds.includes(guest.id)} disabled={!invitedIds.includes(guest.id) && invitedIds.length >= 100}
              onChange={event => onInvitedIds(event.target.checked ? [...invitedIds, guest.id] : invitedIds.filter(id => id !== guest.id))} />
            {guest.displayName}
          </label>)}
        </div>
        <p className="mt-2 text-xs text-muted">{t('invitationPlan.count', { count: invitedIds.length })}</p>
      </fieldset>
    </>}
  </section>;
}
