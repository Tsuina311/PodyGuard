# Simulation laboratory

Deterministic event-night simulation for evaluating matchmaking strategies against
the 23 scenarios in `src/scenarios.ts`. The suite covers attendance size and
timing, table constraints, pool mix, Flex, requeue/pause/leave behaviour, game
duration, odd fields, and table failures.

## Commands

Run these from the repository root:

```bash
yarn simulation:run --scenario NORMAL_FRIDAY_40 --seed 1
yarn simulation:run --scenario TABLE_SCARCITY_50 --seed 42 --verbose
yarn simulation:benchmark --runs 1000
yarn simulation:compare
yarn simulation:compare --baseline path/to/baseline.json --candidate path/to/candidate.json
yarn simulation:compare path/to/baseline.json current
yarn simulation:test
yarn simulation:test:heavy
```

`simulation:benchmark` executes every named scenario with seeds beginning at 1
(`--seed-start` changes this). `--runs` is the number of nights per scenario and
defaults to 1000. Output includes global and per-scenario summaries.

## Metrics and aggregation

Each night records participants, queue cycles, games/seats, table state periods,
and safety violations. Reports include runtime, nights and participants, matched
wait median/P95/max, unmatched participants, preferred and secondary pool
assignments, immediate rematches, pod-size distribution, requeues, table
utilisation, and invariant failures.

Suite distributions are calculated from raw queue-cycle waits; per-night
medians and percentiles are never averaged. Rates are weighted by their natural
denominator (seats, opponent pairs, decisions, participants, or available table
seconds), so differently sized scenarios aggregate correctly.

## Artifacts and baselines

Benchmarks write ignored, replaceable files at:

- `artifacts/simulation/latest.json` — schema-versioned metadata, definition
  identifiers, environment, optional Git SHA, summaries, and nightly rows.
- `artifacts/simulation/latest.csv` — one RFC 4180 row per simulated night.

The default comparison baseline is
`packages/simulation/baselines/matcher-legacy-v1.json`. A compact baseline keeps
the JSON artifact's metadata, definitions, and global/per-scenario summaries
while omitting nightly rows. With only a baseline, comparison uses
`latest.json` when its suite, engine, scenarios, run count, and seed range are
compatible; otherwise it reruns the equivalent current legacy suite.

Comparison prints absolute and relative global deltas and warnings for global
or scenario-level regressions in wait time, unmatched rate, immediate rematches,
runtime, and table utilisation. Definition incompatibility and any candidate
invariant failure are hard failures (non-zero exit); regression warnings remain
visible without failing the command.

## Reproducibility

Seeds, scenario-suite version, strategy identifier, engine version, Node/OS
environment, generation time, and Git SHA (when available) travel with each
artifact. Reproduce a night with the artifact's scenario and seed using
`simulation:run`; use the same runs and seed start for a comparable suite.
