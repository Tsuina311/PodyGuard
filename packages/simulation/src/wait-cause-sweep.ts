import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import { DEFAULT_ARTIFACT_DIRECTORY } from './artifacts.js';
import { runSimulation, SIMULATION_ENGINE_VERSION } from './engine.js';
import type { EventMetricRecord } from './metrics.js';
import { SCENARIOS, SCENARIO_SUITE_VERSION, getScenario } from './scenarios.js';
import { createFrozenQueueV2GraceStrategy } from './strategy.js';
import {
  aggregateWaitCauses,
  replayParticipantCycles,
  replaySevereExclusiveCycles,
} from './wait-cause-metrics.js';

export const WAIT_CAUSE_SWEEP_PATH = resolve(
  DEFAULT_ARTIFACT_DIRECTORY,
  'queue-v2-wait-cause-diagnostic.json',
);

export const WAIT_CAUSE_REPLAYS = [
  { scenarioId: 'B4_STARVATION_30', seed: 529 },
  { scenarioId: 'B4_STARVATION_30', seed: 231 },
  { scenarioId: 'B4_STARVATION_30', seed: 637 },
] as const;

export function runWaitCauseSweep(
  runs = 100,
  seedStart = 1,
  onProgress?: (completed: number, total: number) => void,
) {
  const strategy = createFrozenQueueV2GraceStrategy();
  const records: EventMetricRecord[] = [];
  const total = SCENARIOS.length * runs;
  let completed = 0;
  const started = performance.now();
  for (const scenario of SCENARIOS) {
    for (let seed = seedStart; seed < seedStart + runs; seed += 1) {
      records.push(
        runSimulation(scenario, {
          seed,
          strategy,
          randomizationMode: 'paired-v1',
        }).record,
      );
      completed += 1;
      onProgress?.(completed, total);
    }
  }
  const elapsedMs = performance.now() - started;
  const summary = aggregateWaitCauses(records);
  const replays = WAIT_CAUSE_REPLAYS.map((replay) => {
    const result = runSimulation(getScenario(replay.scenarioId), {
      seed: replay.seed,
      strategy,
      randomizationMode: 'paired-v1',
      debug: true,
    });
    return {
      ...replay,
      strategyId: result.metadata.strategyId,
      severeB4: replaySevereExclusiveCycles(result.record, 'B4', 1_800),
      allB4Exclusive: uniqueParticipants(result.record, 'B4').flatMap((id) =>
        replayParticipantCycles(result.record, id),
      ),
      connectors: result.record.participants.filter(
        (participant) =>
          (participant.acceptedPoolIds?.length ?? 0) > 1 &&
          participant.acceptedPoolIds?.includes('B4'),
      ),
    };
  });

  return {
    schemaVersion: 1 as const,
    generatedAt: new Date().toISOString(),
    metadata: {
      experiment: 'wait-cause-diagnostic',
      suiteVersion: SCENARIO_SUITE_VERSION,
      engineVersion: SIMULATION_ENGINE_VERSION,
      strategyId: strategy.id,
      randomizationMode: 'paired-v1' as const,
      runsPerScenario: runs,
      seedStart,
      seedEnd: seedStart + runs - 1,
      scenarioIds: SCENARIOS.map((scenario) => scenario.id),
      elapsedMs,
      nights: records.length,
      classification:
        'OPPORTUNITY_GRACE < TABLE_CAPACITY for grace-only pods with no table; legal non-grace pod → TABLE_CAPACITY or MATCHER_CHOICE; else connector lockout; else STRUCTURAL_SCARCITY. Connector lockout is retrospective, not online-avoidable proof.',
    },
    summary,
    replays,
  };
}

export function writeWaitCauseSweep(
  result: ReturnType<typeof runWaitCauseSweep>,
  path = WAIT_CAUSE_SWEEP_PATH,
): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
  return path;
}

