# Better game nights

## Host and guest flow

Open **My playgroups**, select a group, and use **Plan the next night**. Choose
an absolute start time in the browser's displayed time zone, a location note and
a seat target. Add an optional pace, game length and table preferences. Share
the invitation link with friends; guests do not need an account.

An invitation is unlisted, not private authentication. Anyone with the link can
read its location, agreement and named responses. Use nicknames and avoid
sensitive location details. Only the group owner can list, create, cancel or
start nights. Guest responses use a random browser-held response key, stored
hashed on the server. Reusing that key changes the existing answer. Another
browser cannot recover the response key; the host should ask guests to use the
same browser to change their answer. Names are not proof of identity.

Calendar downloads use UTC instants with the selected IANA time zone shown in
the description. They are one-time `.ics` downloads, not a calendar subscription;
changes and cancellation require a fresh download. Invitations stop accepting
responses after cancellation, event start, or 24 hours after their scheduled
start. Seat targets are planning information, not reservations or a cap on RSVPs.

**Start event** creates the existing Commander event, with one physical table
per four target seats (rounded up). Hosts can then use normal event controls.
Attendance never joins or readies a player automatically. The agreement is copied
into event snapshots and appears on the player lobby and host desk. It does not
change bracket compatibility or block a player from joining.

**Preview pods** uses the same planner as **Match now**. It shows compatible
pool, seat count, repeated opponent pairs in this event, and the longest current
wait. Waiting messages identify unavailable tables or insufficient compatible
ready players. A preview does not reserve seats. Confirmation recalculates with
current state; the final pods can differ if players or tables have changed.

## API and storage

- `GET/POST /playgroups/:playgroupId/nights`: owner listing and creation.
- `GET /nights/:id`: invitation and public named responses; no credentials.
- `GET /nights/:id/calendar`: calendar attachment.
- `POST /nights/:id/rsvp`: displayName, response (`yes/maybe/no`), rsvpToken.
- `POST /nights/:id/cancel`: owner cancels an unstarted night.
- `POST /nights/:id/start`: owner supplies hostPin; returns normal event/hostToken.
- `GET /events/:joinCode/match-preview`: host-only matching explanation.

All invitation responses use no-store caching. PostgreSQL serializes night
mutations with an advisory lock; competing requests retry rather than occupying
all pooled connections. All mutation queries share one transaction connection, including event creation,
so a failed start rolls back both the event and invitation link.
Event records also carry a unique internal game-night ID so
a retry can recover an event if saving the invitation's event link failed.
Deleting a playgroup cascades through its nights and responses.

Migration **0029_game_nights** adds the tables and optional event metadata.
It must be applied through the normal reviewed release process. This task does
not migrate or deploy production. Historical events default to an empty
agreement and no game-night ID.

## Reliability checks

`yarn test` includes offline replay, socket lifecycle, service-worker installation
and cache isolation, scheduling validation, invitation authorization, response
updates, concurrent starts, and matching preview tests. Concurrent completions
use a PostgreSQL row lock (and a corresponding memory-store guard) so opponent
history is recorded once.

`yarn test:coverage` measures the selected critical recovery and scheduling
modules and rejects regression below the committed per-file baseline in
`docs/testing/coverage-baseline.json`. It is not whole-project coverage.
Only use `node scripts/run-coverage.mjs --save-baseline` after reviewing the
report and justifying a baseline change.

`yarn test:e2e` runs Chromium locally. CI also runs a focused iPhone/WebKit set;
select both locally with E2E_BROWSERS=chromium,webkit. Install
both engines with `yarn playwright install --with-deps chromium webkit`.
The new game-night browser flow checks creation, guest response/reload/change,
calendar download, ownership, agreement transfer and an automated WCAG audit.
Physical Safari/Android checks remain necessary for camera access, installation,
keyboard/touch behavior, screen locking and actual Google login.

`yarn test:persistence` requires an explicitly configured, migrated managed test
database. It now checks competing table claims, stale releases, failed-pod
rollback, active event recovery after reconnection, concurrent completion and
night/RSVP persistence in addition to existing account/history checks. Fixtures
are scoped to a unique test account and cleaned in finally. It does not apply
migrations or provision a database.

## Validation limits in this Cloud environment

No TEST_DATABASE_URL was configured, so real PostgreSQL checks were not run.
WebKit downloads from cdn.playwright.dev and
playwright.download.prss.microsoft.com were denied by the network policy;
WebKit configuration is committed for CI but local WebKit results are unverified.
The local Chromium run uses the existing system Chromium and system ffmpeg.
For environments with a system browser, set E2E_CHROMIUM_EXECUTABLE to its path.
E2E_BROWSERS=chromium explicitly selects the supported engine locally; the
CI default still requires both Chromium and WebKit. This selection
does not verify WebKit.
No physical-phone or production rehearsal was performed by this task.

Push notifications, external calendar synchronization, automatic preference-based
matching, public ratings and automated recommendations are deferred. Existing
results and pod ratings remain unchanged; collect voluntary group feedback
before designing personalized recommendations.
