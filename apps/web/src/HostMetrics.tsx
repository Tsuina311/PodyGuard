import type { EventMetrics } from '@podyguard/shared';
import { Panel } from './ui/Panel';

export function HostMetrics({ metrics }: { metrics: EventMetrics }) {
  return (
    <Panel title="Event recap" aside="pilot">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <Metric label="Players" value={metrics.participants} />
        <Metric label="Games" value={metrics.games} />
        <Metric
          label="Games / player"
          value={metrics.gamesPerPlayer.toFixed(1)}
        />
        <Metric
          label="Wait avg"
          value={seconds(metrics.waitSeconds?.average)}
        />
        <Metric label="Wait p95" value={seconds(metrics.waitSeconds?.p95)} />
        <Metric label="Wait max" value={seconds(metrics.waitSeconds?.max)} />
        <Metric label="Rematch pairs" value={metrics.rematches} />
        <Metric label="Flex earned" value={metrics.flexEarned} />
        <Metric label="Flex seats" value={metrics.flexCompensation} />
        <Metric
          label="Duration avg"
          value={seconds(metrics.gameDurationSeconds?.average)}
        />
        <Metric
          label="Tables occupied"
          value={`${String(metrics.tableUtilisation.occupied)}/${String(metrics.tableUtilisation.total)}`}
        />
        <Metric
          label="Tracker used"
          value={`${String(metrics.trackerUsage.used)} used · ${String(metrics.trackerUsage.skipped)} skipped`}
        />
        <Metric label="Challenges" value={metrics.challengeCompletions} />
        <Metric label="Challenge pts" value={metrics.challengePoints} />
        <Metric
          label="Pod rating"
          value={
            metrics.podRating
              ? `${metrics.podRating.average.toFixed(1)} (${String(metrics.podRating.count)})`
              : '—'
          }
        />
      </dl>
      <p className="text-muted mt-3 text-xs">
        Pod sizes:{' '}
        {Object.keys(metrics.podSizes).length === 0
          ? 'none yet'
          : Object.entries(metrics.podSizes)
              .map(([size, count]) => `${size}p × ${String(count)}`)
              .join(' · ')}
      </p>
      <p className="text-muted mt-1 text-xs">
        Pools:{' '}
        {Object.keys(metrics.poolAssignments).length === 0
          ? 'none yet'
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

function seconds(value: number | undefined): string {
  if (value === undefined) {
    return '—';
  }
  return `${Math.round(value)}s`;
}