export function formatWaitCauseReport(
  result: ReturnType<typeof runWaitCauseSweep>,
): string {
  const { summary, metadata } = result;
  const lines = [
    'Wait-cause diagnostic (frozen queue-v2 grace 120s / max-wait 600s)',
    `nights=${metadata.nights} runtime=${(metadata.elapsedMs / 1000).toFixed(1)}s accountingFailures=${summary.accountingFailures}`,
    '',
    formatShare('GLOBAL', summary.global),
    formatShare('CYCLES >5m', summary.byMinWait['5m']),
    formatShare('CYCLES >10m', summary.byMinWait['10m']),
    formatShare('CYCLES >30m', summary.byMinWait['30m']),
    formatShare('CYCLES >60m', summary.byMinWait['60m']),
    formatShare('B2-exclusive', summary.exclusive.B2),
    formatShare('B3-exclusive', summary.exclusive.B3),
    formatShare('B4-exclusive', summary.exclusive.B4),
    formatShare('B4-exclusive >30m', summary.exclusiveB4Over30m),
    formatShare('B4-exclusive >60m', summary.exclusiveB4Over60m),
    '',
    `DIRECTLY_ADDRESSABLE (matcher choice) mean=${summary.directlyAddressable.meanMinutesPerAttendee.toFixed(2)}m p95=${summary.directlyAddressable.p95Minutes.toFixed(2)}m >5m=${pct(summary.directlyAddressable.over5MinuteRate)}`,
    `POTENTIALLY_ADDRESSABLE (+ other-pool lockout) mean=${summary.potentiallyAddressable.meanMinutesPerAttendee.toFixed(2)}m p95=${summary.potentiallyAddressable.p95Minutes.toFixed(2)}m >5m=${pct(summary.potentiallyAddressable.over5MinuteRate)}`,
    '',
    `OTHER_POOL lockout events=${summary.connectorLockoutOtherPool.events} minutes=${summary.connectorLockoutOtherPool.totalMinutes.toFixed(1)} p50=${summary.connectorLockoutOtherPool.durationSeconds.p50}s p95=${summary.connectorLockoutOtherPool.durationSeconds.p95}s max=${summary.connectorLockoutOtherPool.durationSeconds.max}s attendees=${summary.connectorLockoutOtherPool.affectedAttendeeNights} otherConnectorFirst=${summary.connectorLockoutOtherPool.eventsWhereAnotherConnectorArrivedFirst}`,
    `lockout pools=${JSON.stringify(summary.connectorLockoutOtherPool.byWaitingPool)}`,
  ];
  for (const replay of result.replays) {
    const cycles =
      replay.scenarioId === 'B4_STARVATION_30' && replay.seed === 637
        ? replay.allB4Exclusive.filter((cycle) => cycle.waitSeconds > 0)
        : replay.severeB4.length > 0
          ? replay.severeB4
          : replay.allB4Exclusive.filter((cycle) => cycle.waitSeconds >= 300);
    lines.push('', `${replay.scenarioId} seed ${replay.seed}`);
    if (cycles.length === 0) {
      lines.push('  (no B4-exclusive cycles above threshold)');
    }
    for (const cycle of cycles) {
      lines.push(
        `  ${cycle.participantId} c${cycle.cycle} wait=${cycle.waitSeconds}s matched=${cycle.reason} struct=${cycle.causes.structuralScarcity} lockOther=${cycle.causes.connectorLockoutOtherPool} lockSame=${cycle.causes.connectorLockoutSamePool} table=${cycle.causes.tableCapacity} choice=${cycle.causes.matcherChoice} grace=${cycle.causes.opportunityGrace} unk=${cycle.causes.unknown}`,
      );
      for (const interval of cycle.intervals) {
        lines.push(
          `    ${interval.startedAt}-${interval.endedAt} ${interval.cause}${
            interval.connector
              ? ` connector=${interval.connector.id}@${interval.connector.assignedPoolId}->${interval.connector.waitingPoolId}`
              : ''
          }`,
        );
      }
    }
  }
  return lines.join('\n');
}

function formatShare(label: string, share: ReturnType<typeof aggregateWaitCauses>['global']): string {
  return (
    `${label} minutes=${(share.total / 60).toFixed(1)} ` +
    `struct=${pct(share.percent.structuralScarcity)} ` +
    `table=${pct(share.percent.tableCapacity)} ` +
    `choice=${pct(share.percent.matcherChoice)} ` +
    `lockOther=${pct(share.percent.connectorLockoutOtherPool)} ` +
    `lockSame=${pct(share.percent.connectorLockoutSamePool)} ` +
    `grace=${pct(share.percent.opportunityGrace)} ` +
    `unk=${pct(share.percent.unknown)}`
  );
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function uniqueParticipants(record: EventMetricRecord, poolId: string): string[] {
  return record.participants
    .filter(
      (participant) =>
        participant.acceptedPoolIds?.length === 1 &&
        participant.acceptedPoolIds[0] === poolId,
    )
    .map((participant) => participant.id);
}
