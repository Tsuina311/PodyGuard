# Table devices and companion phones

The table's main device owns the tracker. Open its match menu to request fullscreen, check screen wake status, or share a read-only viewing link/QR. Friends open that link on their phones to see public totals, commanders, commander damage, and game status, and to use Magic Rules/card lookup without editing the table.

For hosted constructed games, the first player who opens the tracker becomes its controller. Other players at that table see “Game is tracked on [name]’s device”, with read-only and transfer options. Claims are atomic and bound to the current game ID; refreshing or opening another player’s phone cannot create a second game or choose another starting player.

Transfers require a live handoff from the current controller. The requesting player waits while the controller saves pending life changes and acknowledges the request. Only then does control move; the previous device becomes read-only. Life totals, starting player, timers, counters, secret setup and the last 30 undo steps are retained. The requesting player receives private engine state only after becoming the controller. A request expires after 30 seconds if the current device cannot acknowledge it; it can be requested again.

Life taps are immediate and saved locally on every change. Network updates are debounced by 400 ms, with a maximum 1.2-second wait during continuous taps. A disconnected controller keeps working, and reconnecting syncs its local changes before handing over. An offline or closed controller cannot be forcibly replaced, avoiding two independently editable games. During the handoff acknowledgement only, editing is blocked until the outcome can be confirmed; an interrupted handshake is resolved atomically before edits resume.

The viewer polls about once a second. After ten seconds without a fresh main-device update (or an API error), it explicitly marks totals as potentially out of date. The main device must remain open and online for updates. Local tracking itself continues offline.

Viewing links carry a random 256-bit viewing credential inside the URL fragment; requests send it in authorization headers. Viewers receive a public projection without secret roles, targets, undo history, or host/player credentials. Viewers cannot edit or finish games. Joined participants may request control through their authenticated event session.

Hosted event trackers use the existing Postgres database (migration `0030_event_trackers`) and transactional locks. State, ownership, pending handoffs and viewing links survive an API restart and work across API instances. Viewing links expire after 24 hours without updates. Local demo/tests use an in-memory adapter.

Standalone quick-play sharing keeps its existing optional, in-process sessions: at most 1,000 concurrent shares, expiry after 24 hours without publication, and replacement links after an API restart. The standalone main device can stop sharing. These sessions do not gain event ownership or transfer behavior.

## iPad checks

Use Safari's Share menu → Add to Home Screen and open that icon for an app-sized experience when browser fullscreen is unavailable. Browser fullscreen is requested directly from a tap; unsupported or refused requests show instructions. Screen wake is requested while the tracker is mounted and retried after visibility, focus, page restoration, touch, and unexpected release. Pending requests are cleaned up when leaving the tracker.

Low Power Mode, iPadOS policy, and system Auto-Lock may still prevent a wake lock. The UI reports its actual API status rather than promising the screen cannot sleep. Physical iPad testing after locking/unlocking, app switching, and battery changes remains necessary in addition to automated API tests.

## Event recovery

Home lists saved host desks, player seats, and invitations for this device, including legacy stored host/player sessions. Credentials stay in their original storage entries. Invitation pages poll while visible and refresh on focus/reconnection so an already-open invitation gains a prominent Join event action after the host starts it. Calendar links continue to point at that same invitation.

The match menu scrolls when screen settings or the sharing QR occupy a short landscape viewport, keeping all game actions reachable.
