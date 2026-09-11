# Orchestration paths

PodyGuard seats people through four orchestration systems. They can coexist on
one event in limited ways. This document classifies each path for alpha ops.

Physical table authority (all paths):

```text
table_reservations (active row) = who owns the table
physical_tables.status          = mirrored cache + host disable
```

Owner types: `POD` · `LIMITED_SESSION` · `LIMITED_MATCH` · `ROUND_ASSIGNMENT` ·
`MANUAL_RESERVATION`. Release is stale-safe (`ownerType` + `ownerId` must match).

---

## 1. ROLLING — CURRENT

| | |
|--|--|
| **Purpose** | Drop-in / drop-out Commander (and duel) night. Ready → Match Now → play → requeue. |
| **Status** | **CURRENT** default (`operationMode: ROLLING`). |
| **Storage** | `pods` / `pod_members`, `physical_tables`, match history, flex credits. |
| **Table ownership** | `createPod` → `POD` reservation + `occupied`. Complete/cancel releases matching pod id only. |
| **Results** | Player report / host finish table → `completePod`. |
| **Display** | Floor MATCH/PLAYING from pods; queues from ready list. |
| **Future** | Keep. Frozen matcher research (120s/600s grace) stays in simulation; production Match Now still uses legacy `createMatches` — do not change in stabilization work. |

Match Now is **blocked** when `operationMode === 'ROUNDS'`.

---

## 2. Legacy JSON tournament — LEGACY

| | |
|--|--|
| **Purpose** | Single-elim / Swiss trees created via Home “tournament format” on ROLLING events. |
| **Status** | **LEGACY** / specialized. Still works; ROUNDS is the preferred synchronized path. |
| **Storage** | `events.tournament_format` + `tournament_state` JSON; durable games still use pods (`tournament_match_id`). |
| **Table ownership** | Via pods (`POD` claims), same as rolling. |
| **Results** | Host tournament match result APIs; series BO1/3/5. |
| **Display** | Floor via pods only (no dedicated tournament TV mode). |
| **Future** | **DEPRECATED_CANDIDATE** after ROUNDS proves out for Swiss-like nights. Do not delete without a migration story for in-flight events. |

Creating with **Synchronized rounds** does not send `tournamentFormat`.

---

## 3. LIMITED — SPECIALIZED / CURRENT

| | |
|--|--|
| **Purpose** | Concurrent Draft / Pick-Two / Sealed queues with draft seating, timers, Swiss 1v1. |
| **Status** | **SPECIALIZED CURRENT** — orthogonal overlay on a global event. |
| **Storage** | Normalized `limited_*` tables + `table_reservations`. |
| **Table ownership** | `LIMITED_SESSION` (draft) / `LIMITED_MATCH` (round). Unique active reservation per table. |
| **Results** | Player report + host correct with audit rows. |
| **Display** | LIMITED mode + floor LIMITED_* activity. |
| **Future** | Keep. Isolated from `@podyguard/matching`. |

**Alpha warning:** Limited + ROUNDS on the same event is now claim-ledger protected, but operationally confusing. Prefer separate events for a pilot.

---

## 4. ROUNDS — CURRENT (new)

| | |
|--|--|
| **Purpose** | Synchronized whole-room rounds (Commander pods or duel Swiss-like). Generate globally, repair locally. |
| **Status** | **CURRENT** for structured nights (`operationMode: ROUNDS`). |
| **Storage** | `events.round_state` JSONB (pairing document) + `ROUND_ASSIGNMENT` reservations on **publish**. |
| **Table ownership** | Claim on publish; release on complete / reassignment. PLANNING does not claim. |
| **Results** | Round assignment result / correct; stale pairing-basis Keep/Regenerate. |
| **Display** | `currentRound` banner when PUBLISHED/ACTIVE; floor shows Round N (not FREE). |
| **Future** | Post-alpha: optionally normalize rounds/assignments/results tables. Not required for pilot if claim ledger + versioning stay solid. |

Docs: [`ROUND_MODE.md`](./ROUND_MODE.md).

---

## Overlap matrix

| Combo | Safe? |
|-------|-------|
| ROLLING + Limited queues | Yes (by design); tables compete via reservation ledger |
| ROLLING + legacy tournament | Yes (same pod path) |
| ROUNDS + Match Now | Blocked |
| ROUNDS + Limited | Ledger-safe but **not recommended** for alpha |
| ROUNDS + legacy tournamentFormat | Avoid; use ROUNDS alone |

---

## Classification summary

| Path | Label |
|------|--------|
| ROLLING | CURRENT |
| ROUNDS | CURRENT |
| LIMITED | SPECIALIZED CURRENT |
| Legacy tournament JSON | LEGACY / DEPRECATED_CANDIDATE |

---

## Tech debt (do not normalize yet)

`events.round_state` JSON is acceptable for alpha. Normalize when:

* multi-writer audit queries become painful;
* you need SQL constraints on assignment membership beyond app checks;
* reporting needs round/result joins without loading full JSON.

Until then: all mutations go through `EventService` / `round-orchestration`, never ad-hoc JSON patches.
