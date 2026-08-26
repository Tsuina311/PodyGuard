# Multiplayer Casual Matchmaking App — Master Product & Technical Specification

You are helping me build a new application for organising casual multiplayer tabletop games at physical events such as local game stores, Commander nights, conventions, MagicCons and community events.

The first supported game is **Magic: The Gathering Commander**, but the core event and matchmaking architecture must not be hardcoded to Commander.

The product is NOT primarily:

- a tournament manager;
- a deck builder;
- a collection manager;
- a Magic life-counter app.

The core product is:

> A live matchmaking system for casual physical multiplayer events.

The fundamental loop is:

ARRIVE
→ READY
→ MATCH
→ PLAY
→ REQUEUE

The first use case is Commander because there is a real problem:

A physical venue may have dozens or hundreds of players who:

- arrive at different times;
- finish games at different times;
- play different Commander brackets;
- may have several decks across several brackets;
- may accept pods of 3 or 5;
- should ideally not repeatedly face the same people;
- should not have to wait unnecessarily;
- should be dynamically reassigned throughout the event.

The organiser should not need to manually create pods continuously.

The player experience must be extremely low-friction.

---

# 1. Ideal player flow

The ideal first-time experience is:

scan Quick Response (QR) code
↓
enter display name
↓
select the decks/brackets available today
↓
READY
↓
wait
↓
MATCH FOUND
↓
go to physical table
↓
play
↓
optionally use built-in game tracker
↓
game ends
↓
PLAY AGAIN / PAUSE / LEAVE
↓
if PLAY AGAIN → READY again

A casual player should NOT need to:

- install a native application;
- create an account;
- verify an email;
- create a persistent profile;
- register a decklist;
- learn the application before joining.

Persistent accounts may exist later but must remain optional for players.

---

# 2. Core technical decisions

Initial stack:

Frontend:
- React
- TypeScript
- Vite
- Progressive Web App (PWA)

Backend:
- Node.js
- TypeScript
- Fastify
- Socket.IO

Database:
- PostgreSQL

Initial deployment:
- frontend → static hosting such as GitHub Pages
- backend → free or very cheap Node hosting
- PostgreSQL → cheap/free managed PostgreSQL during development

Later:
- Node + PostgreSQL can move to a small Virtual Private Server (VPS) if real usage justifies it.

Do NOT use React Native initially.

Do NOT require Supabase.

Do NOT use Bluetooth for matchmaking.

Do NOT use WebRTC (Web Real-Time Communication) peer-to-peer networking.

The backend is authoritative for:

- events;
- participants;
- queue state;
- matchmaking;
- tables;
- pod creation;
- results.

Gameplay can remain local-first.

---

# 3. Architectural layers

Keep these concerns separate.

Conceptually:

1. EVENT / QUEUE ENGINE

Handles:

- events;
- rooms;
- participants;
- sessions;
- READY / PLAYING / PAUSED;
- physical tables;
- QR joining;
- reconnects.

2. MATCHMAKING ENGINE

Handles:

- compatible pools;
- preferred group size;
- allowed group sizes;
- flexible participants;
- waiting time;
- rematch avoidance;
- fairness credits;
- table assignment.

3. GAME MODULE

Handles:

- game-specific tracker;
- game-specific rules;
- challenges;
- game results;
- optional secret roles;
- game-specific UI.

Commander is the first GameModule.

Do NOT build a giant “universal tabletop framework” before we need it.

However, the core domain should NOT contain Commander-specific names when a generic concept exists.

Prefer:

Event
Participant
Match
Pod
PhysicalTable
MatchmakingPool
GameMode
GameModule
GameSession

Avoid:

CommanderPlayer
CommanderRoom
CommanderTable

inside generic packages.

---

# 4. Suggested repository structure

If the repository already exists, inspect it before changing anything.

If greenfield, use a structure conceptually similar to:

apps/
  web/
  server/

packages/
  shared/
  matching/
  game-core/
  game-commander/
  simulation/

Responsibilities:

apps/web
- React application
- player UI
- organiser dashboard
- offline/local gameplay state
- PWA

apps/server
- Fastify
- Socket.IO
- sessions
- PostgreSQL
- matchmaking orchestration
- entitlement/capacity checks later

packages/shared
- shared types
- validation schemas
- state enums

packages/matching
- PURE TypeScript
- deterministic
- no React
- no database
- no Socket.IO

packages/game-core
- generic game-session abstractions
- challenge framework
- game events
- generic result model

packages/game-commander
- Commander life tracker
- Commander damage
- poison
- Commander-specific challenge detectors
- Commander game mode configuration

packages/simulation
- seeded simulations
- benchmarks
- Monte Carlo tests
- optimality oracle

Adapt this structure if the existing code has an equally clean architecture.

---

# 5. Server-authoritative state

The backend is the source of truth.

Never let a client independently decide that a pod has been created.

Bad:

