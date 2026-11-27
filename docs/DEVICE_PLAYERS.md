# Several players on one device

Open an event invitation, then choose **Join as another person** to open a new
player tab. Enter a different name and join normally. Repeat for more players;
the host desk remains in its own tab. This works for guests sharing a phone and
for manually rehearsing an event without other people.

Each player tab shows its name and keeps its own seat when refreshed. Home has
**Resume a player · N saved**, opening a recovery page grouped by event. Choose
**Continue as …** to focus that player's existing tab without reloading it,
or reopen the saved seat in a new tab if it is closed. Browser tab-group and
focus policies can limit reuse, especially for independently opened tabs.
The navigation menu also has **Players on this device**, and saved event
cards offer a resume action for that event. Recovery uses local credentials and
works even when the event shortcut has been removed.

Recovery keeps players throughout active events, including waiting, drafting,
and deckbuilding. On opening recovery or returning to the app, and once a
minute while it remains open, the browser checks saved events with the server.
Confirmed closed, expired, or deleted events lose their saved-player entries.
Their host and player shortcuts are also hidden from the navigation list,
including host-only events with no saved players. A confirmed event-not-found
response when opening or unlocking a host desk hides its shortcuts immediately.
Network failures never delete credentials. Private tracker data and unsent
offline actions are retained separately rather than discarded by this cleanup.

On event pages the saved player links are always visible. During a game, they
are in the main tracker's match menu. **All saved players** opens the recovery
page. Closing a tab does not leave or forget a seat; explicitly leaving a seat
does not forget the others. Removing an event shortcut only hides the shortcut.

The original seat and host/account sessions remain compatible with earlier
versions. Additional players join as guests; they are not automatically linked
to the device owner's account. Playgroup identity selection and remembering a
guest still work through the normal join form.

Additional tabs have separate join drafts, offline action queues and tracker
snapshots. Constructed event players share one controlled tracker; the other
players can view read-only or request a live handoff from its current controller.

The `seat` value in an extra tab's URL is a random local selector, not a token.
It cannot recover a player on another device. Send the event's normal invitation
link to friends. Saved seats require the same browser and site; clearing browser
storage removes their recovery credentials. Tabs intentionally opened with the
same saved-player link represent the same person.

Automated coverage uses multiple pages in one browser context (shared storage),
including mobile Chromium and the iPhone WebKit project. Physical-phone checking
is still useful: open several tabs, change their readiness, refresh, close and
reopen a seat, and return to the host desk.
