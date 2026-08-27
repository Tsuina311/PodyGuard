import type { EventMetrics } from '@podyguard/shared';
import { useTranslation } from 'react-i18next';
import { Panel } from './ui/Panel';

export function HostMetrics({ metrics }: { metrics: EventMetrics }) {
  const { t } = useTranslation();

  return (
    <Panel title={t('hostMetrics.title')} aside={t('hostMetrics.aside')}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <Metric label={t('hostMetrics.players')} value={metrics.participants} />
        <Metric label={t('hostMetrics.games')} value={metrics.games} />
        <Metric
          label={t('hostMetrics.gamesPerPlayer')}
          value={metrics.gamesPerPlayer.toFixed(1)}
        />
        <Metric
          label={t('hostMetrics.waitAvg')}
          value={seconds(metrics.waitSeconds?.average, t('common.dash'))}
        />
        <Metric
          label={t('hostMetrics.waitP95')}
          value={seconds(metrics.waitSeconds?.p95, t('common.dash'))}
        />
        <Metric
          label={t('hostMetrics.waitMax')}
          value={seconds(metrics.waitSeconds?.max, t('common.dash'))}
        />
        <Metric label={t('hostMetrics.rematchPairs')} value={metrics.rematches} />
        <Metric label={t('hostMetrics.flexEarned')} value={metrics.flexEarned} />
        <Metric label={t('hostMetrics.flexSeats')} value={metrics.flexCompensation} />
        <Metric
          label={t('hostMetrics.durationAvg')}
          value={seconds(metrics.gameDurationSeconds?.average, t('common.dash'))}
        />
        <Metric
          label={t('hostMetrics.tablesOccupied')}
          value={`${String(metrics.tableUtilisation.occupied)}/${String(metrics.tableUtilisation.total)}`}
        />
        <Metric
          label={t('hostMetrics.trackerUsed')}
          value={t('hostMetrics.trackerUsedValue', {
            used: metrics.trackerUsage.used,
            skipped: metrics.trackerUsage.skipped,
          })}
        />
        <Metric
          label={t('hostMetrics.challenges')}
          value={metrics.challengeCompletions}
        />
        <Metric
          label={t('hostMetrics.challengePts')}
          value={metrics.challengePoints}
        />
        <Metric
          label={t('hostMetrics.podRating')}
          value={
            metrics.podRating
              ? `${metrics.podRating.average.toFixed(1)} (${String(metrics.podRating.count)})`
              : t('common.dash')
          }
        />
      </dl>
      <p className="text-muted mt-3 text-xs">
        {t('hostMetrics.podSizes')}{' '}
        {Object.keys(metrics.podSizes).length === 0
          ? t('common.noneYet')
          : Object.entries(metrics.podSizes)
              .map(([size, count]) => `${size}p × ${String(count)}`)
              .join(' · ')}
      </p>
      <p className="text-muted mt-1 text-xs">
        {t('hostMetrics.pools')}{' '}
        {Object.keys(metrics.poolAssignments).length === 0
          ? t('common.noneYet')
          : Object.entries(metrics.poolAssignments)
              .map(([pool, count]) => `${pool} × ${String(count)}`)
              .join(' · ')}
      </p>
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-muted text-[0.65rem] tracking-[0.16em] uppercase">
        {label}
      </dt>
      <dd className="font-display text-base font-semibold">{value}</dd>
    </div>
  );
}

function seconds(value: number | undefined, dash: string): string {
  if (value === undefined) {
    return dash;
  }
  return `${Math.round(value)}s`;
}
