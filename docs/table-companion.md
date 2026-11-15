# Table devices and companion phones

The table's main device owns the tracker. Open its match menu to request fullscreen, check screen wake status, or share a read-only viewing link/QR. Friends open that link on their phones to see public totals, commanders, commander damage, and game status, and to use Magic Rules/card lookup without editing the table.

For hosted games, joined player seats discover their own table’s viewing link automatically on the event screen. The existing participant session authorizes discovery, and the link is bound to that specific table and game start; another table cannot discover it. A second main publisher for the same game is refused. Restoring another player’s phone does not create an independent tracker unless that device already has saved tracker progress.

The viewer polls about once a second. After ten seconds without a fresh main-device update (or an API error), it explicitly marks totals as potentially out of date. The main device must remain open and online for updates. Local tracking itself continues offline.

Viewing sessions use the existing API server, with separate random 256-bit viewing and writing credentials. The viewing link carries only its viewing credential inside the URL fragment; requests send credentials in authorization headers. The server accepts only a small public projection, never secret roles or host/player session credentials. Viewers cannot publish, revoke, or finish games. The main device can stop sharing and revoke a link.

These are bounded, short-lived sessions on the current API process, not permanent match records: at most 1,000 concurrent shares, creation/update rate limits, and expiry after 24 hours without publication. A service restart or a different API instance invalidates a link; the main device offers a fresh link when it detects expiry. A durable, multi-instance implementation would need shared storage before deploying replicas.

## iPad checks

Use Safari's Share menu → Add to Home Screen and open that icon for an app-sized experience when browser fullscreen is unavailable. Browser fullscreen is requested directly from a tap; unsupported or refused requests show instructions. Screen wake is requested while the tracker is mounted and retried after visibility, focus, page restoration, touch, and unexpected release. Pending requests are cleaned up when leaving the tracker.

Low Power Mode, iPadOS policy, and system Auto-Lock may still prevent a wake lock. The UI reports its actual API status rather than promising the screen cannot sleep. Physical iPad testing after locking/unlocking, app switching, and battery changes remains necessary in addition to automated API tests.

## Event recovery

Home lists saved host desks, player seats, and invitations for this device, including legacy stored host/player sessions. Credentials stay in their original storage entries. Invitation pages poll while visible and refresh on focus/reconnection so an already-open invitation gains a prominent Join event action after the host starts it. Calendar links continue to point at that same invitation.

The match menu scrolls when screen settings or the sharing QR occupy a short landscape viewport, keeping all game actions reachable.