Alice's phone decides:
Alice + Bob + Claire + David = Pod 14

Good:

backend
→ starts PostgreSQL transaction
→ verifies players still eligible
→ reserves players
→ reserves table
→ creates pod
→ commits
→ sends MATCH_FOUND

All durable state must be recoverable after a backend restart.

Do NOT keep the only copy of:

- READY participants;
- pods;
- tables;
- game status;

inside Node memory.

PostgreSQL contains durable truth.

---

# 6. Event creation and QR joining

An organiser creates an event.

Example:

Commander Night Brussels

Backend creates:

internalEventId
publicJoinCode
host/admin credential

Example:

publicJoinCode = H7KQ4P

QR contains something like:

https://app.example/#/e/H7KQ4P

If GitHub Pages is used, prefer hash routing unless deployment provides a proper Single Page Application fallback.

Do NOT expose internal database IDs or host credentials in the public QR.

Event states:

OPEN
→ participants may join

LOCKED
→ existing participants continue
→ new participants cannot join

CLOSED
→ event finished

---

# 7. Guest player sessions

Casual players do not require accounts.

Flow:

QR
→ name
→ decks/brackets
→ JOIN

Backend creates:

eventParticipantId
sessionToken

The session token must be cryptographically secure.

Do not put the token in the URL.

Prefer storing a hash of sensitive session tokens server-side.

Client stores its token locally.

On reload:

stored session
→ backend
→ authoritative current state

The player should resume immediately as:

READY
MATCHED
PLAYING
PAUSED
etc.

---

# 8. Participant state machine

Do NOT use unrelated booleans.

Use an explicit state machine.

Conceptually:

type ParticipantStatus =
  | 'joined'
  | 'ready'
  | 'matched'
  | 'playing'
  | 'paused'
  | 'left';

Typical flow:

JOINED
→ READY
→ MATCHED
→ PLAYING
→ READY

or:

PLAYING
→ PAUSED

or:

READY
→ LEFT

Reject invalid transitions server-side.

---

# 9. Physical tables

The organiser defines physical tables:

Table 1
Table 2
...
Table 40

Table states:

FREE
OCCUPIED
DISABLED

Pod creation must reserve a table transactionally.

Two active pods must NEVER own the same physical table.

The organiser can:

- enable/disable tables;
- manually free a table;
- cancel a pod if required.

---

# 10. Realtime

Use Socket.IO.

Do NOT broadcast every event to every participant.

Conceptually:

HOST CHANNEL
→ global event summary

PLAYER CHANNEL
→ personal state / match result

POD CHANNEL
→ information relevant to the pod if needed

READY participants need realtime because they must receive MATCH_FOUND immediately.

PLAYING participants do not necessarily need permanent realtime.

---

# 11. Connection lifecycle and cost efficiency

A participant does NOT need a WebSocket open throughout an entire Commander game.

Preferred lifecycle:

READY
→ realtime connected

MATCH_FOUND
→ receive assignment

PLAYING
→ gameplay works locally
→ realtime may disconnect

GAME FINISHED
→ HTTP request sends result/state

PLAY AGAIN
→ reconnect realtime
→ READY

Host dashboard stays realtime.

This reduces simultaneous realtime connections dramatically.

---

# 12. Internet requirements

Internet required for:

- joining;
- session recovery;
- READY;
- matchmaking;
- receiving table assignment;
- requeueing;
- result synchronisation.

Internet should NOT be required for:

- life tracking;
- Commander damage;
- poison;
- local challenge detection;
- undo;
- game timer.

During gameplay, persist state locally using IndexedDB or equivalent.

If the network disappears:

game continues.

At game end:

result = pending

When Internet returns:

synchronise pending result.

---

# 13. Generic matchmaking pools

Do not hardcode “bracket” as a fundamental engine concept.

The generic concept is:

MatchmakingPool

Commander currently maps:

Pool → Commander Bracket

Example:

B1
B2
B3
B4

Another future game may use:

Beginner
Intermediate
Competitive

or:

Format A
Format B

The matcher only needs to know:

which pools each participant is eligible for.

---

# 14. Commander players can be flexible across brackets

This is a VERY IMPORTANT product feature.

A casual Commander participant may bring multiple decks.

Example:

Giada
Bracket 2

Muldrotha
Bracket 3

Ur-Dragon
Bracket 4

Participant eligibility is therefore NOT:

bracket = 3

Instead:

type DeckOption = {
  id: string;
  name?: string;
  poolId: string;
  preference: 'preferred' | 'accepted';
};

Participant may say:

Preferred:
Bracket 3

Also willing:
Bracket 2

The matcher may assign that participant to either eligible bracket.

Each final pod still has exactly ONE bracket.

All players in that pod must be compatible with that bracket.

---

# 15. Flexible bracket assignment example

Suppose:

Bracket 2:
15 inflexible players

Bracket 3:
16 inflexible players

