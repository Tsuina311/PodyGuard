# Matchmaking Testing Strategy

## Purpose

PodyGuard will establish a deterministic baseline for the current production
matcher before any queue-aware matcher is designed or implemented. Every future
strategy must run against the same scenario definitions, generated nights, and
seeds so differences are attributable only to matchmaking.

This work does **not** change or optimise the current matchmaking algorithm.

## Repository audit

### Production matching boundary

- `packages/matching/src/create-matches.ts` exports the pure production entry
  point `createMatches(participants, tables, history, options)`.
- Its inputs are `ReadyParticipant[]`, `AvailableTable[]`, `MatchHistory`, and
  `MatchOptions`; its output is `MatchResult` containing proposed matches and
  unmatched participant IDs.
- `apps/server/src/events/event-service.ts` adapts persisted event records into
  those types in `runMatch`, calls `createMatches`, creates pods, and updates
  participant Flex and status.
- The production adapter filters participants to `ready` and tables to `free`
  before calling the matcher.

### Domain representation

- Participant states are `joined`, `ready`, `matched`, `playing`, `paused`, and
  `left` in `packages/shared/src/enums.ts`.
- Physical tables are `free`, `occupied`, or `disabled`; only free tables are
  supplied to the matcher.
- Active and completed pods are represented by server `StoredPod` records and
  public `PublicPod` values. Pod statuses are `formed`, `playing`, `completed`,
  and `cancelled`.
- Decks carry a pool ID and either `preferred` or `accepted` preference.
  Participants with more than one eligible pool are flexible. Empty deck lists
  use the open pool.
- Flex is event-local, bounded to `0..6`, and represented by
  `ReadyParticipant.flexCredits`. A secondary-pool or non-preferred-size seat
  earns Flex; a clean preferred-size/preferred-pool seat can spend it.
- Rematch avoidance is based on historical participant pairs. Pod construction
  heavily penalises prior pairs while searching a bounded candidate window.
- Event settings define preferred and allowed pod sizes. Commander normally
  prefers four and can optionally allow three and five.

### Existing testing and simulation

- Vitest is used across the monorepo.
- `fast-check` is already a development dependency of `@podyguard/matching`,
  with a small property suite.
- `packages/matching/src/simulate.ts` contains seeded snapshots and a simple
  round loop using Mulberry32.
- Existing `simulate:matching` and `benchmark:matching` scripts are useful
  matcher smoke tools, but they are not a discrete-event event simulation and
  do not provide queue-cycle, fairness, scenario, artifact, or comparison
  reporting.
- Production event metrics exist in `apps/server/src/events/metrics.ts`, based
  on completed-game records.

### Purity and adaptation

- `createMatches` does not use `Date.now`, `Math.random`, timers, databases,
  HTTP, Fastify, Socket.IO, React, or browser APIs.
- The old timing CLI uses `performance.now` only to report benchmark runtime,
  not as simulation state.
- Server adaptation uses persisted `Date` values and asynchronous storage, but
  those concerns stay outside the matcher.
- The simulation adapter therefore only needs to:
  1. select eligible `ready` participants not already in an active pod;
  2. select free, enabled tables;
  3. convert simulated integer timestamps into `ReadyParticipant.readyAt`;
  4. pass deterministic history and event pod-size options to `createMatches`;
  5. apply returned matches to simulated state.

There is no architectural blocker to deterministic simulation.

## Non-negotiable principles

1. Every stochastic run accepts and records a numeric seed.
2. Simulation time is integer seconds since event start.
3. Simulation code never uses `Math.random`, `Date.now`, real timers, external
   services, browser APIs, or application networking.
4. Failures report scenario, seed, and replay command.
5. The engine depends on a `MatchmakingStrategy` interface, not matcher
   internals.
6. Scenario definitions are committed deterministic data.
7. Hard correctness failures stop a run. Statistical differences are warnings
   until trusted regression thresholds exist.

## Architecture

`packages/simulation` is a separate workspace:

- `random.ts`: seeded random interface and deterministic Mulberry32
  implementation.
