# Simulation laboratory

Deterministic event-night simulation for evaluating matchmaking strategies against
the 23 scenarios in `src/scenarios.ts`. The suite covers attendance size and
timing, table constraints, pool mix, Flex, requeue/pause/leave behaviour, game
duration, odd fields, and table failures.

## Commands

Run these from the repository root:

```bash
yarn simulation:run --scenario NORMAL_FRIDAY_40 --seed 1
yarn simulation:run --scenario B3_DOMINATED_40 --seed 1 --strategy queue-v2-experimental --grace 120
yarn simulation:run --scenario TABLE_SCARCITY_50 --seed 42 --verbose
yarn simulation:benchmark --runs 1000 --strategy legacy-v1
yarn simulation:benchmark --runs 1000 --strategy queue-v2-experimental --grace 120
yarn simulation:benchmark --runs 100 --seed-start 1 --strategy queue-v2-experimental --grace 120 --randomization paired-v1 --save-baseline queue-v2-experimental-120s
yarn simulation:sweep --runs 100 --seed-start 1
yarn simulation:sweep-scarcity --runs 100 --seed-start 1
yarn simulation:sweep-seat-loss --runs 100 --seed-start 1
yarn simulation:benchmark --runs 1000 --save-baseline queue-v2-alpha
yarn simulation:compare
yarn simulation:compare --baseline path/to/baseline.json --candidate path/to/candidate.json
yarn simulation:compare path/to/baseline.json current
yarn simulation:test
yarn simulation:test:heavy
```

`simulation:benchmark` executes every named scenario with seeds beginning at 1
(`--seed-start` changes this). `--runs` is the number of nights per scenario and
defaults to 1000. Output includes global and per-scenario summaries.
`--strategy` accepts `legacy-v1` (the default), `queue-v2-experimental`
(Experiment 1, oldest-READY grace), or `queue-v2-opportunity-grace`
(Experiment 1B, first-matchable-trio grace). `--grace` is a non-negative
integer in seconds. Experiment 1B also accepts `--max-existing-wait`
`<seconds>|unlimited`.
`--randomization paired-v1` is also accepted by `simulation:benchmark`; omitting
it preserves the legacy benchmark default and artifact shape.
`--save-baseline <id>` also writes a compact committed baseline from
`artifacts/simulation/latest.json` to
`packages/simulation/baselines/matcher-<id>.json`. Passing `queue-v2-alpha` or
`matcher-queue-v2-alpha` both produce `matcher-queue-v2-alpha.json`. The saved
file records matcher ID, Git SHA, scenario suite, seed range, timestamp, and
global/per-scenario metrics; nightly rows stay in the gitignored latest
artifact.

For paired strategy sweeps, pass `randomizationMode: 'paired-v1'` to
`runSimulation` (or `--randomization paired-v1` to `simulation:run`). This
keeps arrivals, bracket/deck selection, starting Flex, participant queue-cycle
decisions, and participant post-game decisions keyed independently of the
candidate strategy. Game duration is keyed by table ID and that table's game
ordinal, so every candidate sees the same table-slot duration stream. The
default `legacy` mode is unchanged for frozen-baseline compatibility.

## Queue v2 grace sweep

`simulation:sweep` evaluates grace periods 0, 30, 60, 90, 120, 180, and 300 seconds.
The 300-second value is an extreme reference point, not a presumed production
candidate.
Every candidate uses `queue-v2-experimental`, `paired-v1`, and the identical
scenario/seed grid across all 23 scenarios. It defaults to 100 runs per scenario
and seed start 1.

The console report shows global results and separate views for
`SMALL_EVENT_8`, `NORMAL_FRIDAY_40`, `B4_STARVATION_30`, `LATE_ARRIVALS_40`,
`ODD_PLAYER_COUNTS`, `TABLE_SCARCITY_50`, and `LONG_GAMES_40`. It reports
matched-wait median/P95/max and counts/rates over
5/10/15/30 minutes; never-matched attendees; 3/4/5-pod mix; preferred and
secondary assignments; immediate rematches; games per attendee; requeue rate;
table utilisation; invariant failures; and runtime. The small-event view also
reports average matched players and the rates of nights with a four-player pod
or only three-player pods. Aggregation uses raw event records and the existing
metric definitions.

This experiment is deliberately narrow. It only delays a legacy-proposed
three-player pod when exactly three currently READY participants are compatible
with that pod's pool and the oldest is still inside the configured grace
period. It does not alter general queue decomposition, reserve flexible
participants, or address thin-pool/B4 starvation. Fields of 6, 7, 8, or 11
players change only if legacy leaves an independently qualifying lone
three-player pod; the wrapper does not recombine pods globally.