Flexible player:
accepts B2 and B3
prefers B3

Without using flexibility badly:

If assigned B3:
B2 = 15
B3 = 17

This leaves poor pod utilisation.

If assigned B2:

B2 = 16
B3 = 16

→ 8 perfect pods
→ 0 waiting

The matcher should detect that assigning the flexible player to B2 materially improves the global result.

This means matchmaking conceptually occurs in two steps:

1. POOL ASSIGNMENT
choose which eligible pool flexible participants should serve

2. POD ASSIGNMENT
form actual pods inside those pools

The implementation may optimise both jointly if cleaner.

---

# 16. Preferred pools vs accepted pools

The system should NOT abuse flexible participants.

Example:

Preferred:
B3

Accepted:
B2

Assigning the player to B2 incurs a small “concession”.

The matcher may do so when it meaningfully improves:

- total matched players;
- pod quality;
- waiting time;
- group-size utilisation.

But B3 should remain preferred when equivalent options exist.

---

# 17. Flex / Fairness system

Introduce event-local fairness credits.

This is NOT a persistent matchmaking advantage.

EVERY EVENT STARTS AT ZERO.

Example:

flexCredits = 0

A participant earns Flex Credits only when the system ACTUALLY USES their flexibility.

Possible concessions:

- assigned to secondary bracket;
- accepts a 3-player pod;
- accepts a 5-player pod;
- future configurable concession.

Do NOT reward someone simply because they checked many boxes.

Reward actual concessions.

Example:

secondary bracket:
+2

3-player pod:
+3

5-player pod:
+2

Exact values are configurable and must be calibrated through simulations.

---

# 18. What Flex Credits do

Flex Credits mean:

“This participant has recently absorbed some of the imperfections of the queue.”

The matcher should then try to give them a better experience later in the SAME EVENT.

Examples:

- stronger preference for a pod of 4;
- stronger preference for preferred bracket;
- slight priority when wait times are otherwise similar.

Flex Credits can be spent/consumed conceptually as fairness is restored.

Example:

Bob accepts a 3-player pod
→ +3 Flex

Next queue:
two equivalent matching choices exist
→ Bob gets the cleaner 4-player pod

Flex can decrease again after being used.

---

# 19. Waiting time remains dominant

DO NOT allow Flex Credits to make veterans constantly jump ahead.

Time waiting remains the strongest fairness signal.

Someone waiting for 15 minutes must beat someone who just joined, regardless of Flex.

Conceptually:

priority =
  waitingTime
  + boundedFlexAdjustment

The Flex contribution must be capped.

---

# 20. No persistent matchmaking advantage

At event end:

eventFlexCredits → reset/disappear

We MAY store lifetime statistics for fun:

Lifetime Flex Earned
Games Played
Flex per Game
Number of concessions

But these MUST NEVER influence future matchmaking.

An old player and a brand-new player begin every event equally:

Flex = 0

This is a hard product principle.

---

# 21. Matchmaking priorities

Inside compatible pools, optimise mainly for:

1. maximise number of participants matched;
2. waiting fairness;
3. avoid repeated opponents;
4. preferred pool/deck;
5. ideal group size;
6. event-local Flex fairness;
7. future social constraints if added later.

Commander preferred pod size:

4

Optional allowed sizes:

3
4
5

3/5 support must be organiser-configurable.

---

# 22. Rematch avoidance

Track participant pair history during the event.

Example:

Game 1:
A B C D

When possible, do not simply create:

A B C D

again.

Prefer mixing players.

Repeated opponents create a penalty.

Recent repetition may create a stronger penalty than older repetition.

Do not make this an absolute constraint because low populations may make rematches necessary.

---

# 23. Matchmaking engine interface

Keep the engine PURE.

Example:

interface MatchingStrategy {
  createMatches(
    participants: ReadyParticipant[],
    tables: AvailableTable[],
    history: MatchHistory,
    options: MatchingOptions,
  ): MatchingResult;
}

No database.

No React.

No Socket.IO.

No direct system clock dependency if avoidable.

Pass time as input so tests are deterministic.

---

# 24. No machine learning initially

Do NOT use Machine Learning (ML) for matchmaking.

This is currently:

constrained optimisation

not:

prediction.

We do not yet have real user-satisfaction data.

A deterministic system is:

- explainable;
- testable;
- reproducible;
- benchmarkable.

ML may become useful MUCH later if we collect large amounts of real optional feedback.

Example:

How was this pod?

😞 😐 🙂 😄

Later a model might predict satisfaction based on:

- wait;
- rematches;
- pod size;
- bracket compromise;
- game duration.

Such a model would only provide ONE scoring input.

Hard constraints remain deterministic.

---

# 25. Match creation must be transactional

Critical.

Conceptually:

BEGIN

select and lock eligible READY participants

verify:
status still READY

lock free physical table

verify:
table still FREE

create pod

assign pool/bracket