- `strategy.ts`: matcher-independent input/result contract and the
  `legacy-v1` adapter around production `createMatches`.
- `scenario.ts` and `scenarios.ts`: validated reusable distributions and named
  scenario suite.
- `event-queue.ts`: stable timestamp/sequence priority queue.
- `engine.ts`: pure discrete-event Commander-night simulation.
- `metrics.ts`: event-record metrics, percentiles, fairness, rematches, Flex,
  pod sizes, games, and table utilisation.
- `artifacts.ts`: versioned benchmark JSON and escaped per-night CSV.
- `benchmark.ts`: fixed-seed scenario runner and aggregation.
- `compare.ts`: global and per-scenario deltas with warning classification.
- `cli.ts`: `test`, `run`, `benchmark`, and `compare` entry points.
- tests: explicit legacy scenarios, 10,000-case property checks, simulator
  determinism/lifecycle tests, and metrics/artifact tests.

The simulation package has no server, database, or UI dependency.

## Strategy contract

```ts
interface MatchmakingStrategy {
  id: string;
  match(input: MatchmakingInput): MatchmakingResult;
}
```

The input contains only eligible participants, available tables, prior groups,
and pod-size settings. The engine owns statuses, queue cycles, active games,
table state, and time. The strategy owns only the assignment decision.

## Three testing layers

### Layer 1: explicit deterministic scenarios

Tests cover:

- 32 same-pool players;
- 31 same-pool players;
- the 15 B2 / 16 B3 / one flexible player case;
- 7 and 9 player pod-size combinations;
- finite and disabled tables;
- ineligible participant states and active pod membership;
- multiple accepted pools;
- wait ordering and history;
- requeue, odd counts, no ready participants, and excess tables.

Exact pod composition is asserted only when it is a stable part of current
behaviour. Otherwise tests assert eligibility and safety invariants.

### Layer 2: property-based tests

`fast-check` generates event states with up to 200 participants and 50 tables,
including all participant/table states, pool preferences, Flex, timestamps,
history, active pods, and allowed pod sizes.

The normal simulation test command runs 10,000 cases. A heavy command supports
50,000–100,000 cases through `SIMULATION_PROPERTY_RUNS`.

Failures retain fast-check seed/path output and include generated state context.

### Layer 3: discrete-event nights

The engine advances directly to the next event. Supported events include:

- arrival and becoming ready;
- automatic matching and game start;
- game finish and table release;
- requeue, pause, resume, and leave decisions;
- table disable/enable;
- multiple queue cycles and previous-opponent history.

All stochastic choices—arrival, pool, flexibility, game duration, and
post-game decisions—flow through the run's seeded random instance.

## Queue cycles

Each transition into `ready` opens a queue cycle. Matching, pausing, leaving, or
event close ends it with a timestamp and reason. Resuming opens a new cycle.
Wait metrics use these cycles, not participant age or first arrival.

## Metrics and definitions

The metric calculator consumes neutral event records so production records can
later be adapted without reimplementing definitions.

### Waits

- Median uses the middle value for odd samples and the arithmetic mean of the
  two middle values for even samples.
- P95 uses nearest rank: sorted index `ceil(0.95 * n) - 1`.
- Maximum, mean, `max / median`, and rates over 5, 10, 15, and 30 minutes are
  reported.
- Only queue cycles ending in `matched` contribute to matched-wait
  distributions. Open/paused/left cycles are counted separately.

### Assignment and Flex

- Preferred-pool rate: seats assigned to a participant's preferred pool divided
  by all seats.
- Secondary-pool rate: seats assigned to another accepted pool divided by all
  seats.
- Flex concessions count secondary-pool or non-preferred-size compensation.
- Flex earned and spent sum positive and negative matcher deltas separately.

### Rematches

- An immediate rematch pair appears together in games that are consecutive for
  both participants.
- Repeat-opponent rate is repeated opponent-pair encounters divided by all
  opponent-pair encounters after each pair's first encounter.
- Average unique opponents is the mean number of distinct opponents among
  participants who played.

