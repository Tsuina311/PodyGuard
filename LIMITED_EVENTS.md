# Limited events

PodyGuard supports three physical-card Limited modes:

- Booster Draft: one card per pick, three packs, left/right/left passing.
- Pick-Two Draft: two cards per pick, with the optimized four-player first two
  rounds and Swiss-style pairing for larger cohorts.
- Sealed: no draft phase; players move directly to deck construction.

PodyGuard coordinates people, seats, clocks, tables, pairings, results, and
standings. It does not draft cards digitally or record card pools.

## Architecture

A global event can enable any combination of Limited queues while retaining its
normal drop-in Commander-style queue. Players choose one enabled Limited mode.
When a configured target cohort is available, the server forms a
`LimitedSession`. Pod sizes are fixed by format: Booster Draft is 8,
Pick-Two Draft is 4, and Sealed is 4. Once formed, all seating and 1v1
pairing is local to that session.

The Limited engine is isolated from `@podyguard/matching`. Limited participants
are excluded before the existing Commander matcher is called, so the frozen
Commander scoring and pod-planning behavior is unchanged.

The shared package owns deterministic, side-effect-free logic:

- mode configuration and cohort validation;
- draft seating and pack direction;
- Pick-Two and Swiss-style 1v1 pairing;
- round invariants and fair bye assignment;
- standings and deterministic tie-breaking;
- authoritative timer arithmetic.

The server owns authorization, state transitions, transactions, physical table
reservations, snapshots, and product events. Socket.IO publishes complete event
snapshots after every mutation.

## State machines

Session lifecycle:

```text
FORMING
  -> SEATING
  -> DRAFTING -> DECKBUILDING       (draft modes)
  -> DECKBUILDING                   (Sealed)
  -> ROUND_ACTIVE
  -> BETWEEN_ROUNDS -> ROUND_ACTIVE (until configured rounds finish)
  -> COMPLETED

Any non-terminal session may be CANCELLED by the host.
```

Participant lifecycle inside a session:

```text
QUEUED -> ASSIGNED -> DRAFTING -> DECKBUILDING
       -> PLAYING <-> WAITING_FOR_ROUND -> COMPLETED
       -> DROPPED
```

Sealed skips `DRAFTING`. A drop during an active match records a deterministic
forfeit. Dropped players are excluded from future rounds.

Timer phases are `DRAFTING`, `DECKBUILDING`, and `ROUND`. The database stores
start, target, pause, and paused-remaining values. Clients only render the
server clock and may not advance a phase.

## Pairing and standings

Each round enforces:

- one appearance per active participant;
- no self-match;
- no participant from another session;
- no dropped participant;
- at most one active reservation per physical table.

Pairing prioritizes equal records, rematch avoidance, and fair byes, then uses
participant IDs for deterministic tie-breaking. A four-player Pick-Two event
uses its fixed opening pattern and pairs first-round winners and non-winners in
round two.

Results are `PLAYER_A_WIN`, `PLAYER_B_WIN`, `DRAW`, `DOUBLE_LOSS`, or `BYE`.
Matches are best-of-one or best-of-three. Players in a match can submit its
first result. Corrections are host-only, require a reason, and append an audit
record.

Standings award 3 points for a match win or bye, 1 for a draw, and 0 for a loss
or double loss. Rank order is:

1. points;
2. match-win percentage;
3. opponent match-win percentage;
4. participant ID.

## Persistence and tables

Migration `apps/server/drizzle/0021_limited_persistence.sql` adds normalized
sessions, session participants, rounds, matches, match participants, result
audits, normalized draft seats, timers, and generic table reservations.
Important unique constraints
prevent duplicate membership, duplicate draft seats, repeated round
appearances, duplicate round numbers, and simultaneous table reservations.

Draft/deckbuilding reservations and match reservations update the same
authoritative physical-table status used by normal pods. A reservation is
released when its phase or match ends, and all resources are released when a
session completes or is cancelled.

Apply the migration only against the intended managed database:

```bash
yarn db:migrate
```

## HTTP and realtime

Limited endpoints live below `/events/:joinCode/limited`:

- `PUT|DELETE /queue`
- `POST /sessions`
- `PUT /sessions/:sessionId/roster`
- `PUT /sessions/:sessionId/tables`
- `POST /sessions/:sessionId/launch`
- `POST /sessions/:sessionId/phase`
- `POST /sessions/:sessionId/timer`
- `POST /sessions/:sessionId/rounds`
- `POST /sessions/:sessionId/matches/:matchId/result`
- `POST /sessions/:sessionId/matches/:matchId/correct`
- `POST /sessions/:sessionId/drop`
- `POST /sessions/:sessionId/participants/:participantId/drop`
- `POST /sessions/:sessionId/complete`
- `POST /sessions/:sessionId/cancel`

Host routes use the existing event-scoped host token. Player routes use the
existing signed participant token and validate session/match membership on the
server. Public snapshots include enabled mode configurations, queue summaries,
session phases, seats, timers, pairings, results, and standings; they contain no
draft contents or other hidden information.

## Deliberate MVP limitations

The Limited MVP does not include digital card drafting, card inventories,
decklists or deck validation, remote play, sanctioned-event reporting, prize
calculation or payout, or AI/ML pairing. Physical draft operations remain host
controlled.

## Verification

```bash
yarn typecheck
yarn test
```

Focused tests cover domain invariants across varied cohort sizes and histories,
timer behavior, persistence collisions and audits, API authorization and
progression, table release, and regression coverage proving Limited-queued
players never enter Commander matching.
