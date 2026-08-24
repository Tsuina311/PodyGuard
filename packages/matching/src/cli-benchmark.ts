import { createMatches } from './create-matches.js';
import { mulberry32 } from './rng.js';
import { randomReadyField, runSeededSnapshot } from './simulate.js';

const SEED = Number(process.argv[2] ?? 19_281_726);

function timeMs(run: () => void): number {
  const start = performance.now();
  run();
  return performance.now() - start;
}

process.stdout.write(`PodyGuard matching benchmark  seed=${String(SEED)}\n\n`);
process.stdout.write(
  `${'n'.padStart(6)} ${'tables'.padStart(8)} ${'matched'.padStart(8)} ${'unmatched'.padStart(10)} ${'ms'.padStart(10)}\n`,
);

for (const size of [17, 30, 50, 100, 500]) {
  const tables = Math.max(1, Math.floor(size / 4));
  const field = randomReadyField(mulberry32(SEED + size), size, tables);
  const elapsed = timeMs(() => {
    createMatches(field.participants, field.tables, field.history);
  });
  const metrics = runSeededSnapshot(SEED + size, size, tables);
  process.stdout.write(
    `${String(size).padStart(6)} ${String(tables).padStart(8)} ${String(metrics.matched).padStart(8)} ${String(metrics.unmatched).padStart(10)} ${elapsed.toFixed(2).padStart(10)}\n`,
  );
}