### Tables and games

- Table utilisation is occupied table-seconds divided by available
  table-seconds over the simulated duration.
- Disabled table-seconds are excluded from available capacity.
- Pod-size counts and rates are recorded for every observed size.
- Requeue rate is post-game requeues divided by completed participant-game
  decisions.

### Wait diagnostics

The simulator classifies waiting as:

- `WAITING_FOR_TABLE` when a compatible pod could exist but no table is free;
- `WAITING_FOR_COMPATIBLE_POOL` when enough ready players exist but accepted
  pools cannot form a valid pod;
- `WAITING_FOR_PLAYERS` when too few compatible ready players exist;
- `MATCH_AVAILABLE_BUT_NOT_SELECTED` when a strategy leaves a feasible player;
- `UNKNOWN` when the legacy matcher does not expose enough explanation.

Diagnostics are observational and do not alter matching.

## Named scenario suite

The suite includes:

`NORMAL_FRIDAY_40`, `NORMAL_FRIDAY_20`, `NORMAL_FRIDAY_80`,
`LATE_ARRIVALS_40`, `EARLY_ARRIVALS_40`, `TWO_ARRIVAL_WAVES_60`,
`TABLE_SCARCITY_50`, `EXCESS_TABLE_CAPACITY_30`, `B3_DOMINATED_40`,
`B4_STARVATION_30`, `EVEN_BRACKET_SPLIT_40`, `HIGH_FLEX_40`,
`ZERO_FLEX_40`, `HIGH_REQUEUE_40`, `LOW_REQUEUE_40`, `LONG_GAMES_40`,
`SHORT_GAMES_40`, `PEOPLE_LEAVE_EARLY_40`, `HIGH_PAUSE_RATE_40`,
`ODD_PLAYER_COUNTS`, `BROKEN_TABLE_MID_EVENT`, `SMALL_EVENT_8`, and
`LARGE_EVENT_120`.

The suite has a version identifier. Baselines are valid only for the same suite
version and seed range.

## Artifacts and baselines

Runtime artifacts are written to gitignored `artifacts/simulation/`:

- `latest.json`: versioned metadata, global aggregates, and per-scenario data;
- `latest.csv`: one escaped row per simulated night.

The curated, compact baseline is committed at
`packages/simulation/baselines/matcher-legacy-v1.json`. Raw per-night benchmark
rows are not committed.

Comparison runs use identical scenario IDs, suite version, seed range, and
generated random streams. The report shows global deltas and per-scenario
regressions. Correctness failures fail immediately; metric deltas are warnings.

## Production metric gaps

Current completed-game seats persist matched wait seconds and assigned pool,
which supports completed-seat waits, pool counts, pod sizes, durations, and
opponent history. The present production model cannot accurately reconstruct:

- abandoned/open/paused queue cycles;
- players who left while waiting;
- never-matched participants' complete waiting time;
- time-varying table availability and true table-seconds utilisation;
- preferred versus secondary pool without joining historical deck preference
  to each seat at assignment time;
- exact Flex earned/spent per assignment after only the final balance remains;
- pause/resume history;
- host override counts where no dedicated event is recorded.

These values must remain unavailable rather than inferred with false precision.
The pure metric input model is ready for later production instrumentation.

## Commands

From the repository root:

```bash
yarn simulation:test
yarn simulation:test:heavy
yarn simulation:benchmark --runs 100
yarn simulation:benchmark --runs 1000
yarn simulation:run --scenario NORMAL_FRIDAY_40 --seed 8347261
yarn simulation:run --scenario B4_STARVATION_30 --seed 8347261 --verbose
yarn simulation:compare
```

## Explicitly out of scope

- changing the matcher or implementing queue-v2;
- PostgreSQL, Neon, Render, Docker, HTTP, Socket.IO, React, or browser
  integration in simulation;
- LLM calls or generated prose scenarios;
- nondeterministic simulation time or randomness;
- GitHub issue creation;
- flaky statistical CI gates;
- dashboards, a generic analytics platform, machine learning, or unnecessary
  personal data.