record deck choice if relevant

mark participants MATCHED

mark table OCCUPIED

record fairness concession if any

COMMIT

If anything changed:

ROLLBACK

Never rely on an in-memory mutex as the only correctness mechanism.

---

# 26. Testing philosophy

The matching engine deserves the strongest testing in the product.

We need:

1. unit tests;
2. property-based tests;
3. exact optimality checks for small cases;
4. Monte Carlo simulation of complete events.

Do NOT accept:

“this example looks good.”

---

# 27. Unit-test scenarios

Examples:

4 B3 players
→ one B3 pod of 4

8 B3 players
→ two pods of 4

5 players
3/5 disabled
→ 4 matched
→ appropriate participant waits

Bracket 2 + Bracket 3 inflexible
→ never mixed

PLAYING participant
→ never matched

PAUSED participant
→ never matched

Flexible B2/B3 player
→ can be assigned to either

Example critical test:

15 B2
16 B3
1 flexible B2/B3

Expected:
flexible → B2

Result:
16 B2
16 B3
8 pods
0 waiting

Also test:

long-waiting participant
vs
new flexible high-Flex participant

Long wait must not be starved.

---

# 28. Property-based tests

Use `fast-check` or similar.

Generate random participant pools.

Always enforce invariants:

- no participant in two pods;
- no participant disappears;
- only READY participants matched;
- each pod has one valid pool;
- every participant is eligible for assigned pool;
- group sizes valid;
- no disabled table assigned;
- no physical table assigned twice;
- PLAYING participants never rematched;
- PAUSED participants never matched;
- Flex never persists into a new event;
- transactional result internally consistent.

Preserve failing random seeds.

---

# 29. Small-case optimality oracle

For small populations:

8
12
maybe 16

create a test-only exhaustive/branch-and-bound solver.

Compare:

production matcher

vs

mathematical best solution under the same scoring function.

Measure optimality gap.

Example:

optimal score = 100
production = 97
→ 97%

The expensive oracle is TEST-ONLY.

Production does not need to use it.

Google OR-Tools or another optimisation solver may be used for benchmarks if useful, but production must not depend on it unless later justified.

---

# 30. Monte Carlo event simulations

Build deterministic seeded simulations.

Example:

seed = 19281726

Simulate:

- 7 participants;
- 11;
- 17;
- 30;
- 50;
- 100;
- 500.

Multiple pools.

Flexible participants.

Game duration distributions.

Arrival times.

Pause durations.

Early departures.

Tables becoming free.

Pods finishing asynchronously.

Participants requeueing.

---

# 31. Full-event simulation

Simulate events like:

18:00 14 arrive
18:04 3 arrive
18:12 one leaves
18:31 pod finishes
18:33 four requeue
18:40 two pause
18:44 six arrive
18:50 one flexible player changes available decks
etc.

Run thousands of virtual Commander nights.

---

# 32. Matchmaking metrics

Track:

average wait

median wait

95th percentile wait

maximum wait

number waiting over threshold

% matched

number left waiting

rematch rate

average repeated opponents

pod-size distribution

preferred-bracket assignment rate

secondary-bracket assignment rate

Flex earned

Flex consumed/compensated

fairness distribution

table utilisation

algorithm execution time

Do not optimise only the average.

A system where:

49 people wait 3 minutes
1 person waits 35 minutes

is not good.

---

# 33. Organiser dashboard

Show:

EVENT NAME

participants total

READY
MATCHED
PLAYING
PAUSED

Waiting participants ordered by waiting duration.

Example:

Alice 08:42
Marco 05:12
Claire 03:48

Tables:

Table 1 PLAYING 32m
Table 2 FREE
Table 3 PLAYING 48m
Table 4 DISABLED

Host actions:

- open/lock/close event;
- enable/disable tables;
- pause/remove participant;
- cancel pod;
- trigger matcher manually;
- inspect queue;
- inspect current pods.

Later:

AUTO MATCH
ON/OFF

Do not force auto-match in earliest builds.

---

# 34. Player waiting screen

Example:

COMMANDER NIGHT

Gwenaël

Available decks:
Giada — B2
Muldrotha — B3 preferred

READY

Waiting:
02:48

Flex:
3

[ PAUSE ]
[ LEAVE ]

Do not show internal scoring or complex organiser information.

---

# 35. Match found

Example:

MATCH FOUND

TABLE 17

Bracket 2

Alice
Bob
Claire
Gwenaël

Your deck:
Giada

