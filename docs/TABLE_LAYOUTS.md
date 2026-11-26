# Physical tables and game areas

Quick Limited pods and hosted events have a visual table planner. Choose each
table's shape (square, rectangular or round) and seat count (2–16). Expand
**Edit several tables**, select individual tables or **Select all**, choose the
shape and seats, then apply to the selection. Hosts can configure up to 40
physical tables.

Limited uses separate drafting and playing plans. Each drafting table must fit
a complete pod. Quick Limited uses one drafting table for its pod. Playing
capacity must cover the duels and stay within the planned player count. An eight-player draft can use one round table for drafting, followed by a
four-seat table and two two-seat tables for playing. Sealed has no drafting plan.

Playing-table previews draw rectangular mats inside each lettered game area’s
width. Duel mats face each other across the table. Playing tables are divided
into as many legal games as they can fit. Among
equivalent divisions, fill the seats and prefer the organizer's chosen game
size. Commander with three- and four-player games enabled splits seven seats
into four plus three. If three-player games are disabled, those spare three
seats cannot become an illegal Commander game. Limited remains separate duels:
a four-seat table holds two duels, not a four-player Limited game.

Players see stable destinations such as **Table 1 · Part A** and **Table 1 · Part
B**. Each part has an independent match and tracker; completing Part A does not
release Part B. The host's free-space counter counts these game areas.

## Persistence and compatibility

Existing table records without `area` retain their original single-game
behavior. New planned game areas each use the existing table identity and
reservation ledger, with physical table number, part, capacity and shapes in
the optional `physical_tables.area` JSON column (migration 0031). This keeps
game IDs, tracker ownership, result reporting and stale-release fencing scoped
to one independently bookable game area.

For drafting, the server groups areas by physical table and claims every part
in the group atomically through the existing Limited session transaction. A
physical table with any occupied part cannot be assigned to a draft. Moving a
draft reservation expands the selected physical table to all its areas too.
Draft claims are released when play starts and each duel claims its own area.
Draft-only tables have zero playing capacity and cannot host a playing game.

The organizer's chosen geometry changes the seating illustration, without
changing Limited seat numbers or Pick-Two opponent rotations. Local Limited
sessions save both layouts and their round destinations on the device.

## Manual checks

1. On a phone, start a Booster Draft quick pod. Set playing tables to 3 and
   capacities to 4, 2, 2. Start the draft, deckbuild and start a round. Check that
   four separate duels show Table 1 Parts A/B, Table 2 and Table 3. Reload.
2. Create a hosted Limited event with that layout. Ready eight players and
   assign the draft. Both playing parts of physical Table 1 must be reserved
   together during drafting. Start play, report Part A, and verify Part B stays
   occupied until its own result.
3. Create Commander with three-player games enabled. Give a table seven seats;
   verify the preview and actual pairings use 4 + 3. Disable three-player games
   and verify a three-seat remainder is never used for a duel.
4. Set 20 playing tables, select all, apply square/four seats, then change one
   table individually. Check shapes, capacities, labels and phone scrolling.
5. Open saved-player recovery after closing or expiring an event. Its saved
   identities disappear. Players in active events remain, including players
   waiting or drafting. Disconnect the device: transient errors must not delete
   their identities.
