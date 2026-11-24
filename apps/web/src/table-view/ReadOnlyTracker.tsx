import type { TrackerState } from '../tracker/engine';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';
import { useWakeLock } from '../tracker/wake-lock';
import { useTranslation } from 'react-i18next';

export function ReadOnlyTracker({ state, ownerName, stale, error, onClose, onTransfer }: {
  state: TrackerState; ownerName: string; stale?: boolean; error?: string;
  onClose: () => void; onTransfer?: () => void;
}) {
  const { t } = useTranslation();
  useWakeLock(true);
  return <section aria-label={t('eventTracker.readOnly')} className="fixed inset-0 z-40 flex h-dvh flex-col gap-2 bg-void p-2 text-ink">
    <header className="shrink-0 rounded-xl border border-muted/30 bg-hull p-3">
      <p className="font-semibold">{t('eventTracker.trackedBy', { name: ownerName })}</p>
      <p role="status" className={stale ? 'text-sm text-warning' : 'text-sm text-muted'}>
        {error || (stale ? t('eventTracker.stale') : t('eventTracker.readOnly'))}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onClose}>{t('common.close')}</Button>
        {onTransfer && <Button size="sm" onClick={onTransfer}>{t('eventTracker.transfer')}</Button>}
      </div>
    </header>
    <div className={cx('grid min-h-0 flex-1 auto-rows-fr gap-2', state.players.length === 2 ? 'grid-cols-1 landscape:grid-cols-2' : 'grid-cols-2')}>
      {state.players.map(player => <article key={player.id} aria-label={`${player.name}: ${player.life} life`}
        className={cx('relative flex min-h-0 flex-col items-center justify-center overflow-auto rounded-2xl border p-3 text-center', player.eliminated ? 'border-danger/40 opacity-60' : 'border-muted/30 bg-hull')}>
        <h2 className="text-lg font-bold">{player.name}</h2>
        {state.firstPlayerId === player.id && <p className="text-sm text-neon">{t('eventTracker.first')}</p>}
        <p className="font-display text-[clamp(3rem,12vh,8rem)] font-bold leading-none">{player.life}</p>
        {player.poison > 0 && <p>Poison: {player.poison}</p>}
        {player.commanderTax > 0 && <p>Commander tax: {player.commanderTax}</p>}
        <p className="text-sm text-muted">{player.commanders.map(c => c.name).join(' · ')}</p>
        <div className="flex flex-wrap justify-center gap-x-3 text-sm">
          {Object.entries(player.counters).filter(([, value]) => value !== 0).map(([name, value]) => <span key={name}>{name}: {value}</span>)}
          {Object.entries(player.commanderDamage).filter(([, value]) => value !== 0).map(([id, value]) =>
            <span key={id}>{state.players.flatMap(p => p.commanders).find(c => c.id === id)?.name ?? 'Commander damage'}: {value}</span>)}
        </div>
      </article>)}
    </div>
  </section>;
}