The full report is saved to the gitignored
`artifacts/simulation/queue-v2-grace-sweep.json`. Global Pareto-efficient grace
periods are marked using P95 wait, unmatched rate, and immediate-rematch rate as
minimization objectives, and four-pod rate and preferred-pool rate as
maximization objectives. The sweep deliberately does not select a winner.

## Experiment 1B: opportunity-clock grace

`yarn simulation:sweep-opportunity` keeps Experiment 1 and `legacy-v1`
unchanged and evaluates a separate wrapper whose grace clock starts when a
compatible 3-player pod first becomes matchable (the third READY), not when
the oldest participant became READY. If the oldest participant has already
waited `maxExistingWaitSeconds` at that opportunity, no additional grace is
applied.

The first matrix uses seeds 1–100 and:

- grace: 30, 60, 90, 120
- max existing wait: 120, 300, 600, unlimited
- plus `legacy-v1` and Experiment 1 oldest-READY controls at 30/60/90/120

Every candidate uses the same 23 scenarios and `paired-v1` randomness.
Catastrophic `SMALL_EVENT_8` seeds 174, 510, and 299 are replayed with the
original diagnostic `legacy` randomization to test whether the fourth
same-pool player is captured.

This experiment does not change Flex, bracket/deck flexibility, rematch
scoring, or general pod decomposition, and it does not solve thin-pool/B4
starvation. The report is saved to
`artifacts/simulation/queue-v2-opportunity-grace-sweep.json`.
No winner is selected.

## Experiment 2A: scarce-pool unlock

`yarn simulation:sweep-scarcity` compares the frozen
`queue-v2-grace-120s-maxwait-600s` checkpoint with separate scarcity strategies
at exclusive-wait thresholds 0, 120, 300, and 600 seconds. Every aggregate
candidate uses all 23 scenarios, seeds 1–100, and `paired-v1` randomness.

The rule considers one participant and one explicitly accepted secondary pool
at a time. The frozen control must assign that multi-pool participant to their
preferred pool. Without that participant the secondary pool must be unable to
form any legal pod, while adding them makes a legal pod possible. It must
include waiting exclusive participants, have no more currently compatible
alternatives than the preferred pool, and have an older exclusive wait than
the preferred pool. The forced secondary assignment then passes
through the unchanged 120-second opportunity grace with 600-second existing
wait cap. It is selected only when the final result seats at least as many
participants immediately as the frozen control. Ties are deterministic:
immediate seats, exclusive participants unlocked, oldest exclusive wait,
participant ID, then pool ID.

`MISSED_SCARCE_POOL_UNLOCK` means the diagnostic-only control had an eligible
preferred-to-secondary redirect under those same structural and coverage
checks but retained its normal assignment. It is an analysis event, not a
matcher score.

Additional metrics retain participant pool metadata so reports can separate
exclusive from multi-pool participants, calculate compatible-player cuts per
accepted pool, and report B4-exclusive tails. Pool-compatible summaries include
a multi-pool participant in every pool they explicitly accepted. Older
artifacts without participant pool metadata are reported as unavailable rather
than inferred. Actual preferred/secondary assignments continue to come from
game seats.

The known starvation seeds are replayed with legacy randomness for continuity
with the original diagnosis. The aggregate sweep is written to
`artifacts/simulation/queue-v2-scarcity-experiment-2a.json`. It does not change
grace timing, pod decomposition, rematch scoring, Flex rewards, or either
committed baseline, and it does not select a winner.

## Experiment 2B: bounded one-seat loss

`yarn simulation:sweep-seat-loss` keeps both frozen baselines and the
opportunity-grace implementation unchanged. Its control is the Experiment 2A
threshold-0 zero-seat-loss rule. Candidates retain that control behavior and
may additionally select one independent alternate that seats exactly one fewer
participant, at exclusive-wait thresholds 600, 1200, 1800, or 2700 seconds.
Alternatives are never chained.

The alternate must move a seated multi-pool participant only to an explicitly
accepted pool. That pool must be unable to form any legal pod without the
participant, able to form one with them, contain a threshold-qualified
exclusive waiter, and newly seat at least one exclusive participant. The
control pool must retain another compatible participant. Every forced
assignment passes through the unchanged 120-second opportunity grace and
600-second existing-wait cap.

Qualifying alternatives are ordered by oldest exclusive wait, exclusive
participants newly seated, fewer scarce-pool substitutes, pool ID, then
participant ID. The strategy applies at most one alternate per decision and
allows only a 1-seat difference from the current zero-loss control.

