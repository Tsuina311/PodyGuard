# Public Event Display / TV Mode

Limited matches show their best-of score on the host Overview and public display.
Each recorded game updates the shared score without completing the match or
releasing its table. Starting the next game (with or without the life tracker)
starts that game's elapsed clock; between games the display says it is waiting
to start. The elapsed clock disappears when the match result is reported.
Hiding timers on a paired display also hides these clocks.

Migration 0033 adds the nullable `limited_matches.current_game_started_at`
timestamp. Existing rows remain valid. Deployments must apply migrations before
starting the updated server; the Render start command already does this.

Turn a TV, projector, or cast browser tab into a live read-only operating picture of a PodyGuard event.

## Recommended setup

### Send a link with a screen QR

On the monitor, open **Event display** and choose **Show connection QR**.
On the phone, use **Send to screen** in an event's navigation menu, or in the
shared tracker's sharing controls, then scan the monitor's QR. A native camera
can also open the QR's sender page, where an event code or app share link can
be entered. Code entry remains available.

The QR contains a random transfer ID and a single-use sending capability, never
the receiving capability or a destination. The monitor keeps its separate
receiving credential in tab-scoped session storage. Both capabilities expire
after five minutes. Only the first valid destination is accepted, and that
result can be read repeatedly until expiry, including after a dropped response
or a reload of the receiving tab.

Migration 0034 stores transfers in PostgreSQL. A conditional update arbitrates
the first submission across server instances. Socket notifications reuse the
app's real-time connection; polling while waiting covers reconnects and cases
where the sender and receiver reach different instances. Credentials are hashed
in storage, sent in authorization headers, and excluded from cached responses.

Only allowlisted app routes and their relevant query parameters/fragments can
be sent. Receiving a host link still requires the receiving browser's own host
authorization. No accounts, player sessions, or login tokens are transferred.
For a phone-only local game, enable **Share live tracker** first and send its
existing read-only link; the device-only game URL is not transferable.

The QR uses the configured public app URL in production. Camera permission and
rear-camera behavior still need checking on physical phones over deployed HTTPS.
The dedicated PostgreSQL persistence verifier also includes cross-connection
submission/reconnect checks and requires a migrated `TEST_DATABASE_URL`.

```text
Laptop / mini-PC
        ↓ HDMI
TV / projector
        ↓
open PodyGuard /#/display
```

No Chromecast SDK, AirPlay API, or native TV app is required. Any standards-based browser works.

## Pairing

1. On the display device open `/#/display`.
2. A short pairing code appears (for example `418 572`).
3. On the host phone/laptop, open the event desk → **Displays** → enter the code → **Approve**.
4. The display claims a long-lived `ds1…` token once and navigates to `/#/display/live`.

The short code:

- expires after about 10 minutes;
- is single-use for pairing;
- is never the permanent credential;
- is rate-limited against guessing on the host event.

Refresh / sleep / Socket.IO reconnect reuse the stored display token until the host revokes it.

## Security model

| Client | Credential | Capabilities |
|--------|------------|--------------|
| Host desk | Host PIN → `hs1…` session | Mutate event, approve/revoke displays, announce |
| Player | `ps1…` participant session | Join, queue, report (where allowed) |
| Public display | `ds1…` display token | Read sanitized display state only |

Display tokens are stored **hashed** server-side. Host and participant tokens never go on the TV.

Backend authorization enforces this. Display tokens are rejected on host mutation routes.

## Public-data projection

Canonical event state is projected server-side into `PublicDisplayEventState`:

- event name / public status / game mode;
- tables with activity labels and optional player **display names**;
- casual + Limited queues (counts and safe hints only);
- recent assignments (timestamped);
- Limited sessions (phase, round, pairings, timers);
- optional host announcement.

Never included: host PIN/hash, host/player session tokens, emails, challenge packs, decks beyond public labels, feedback, metrics, matcher internals.

## Display modes (host-controlled)

| Mode | Content |
|------|---------|
| `FLOOR` | Physical tables / activity |
| `QUEUES` | Waiting queues |
| `LIMITED` | Draft / sealed sessions & pairings |
| `AUTO` | Cycles Floor → Queues → Limited (respects `prefers-reduced-motion`) |

Optional privacy: `showPlayerNames = false` shows counts instead of names.

## Socket.IO

```text
display authenticates with ds1 token
      ↓
server resolves eventId from token hash
      ↓
socket joins display:{sessionId}
      ↓
server emits display-snapshot (sanitized)
```

`event:{joinCode}` continues to serve host/player `EventSnapshot` watchers unchanged.

On every `live.publish(joinCode)`, active displays for that event receive a fresh projection.

## Announcements

Host sends a plain-text announcement with optional duration (default ~30s).

- HTML/JS is stripped (`<>` removed);
- rendered as text on the display;
- host can cancel;
- presence is driven by `endsAt` timestamps (survives refresh).

## Reconnect behavior

1. Load token from `podyguard.display.token`.
2. `GET /displays/state` for authoritative state.
3. Socket `watch-display` for live updates.
4. If revoked → clear storage → “Pair this screen again.”

While disconnected, the last safe state stays visible with a **CONNECTION LOST** indicator.

## Legacy Limited floor URL

`/#/display/event/:joinCode` remains available for join-code Limited boards. Prefer paired displays for production TVs.

## Matcher

Frozen Commander matcher settings are unchanged:

`opportunity grace = 120s / maxExistingWait = 600s`
