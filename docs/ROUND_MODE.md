# Synchronized ROUND mode

PodyGuard can run a night in two ways. Both work with the same game modes
(Commander, duel, etc.). This is about **how the room moves**, not which
ruleset you play.

| Mode | Feel | Default? |
|------|------|----------|
| **ROLLING** | Drop-in / drop-out. Players ready up; the matcher seats them when tables free. | Yes |
| **ROUNDS** | Synchronized rounds. Everyone plays the same round together; the host generates, publishes, starts, and completes each round. | Opt-in at create |

Domain types live in `@podyguard/shared` (`EventOperationMode`, `RoundEventState`,
`PublicEventRound`, `attentionItems`, `roundProgress`, …).

## Lifecycle (host)

1. **Generate** — build a draft pairing plan for the next round (`PLANNING`).
2. **Publish** — show tables to players / display (`PUBLISHED`).
3. **Start** — round is live (`ACTIVE`); clocks and play begin.
4. **Complete** — results in; advance fairness history (`COMPLETED`).

Optimistic concurrency uses `expectedVersion` on mutate calls so two host
devices do not clobber each other.

**Table claims on publish:** generating a round only drafts pairings
(`PLANNING`). Publishing claims each assigned table as `ROUND_ASSIGNMENT`
so Limited / rolling pods cannot seat there. Completing the round releases
those claims (stale-safe). See `docs/ORCHESTRATION_PATHS.md`.

**JSON debt:** pairings still live in `events.round_state` JSONB; the claim
ledger is the physical-table source of truth. Normalizing assignments to
SQL rows is future work.

Typical API surface (client helpers in `apps/web/src/api.ts`):

- `POST /events` with `operationMode: 'ROUNDS' | 'ROLLING'`
- `POST /events/:joinCode/rounds/generate` `{ expectedVersion? }` (required when regenerating)
- `POST /events/:joinCode/rounds/publish` `{ expectedVersion }`
- `POST /events/:joinCode/rounds/start` `{ expectedVersion }`
- `POST /events/:joinCode/rounds/complete` `{ expectedVersion, force?, forceReason? }`
- `POST /events/:joinCode/rounds/repair/preview` `{ expectedVersion, unlockedAssignmentIds }`
- `POST /events/:joinCode/rounds/repair` `{ expectedVersion, unlockedAssignmentIds }`
- `POST /events/:joinCode/rounds/stale-basis` `{ expectedVersion, decision: 'keep' | 'regenerate' }`
- `POST /events/:joinCode/rounds/swap` `{ expectedVersion, leftAssignmentId, leftParticipantId, rightAssignmentId, rightParticipantId }`
- `POST /events/:joinCode/rounds/assignments/:id/result` `{ expectedVersion, … }`
- `POST /events/:joinCode/rounds/participants/:id/mark-missing` `{ expectedVersion }`

Snapshots include `event.operationMode` and `event.rounds` (`RoundEventState`).
Host UI must read `result.event.rounds` from snapshots (not a top-level `rounds`).

## Pod fairness (multiplayer / Commander)

Round generation prefers seating every eligible player and spreads pain fairly:

- Avoid rematches when a better complete plan exists.
- Avoid exact same pods repeating.
- Prefer preferred pod size; when a short pod is unavoidable, rotate who sits short.
- Soft preferred tables vs hard locks (conflicts fail generation loudly).

Weights and helpers are in `packages/shared/src/rounds.ts`
(`ROUND_FAIRNESS_WEIGHTS`, `generatePodRound`, …).

## Duel Swiss-like

For 1v1 activity (`activityKind: 'DUEL'`), pairing is Swiss-like: standings /
match points drive brackets, rematches are minimized, byes rotate fairly.
This is **casual structure**, not a certified tournament engine.

## Surgical repair

Hosts can unlock specific tables/assignments and **re-optimize only the unlocked
set**, leaving locked seats alone (`repair` / `reoptimizeUnlockedAssignments`).
Manual swap is available when a one-off seat change is clearer than a replan.

## Stale pairing basis

If a prior-round result is corrected after the next round was already planned,
`pairingBasisStale` flags that pairings may no longer match corrected standings.
`attentionItems` surfaces this so the host can **Keep** (acknowledge) or
**Regenerate** via `POST …/rounds/stale-basis` before start.

## Product / sanctioned-event boundary

ROUND mode is for **casual and unsanctioned** structured play (LGS night, club,
friends). It is **not** a WPN / EventLink / MTR replacement and does not claim
sanctioned Swiss certification.

Legacy Home “Swiss stage” under rolling tournamentFormat remains available for
older elimination/Swiss trees; when creating with **Synchronized rounds**, the
UI does not send `tournamentFormat` — ROUNDS is the new structured path.

## Frozen rolling matcher

The established rolling Commander matcher (opportunity grace **120s** /
maxExistingWait **600s** in simulation) is **untouched**. ROUND mode does not
modify `packages/matching`. Rolling remains the default `operationMode`.

## UX surfaces

- **Home** — Rolling play vs Synchronized rounds radio (constructed create).
- **Host** — `RoundHostPanel` when `operationMode === 'ROUNDS'`; Match Now /
  ready-queue chrome hidden or explained away.
- **Player** — assignment card (round, table, opponents) or waiting-for-next-round
  copy instead of Ready language.
- **Display** — unified public projection: floor tables show Round N (not FREE)
  when PUBLISHED/ACTIVE; `currentRound` pairings banner. Local repairs update
  affected tables only — not a full “new pairings” takeover. Dedicated TV mode
  polish is deferred.

## Table authority

On **publish**, each seated assignment claims its table as `ROUND_ASSIGNMENT`
in `table_reservations`. Complete / reassignment releases only matching owners
(stale-safe). PLANNING drafts do not claim. See [`ORCHESTRATION_PATHS.md`](./ORCHESTRATION_PATHS.md).

## JSON debt

`events.round_state` remains the pairing document for alpha. Do not normalize
into relational assignment tables unless correctness requires it.