[ I'M AT THE TABLE ]

Flexible participants must clearly see which deck/bracket the matcher selected.

---

# 36. Integrated game tracker

The game tracker exists because it provides continuity:

MATCH
→ PLAY
→ RESULT
→ REQUEUE

It is NOT the primary product.

At pod start:

[ USE GAME TRACKER ]

[ PLAY WITHOUT TRACKER ]

Measure usage.

Do not force it.

---

# 37. Commander game tracker MVP

Support:

- 3–5 players;
- starting life;
- life +/-;
- Commander damage per opponent;
- poison;
- Commander tax;
- Monarch;
- Initiative;
- undo / short history;
- timer;
- random first player;
- eliminated participant;
- winner;
- end game.

Design for one phone/tablet placed in the middle of the table.

Do NOT synchronise life totals between all player phones initially.

## Archenemy Commander

Host-selectable mode with strict 4-player pods:

- one Archenemy against a team of three;
- both sides start at 60 life;
- the hero team shares life and takes its turn together;
- players choose the Archenemy before the tracker starts, or assign one at
  random;
- the Archenemy always goes first and draws on the first turn;
- shuffle all 40 Duskmourn Commander schemes;
- reveal the next scheme during each Archenemy first main phase;
- non-ongoing schemes return to the bottom after resolving;
- ongoing schemes stay face up until the table marks them abandoned, then
  return to the bottom.

Two-Headed Giant setup also offers random team assignment.

---

# 38. Do NOT implement turn tracking

Do not require:

END TURN
END TURN
END TURN

during normal gameplay.

This creates too much friction.

We only request turn-related context if a potential challenge makes it useful.

General UX principle:

> Never ask players to continuously enter information merely because it might become useful later.

Ask only when necessary.

---

# 39. Challenges / achievements

Challenges are a separate gamification layer from Flex.

Keep them completely independent.

Flex:
→ matchmaking fairness
→ event-local
→ resets each event

Challenge Points:
→ fun
→ achievements
→ optional leaderboard/recap
→ NEVER affect matchmaking

---

# 40. Challenge Packs

From the first usable game-tracker version, support Challenge Packs.

Provide at least one official starter pack.

Example:

Classic Commander Challenges

Commander Finish
→ win through Commander damage

Centurion
→ reach 100 life

Double Kill
→ eliminate two opponents in the same turn

Toxic
→ win via poison

Comeback
→ win after having reached 5 life or less

Do NOT give random personal challenge sets.

Some objectives are trivial for certain decks and almost impossible for others.

Every participant sees the SAME event challenge pack and may naturally complete objectives appropriate to their deck.

---

# 41. Challenge detection categories

Three categories:

A. AUTOMATIC

Examples:

life >= 100

Commander-damage elimination

poison elimination

reach <=5 life then later win

play X games

play against X different people

B. DETECTED + CONTEXT QUESTION

Example:

two participants eliminated near the same moment

Popup:

Were these eliminations during the same turn?

[ YES ]
[ NO ]

Or:

Large life increase detected.

Did you gain 50+ life during the same turn?

[ YES ]
[ NO ]

Ask the smallest useful question.

Do NOT introduce global turn tracking.

C. MANUAL CLAIM

Examples impossible for tracker to know:

- alternative win condition;
- control X creatures;
- cast X spells;
- unusual board-state achievements.

Participant presses:

CLAIM

Optionally:

another pod participant confirms.

Keep casual trust assumptions reasonable.

---

# 42. Challenge engine

Do not hardcode every challenge as random UI conditionals.

Create a structured challenge model.

Conceptually:

type Challenge = {
  id: string;
  name: string;
  description: string;
  category: string;
  detectionMode:
    | 'automatic'
    | 'confirmation'
    | 'manual';
  points: number;
  repeatRule:
    | 'once-per-event'
    | 'once-per-game'
    | 'repeatable';
};

Automatic challenges should use predefined safe primitives.

Do NOT allow arbitrary user-written JavaScript.

Possible Commander primitives:

life_reaches(X)

life_below_then_win(X)

commander_damage_reaches(X)

poison_reaches(X)

players_eliminated(X)

games_played(X)

different_opponents(X)

---

# 43. User-created Challenge Packs

Organisers should eventually be able to:

- create a Challenge Pack;
- copy the official pack;
- edit it;
- create from scratch;
- keep it PRIVATE;
- make it UNLISTED;
- publish it PUBLIC later.

Initial version may support private custom packs before public community publishing.

Model:

ChallengePack

ChallengePackVersion

Challenge

ChallengeCompletion

Do NOT mutate a pack already used by historical events.

Prefer versioning or copy/fork semantics.

---

# 44. Community Challenge Packs

Later, organisers may publish packs.

Other organisers can:

PREVIEW
USE
COPY & EDIT

Prefer copy/fork semantics.

Example:

Brussels Casual Chaos
by Marco

12 challenges
Used in 38 events

Community statistics may include:

events using pack

games eligible

completion rate

popularity

rating if added later

The system should allow community-created challenge ideas to inform future official packs.

---

# 45. Challenge statistics

Collect aggregate statistics.

Example:

Centurion

included in 842 events
completed in 6.7% of games

Double Kill

completed in 14.2%

This helps determine:

- too easy;
- too hard;
- popular;
- ignored;
- suitable for official pack.

Do not collect unnecessary personal data.

---

# 46. Community moderation

If public challenge content exists, support:

PRIVATE
UNLISTED
PUBLIC

Public content needs:

REPORT

Admin must be able to hide/remove content from public discovery.

Historical event copies should remain stable when reasonable.

---

# 47. Event recap

At event end, participant may see:

Games: 5
Different opponents: 17
Wins: 2

Flex earned: 8
Flex/game: 1.6

Challenges completed: 4

Badges:
Flexible Player
Commander Slayer
Centurion

Lifetime Flex statistics may be stored for fun but NEVER influence matchmaking.

---

# 48. Product telemetry

Collect lightweight product events:

joined_event

became_ready

match_found

match_confirmed

game_tracker_started

game_tracker_skipped

game_finished

requeued

paused

left_event

challenge_completed

flex_concession_used

Derive:

wait duration

game duration

games/player

tracker adoption

Flex distribution

challenge completion

Do NOT collect unnecessary identity information.

---

# 49. Monetisation architecture

During beta:

EVERYTHING FREE.

We first need real events and product validation.

After beta:

players remain FREE.

Hosting small events remains FREE.

Serious event hosting becomes PAID.

Commercial principle:

> Players never pay to participate.
> Organisers pay for capacity and advanced event features.

---

# 50. Free vs paid capacity

The free event must have a participant limit.

Possible initial commercial structure:

FREE
→ approximately 16 participants/event

ORGANIZER
→ approximately 64 participants
→ around €5/month as an initial hypothesis

STORE
→ approximately 200 participants
→ higher monthly tier

LARGE EVENT
→ 500+
→ higher tier or one-off Event Pass

Exact numbers/pricing are product hypotheses, NOT hardcoded business truth.

During beta do not enforce these limits.

---

# 51. What counts toward capacity

The limit applies to total participants checked into the event.

NOT only currently READY participants.

Otherwise a venue could cycle hundreds of players through a 16-person free event.

Example:

Free event:
capacity 16 checked-in participants.

17th participant scans QR:

Do NOT display something insulting like:

“Host did not pay.”

Instead:

Participant:
Waiting for organiser approval / event currently full

Host:
Free event limit reached: 16/16
Upgrade this event to admit more participants.

Existing participants continue normally.

---

# 52. Acquisition-friendly trial

Potential later strategy:

First organiser event:
up to ~50 participants FREE

Future free events:
normal free cap

This lets a store test the system during a real Commander Night before paying.

Do NOT implement payments in MVP, but design entitlements/capacity checks so this is easy to add later.

---

# 53. One-off Event Pass

Some organisers may run one large event per year and dislike subscriptions.

Future support may include:

Event Pass
→ temporary participant-cap upgrade
→ one specific event

Do not require monthly subscription for every occasional organiser.

---

# 54. Premium features beyond capacity

Participant capacity is the main unavoidable commercial boundary.

Premium may ALSO include:

- custom Challenge Packs;
- community Challenge Pack publishing;
- advanced statistics;
- longer event history;
- store branding;
- multiple organisers;
- advanced game modes;
- premium event templates.

Do NOT make core player gameplay worse to create artificial monetisation.

---

# 55. Additional Game Modes

Commander Classic is the base free GameMode.

Premium organisers may later gain additional modes.

Examples:

Treachery

Kingdoms

Two-Headed Giant

Planechase-related experiences

custom casual variants

The important architectural point:

GameMode must be modular.

Do NOT scatter:

if (treachery)

throughout generic event code.

---

# 56. Generic GameMode abstraction

Conceptually:

type GameModeDefinition = {
  id: string;

  preferredGroupSize: number;

  allowedGroupSizes: number[];

  matchmakingPools?: MatchmakingPoolDefinition[];

  supportsTeams: boolean;

  usesSecretRoles: boolean;

  gameModuleId: string;
};

Commander:

preferredGroupSize = 4
allowed = [3,4,5]

Treachery may prefer another group size.

A duel game:

preferredGroupSize = 2
allowed = [2]

---

# 57. Secret-role modes such as Treachery

Treachery is especially suitable for the application.

Example flow:

pod formed
↓
server assigns secret roles
↓
each participant opens:

REVEAL MY ROLE

↓
role displayed privately
↓
participant closes it

The client must only receive the secret role belonging to that participant.

Do NOT broadcast all role assignments to all player devices.

Server can retain role mapping for victory resolution.

This is a future premium GameModule, not MVP.

---

# 58. Supporting other games later

The generic event loop should remain:

JOIN
→ READY
→ MATCH
→ TABLE
→ PLAY
→ FINISH
→ REQUEUE

Adding another casual multiplayer game should ideally require:

- GameMode configuration;
- matchmaking-pool configuration;
- game-specific UI;
- result logic;
- challenge primitives.

The event/session/queue infrastructure stays shared.

---

# 59. Team-based games

Future games may use teams.

Generic match data should not assume every participant competes individually.

Conceptually:

Match

participants

optional teams

GameMode defines team structure.

Example:

4 participants
→ two teams of 2

Do not implement sophisticated team matching until a real second game requires it.

---

# 60. Competitive tournament systems are separate

Do NOT mix casual live matchmaking with Swiss tournament logic.

Future architecture may contain:

CasualQueueMatcher

TournamentMatcher

A competitive tournament requires:

- rounds;
- Swiss;
- standings;
- byes;
- tie-breakers;
- top cut;
- deck registration.

That is a separate future product domain.

Do NOT build it now.

---

# 61. Development diagnostics

Development-only tools should show:

event state

participant state

socket status

matchmaking cycle

eligible pools

flexible-participant pool assignment

candidate pods

pod scores

Flex concessions

selected pods

database transaction result

reconnect behaviour

challenge candidates

challenge detections

Do not expose technical scoring details in production UI.

---

# 62. Implementation roadmap

Implement incrementally.

At the beginning of each phase:

1. inspect existing code;
2. explain proposed architecture;
3. list files to add/change;
4. identify risks.

At the end:

1. run tests;
2. explain results;
3. list remaining issues;
4. do NOT silently begin a major next phase.

---

# PHASE 0 — Foundation

Build:

React + TypeScript frontend

Node + Fastify backend

PostgreSQL development database

shared types

environment configuration

health endpoint

basic CI

Docker-based local PostgreSQL if useful

Acceptance:

web starts

server starts

DB connects

shared package compiles

tests run

---

# PHASE 1 — Events and sessions

Build:

host creates event

public join code

QR

guest participant join

session token

session restoration

OPEN / LOCKED / CLOSED

basic physical tables

Acceptance:

host creates event

phone scans QR

joins

reloads

same participant restored

---

# PHASE 2 — Realtime queue

Add:

Socket.IO

READY

PAUSED

LEFT

host realtime dashboard

player reconnect

Acceptance:

multiple browser windows remain consistent

disconnect/reconnect restores correct state

---

# PHASE 3 — Commander pool/deck registration

Player can register available casual decks:

deck name optional

Commander bracket/pool required

one pool can be preferred

others accepted

Example:

Muldrotha — B3 — preferred

Giada — B2 — accepted

Participants with one deck still work naturally.

---

# PHASE 4 — Core matchmaking engine

Build packages/matching.

Initial features:

same-pool pods only

flexible participants may serve multiple eligible pools

preferred pool respected when possible

4-player pods preferred

wait-time fairness

rematch avoidance

table availability

transaction-safe final creation

NO ML.

NO persistent fairness advantage.

---

# PHASE 5 — Flex/Fairness engine

Add:

event-local Flex Credits

actual concessions earn Flex

secondary pool

3-player pod

5-player pod

Flex slightly improves future treatment

wait time always dominates

Flex resets completely at new event

lifetime statistics may be recorded but never used

---

# PHASE 6 — Matching test laboratory

Before trusting matcher, build:

unit tests

property-based tests

seeded random tests

optimality oracle

Monte Carlo simulator

full-event simulations

benchmark report

Commands conceptually:

yarn test:matching

yarn simulate:matching

yarn benchmark:matching

Do not proceed until invariants are strong.

---

# PHASE 7 — Full matchmaking UI

Connect tested engine to backend.

Flow:

READY
↓
matcher
↓
transaction
↓
pod
↓
table
↓
MATCH_FOUND
↓
deck/bracket assignment shown

Build organiser dashboard.

---

# PHASE 8 — Dynamic event lifecycle

Add:

late arrivals

departures

pause

game completion

table release

requeue

3-player pod organiser option

5-player pod organiser option

Run full simulations again.

---

# PHASE 9 — Commander tracker

Build local-first game UI.

Support:

life

Commander damage

poison

Commander tax

Monarch

Initiative

undo

timer

random first player

elimination

winner

tracker optional

Do NOT implement turn tracking.

---

# PHASE 10 — Official Challenge Pack

Implement Challenge framework.

Create starter official pack.

Support:

automatic challenges

confirmation challenges

manual claims

event Challenge Points

Challenge Points NEVER affect matching.

---

# PHASE 11 — Challenge creator

Organiser can:

create pack

copy official pack

edit

create from scratch

keep private

version packs

Use only safe predefined automatic-detection primitives.

No arbitrary JavaScript.

---

# PHASE 12 — Offline robustness

Test:

disconnect READY

disconnect after MATCH_FOUND

refresh during PLAYING

server restart

network unavailable during game

game ends offline

reconnect later

pending result sync

No participant may be duplicated/matched twice.

---

# PHASE 13 — Pilot instrumentation

Prepare for a real event.

Post-event metrics:

participants

games

average wait

95th percentile wait

max wait

rematches

pool assignments

Flex earned

Flex compensation

pod size distribution

table utilisation

game duration

games/player

tracker usage

challenge completion

Optional:

How was your pod?
😞 😐 🙂 😄

---

# PHASE 14 — Community Challenge Packs

Only after real pilot validation.

Add:

PUBLIC

UNLISTED

PRIVATE

publish

discover

copy/fork

report

aggregate usage statistics

admin moderation

---

# PHASE 15 — Commercial entitlements

Only after beta.

Implement generic entitlement system.

Do NOT tightly couple billing provider to product logic.

Entitlements may include:

participantCapacity

customChallengePacks

communityPublishing

advancedStats

eventHistoryRetention

premiumGameModes

branding

multiHost

Do not implement payment provider until pricing is validated.

---

# PHASE 16 — Premium Game Modes

Only after Commander product works.

First candidate:

Treachery

Add as a GameModule.

Validate secret-role architecture.

Do not modify generic queue code unnecessarily.

Then consider other modes based on demand.

---

# PHASE 17 — Production hardening

After real pilots:

deployment hardening

PostgreSQL backups

logging

monitoring

rate limiting

HTTPS

error reporting

host accounts

admin tools

abuse protection

basic moderation tooling

---

# 63. Explicitly OUT OF SCOPE for initial MVP

Do NOT build:

React Native app

Bluetooth networking

WebRTC peer mesh

ML matchmaking

Swiss tournaments

competitive standings

Elo

deck builder

collection manager

card scanner

marketplace

social network

mandatory player accounts

public persistent player profiles

payment system

subscriptions

multi-device synchronised life totals

complex friend graph

advanced team matchmaking

---

# 64. Critical product principles

1. PLAYERS MUST JOIN FAST.

QR → name → decks/brackets → READY.

2. SERVER IS AUTHORITATIVE.

Clients display state.
Server decides matchmaking.

3. GAMEPLAY SURVIVES NETWORK FAILURE.

Coordination is online.
The actual game can continue offline.

4. COMMANDER IS THE FIRST GAME, NOT THE CORE ARCHITECTURE.

Build generic event/matching concepts.
Do not overengineer hypothetical games.

5. FLEXIBILITY SHOULD BE REWARDED FAIRLY.

If a participant helps the queue, the system should return the favour during the SAME EVENT.

6. NO PERSISTENT MATCHMAKING PRIVILEGE.

Every event starts at equal Flex = 0.

7. WAITING TIME MATTERS MORE THAN GAMIFICATION.

Never starve someone because another participant has more Flex.

8. CHALLENGES ARE FUN, NOT MATCHMAKING CURRENCY.

Never mix Challenge Points and Flex.

9. DO NOT TRACK INFORMATION CONTINUOUSLY UNLESS NECESSARY.

Especially turns.

Ask contextual questions only when required.

10. FREE PLAYERS, PAID ORGANISERS.

Players should never need to pay to participate.

11. FREE SMALL EVENTS, PAID SERIOUS CAPACITY.

After beta, capacity is the primary commercial boundary.

12. VALIDATE BEFORE EXPANDING.

One real Commander Night is more valuable than 30 speculative features.

---

# 65. First real-world validation target

The first meaningful test is:

one real game store

20–50 real participants

one full Commander evening

Success means:

- QR joining is understood without explanation;
- organiser stops manually creating pods;
- nobody is double-matched;
- flexible decks improve queue utilisation;
- wait times feel fair;
- rematches are reasonably reduced;
- Flex does not feel exploitable;
- reconnects work;
- game tracker is usable;
- participants voluntarily requeue;
- host wants to use the app again.

The strongest signal is:

> “Can we use this again next week?”

---

# 66. First task for Cursor

DO NOT immediately implement the entire roadmap.

First inspect the repository.

Then report:

1. Current architecture or whether this is greenfield.

2. Proposed repository structure.

3. Proposed PostgreSQL schema.

4. Participant state machine.

5. Event state machine.

6. Physical table model.

7. Session-token design.

8. Socket.IO architecture.

9. Generic MatchmakingPool design.

10. Multi-deck / multi-pool participant model.

11. Pool-assignment strategy for flexible participants.

12. Proposed Flex/Fairness model.

13. Proposed first deterministic matchmaking algorithm.

14. Transactional pod-creation flow.

15. Exact testing strategy.

16. Simulation-harness design.

17. Generic GameMode abstraction.

18. Commander GameModule boundary.

19. Challenge/ChallengePack data model.

20. How future commercial entitlements can be represented WITHOUT implementing billing.

21. Dependencies you want to add and why.

22. Exact files you intend to create/change for Phase 0.

Identify anything in this specification you believe would create unnecessary complexity at the current stage.

Do NOT silently remove requirements.

If you believe something should be postponed, explain why and identify the clean architectural seam that allows it to be postponed safely.

Then STOP.

Wait for approval before implementing Phase 0.
</user_query>