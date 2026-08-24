import { simulateEvent, runMonteCarlo, runSeededSnapshot } from './simulate.js';

const SEED = Number(process.argv[2] ?? 19_281_726);

function line(label: string, value: string | number): void {
  process.stdout.write(`${label.padEnd(22)} ${String(value)}\n`);
}

process.stdout.write(`PodyGuard matching simulation  seed=${String(SEED)}\n\n`);
process.stdout.write('Seeded snapshots\n');
for (const size of [7, 11, 17, 30, 50, 100]) {
  const metrics = runSeededSnapshot(SEED, size, Math.max(1, Math.floor(size / 4)));
  line(
    `${String(size)} players`,
    `matched=${String(metrics.matched)} unmatched=${String(metrics.unmatched)} 4s=${String(metrics.fours)} 3s=${String(metrics.threes)} flex-concessions=${String(metrics.concessions)} invariants=${String(metrics.invariantFailures)}`,
  );
}

process.stdout.write('\nMonte Carlo\n');
for (const metrics of runMonteCarlo(SEED, [7, 11, 17, 30])) {
  line(
    `n=${String(metrics.playerCount)}`,
    `matched=${String(metrics.matched)} unmatched=${String(metrics.unmatched)} failures=${String(metrics.invariantFailures)}`,
  );
}

process.stdout.write('\nFull-event loops (8 rounds)\n');
for (const offset of [0, 1, 2]) {
  const event = simulateEvent(SEED + offset * 13);
  line(
    `event ${String(SEED + offset * 13)}`,
    `finishedPods=${String(event.finishedPods)} meanWaitTicks=${event.meanWaitTicks.toFixed(1)} lastUnmatched=${String(event.unmatched)} failures=${String(event.invariantFailures)}`,
  );
}