Experiment 2B adds queue-cycle survival diagnostics. “Still waiting after T”
uses every READY queue episode, including episodes ending matched, paused,
left, or event-closed; it is not a matched-only percentile. Separate B2-, B3-,
and B4-exclusive cuts expose starvation transfers between pools. Rescue
efficiency ratios remain reporting diagnostics and do not affect matching.

The 23-scenario × 100-seed paired sweep is written to
`artifacts/simulation/queue-v2-scarcity-experiment-2b.json`. Known diagnostic
seeds use legacy randomness for continuity with their original traces. No
candidate or baseline is selected or saved automatically.

## Experiment 2C: explainable weighted assignment

`yarn simulation:sweep-weighted` builds directly on the frozen
120-second/600-second opportunity-grace strategy, not on the Experiment 2A or
2B hard rules. At each decision it retains the frozen result and generates one
complete-match-set alternative for every seated multi-pool participant and
each other explicitly accepted pool. Each alternative forces only that pool
choice and reruns the unchanged matcher through frozen grace. Duplicates,
unseated forced choices, and alternatives more than one immediate seat below
control are discarded. The bound is `1 + M(P - 1)` matcher calls for `M`
currently seated multi-pool participants and at most `P` accepted pools, rather
than exponential enumeration. Coordinated two-player forcing is deliberately
not explored.

Five normalized components score each complete legal alternative:

- immediate seating = candidate seats / maximum seats among alternatives;
- waiting urgency = mean urgency of candidate seats on the piecewise-linear
  curve 0m=0, 5m=.10, 10m=.25, 20m=.50, 30m=.75, 60m+=1;
- exclusive unlock = newly seated exclusive participants in the forced target
  pod / target pod size;
- scarcity = the mean replaceability of seated multi-pool participants: 1 when
  a legal pod needs that participant, otherwise `1 / (1 + substitutes)`;
- preference = preferred-pool seats / candidate seats.

The weighted total is the weighted mean of those five values. All weights are
finite, non-negative, externally configured, and at least one must be
positive. Deterministic selection uses total, seated count, preference, then a
stable candidate key. Candidate explanations, selected margins, seat deltas,
secondary reallocations, and unlocked exclusives are available in verbose
traces and sweep diagnostics.

The paired 23-scenario × 100-seed artifact is
`artifacts/simulation/queue-v2-weighted-experiment-2c.json`. Compatible
Experiment 2A/2B results are read as references only. The command does not
modify or create a committed matcher baseline.

## Experiment 2D: bounded coordinated generation

`yarn simulation:sweep-pairwise` compares the unchanged Experiment 2C scorer
under `GENERATOR_SINGLE` and `GENERATOR_PAIRWISE` for every existing weight
profile. Pairwise generation retains every single-force plan and adds
deterministically ordered assignments for exactly two READY multi-pool
participants. Every target must be explicitly accepted, at least one target
must differ from control, and the complete frozen-grace plan may lose at most
one immediate seat.

The raw bound is
`1 + singles + sum(i<j)(acceptedPools(i) * acceptedPools(j))`, or
`O(R²P² * matcherCost)` for `R` READY multi-pool participants and at most `P`
accepted pools. A configurable 128-unique-plan ceiling applies deterministic
truncation. Raw assignment-map duplicates and resulting complete-plan
duplicates are removed; ceiling hits and truncated assignments are reported.

Residual diagnostics are observational only and do not affect the unchanged
five-component score. They record remaining READY/exclusive/multi-pool counts,
pool-compatible and exclusive counts, oldest waits, minimum-pod viability,
one-short pools, and remaining cross-pool connectors. Normal benchmarks retain
only selected and single-control residuals; verbose replays retain every plan.

The 2 × 5 paired artifact is
`artifacts/simulation/queue-v2-pairwise-experiment-2d.json`. It includes wall
time, matcher evaluations, candidate-count percentiles, residual comparisons,
and verbose known-seed replays. No baseline is selected or written.

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
`packages/simulation/baselines/matcher-legacy-v1.json`. A second committed
baseline may exist at
`packages/simulation/baselines/matcher-queue-v2-grace-120s-maxwait-600s.json`
after Experiment 1 validation. A compact baseline keeps
the JSON artifact's timestamp, matcher ID, Git SHA, scenario suite, seed range,
and global/per-scenario summaries while omitting nightly rows. Compare two
committed baselines by id:

```bash
yarn simulation:compare --baseline legacy-v1 --candidate queue-v2-grace-120s-maxwait-600s
```

The report prints both matchers side by side, then global and per-scenario
deltas. With only a baseline, comparison uses
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
