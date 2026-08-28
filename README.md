# PodyGuard

Live matchmaking for casual multiplayer tabletop events (first game: Magic: The Gathering Commander).

## Stack

- **Web:** React, TypeScript, Vite (local)
- **Server:** Node.js, TypeScript, Fastify (local)
- **Database:** remote managed PostgreSQL via `DATABASE_URL` + Drizzle ORM
- **Tooling:** Yarn workspaces

## Architecture (development)

```
React/Vite (localhost)
  → Fastify/Node (localhost)
    → remote managed PostgreSQL (DATABASE_URL)
```

Do **not** run PostgreSQL or Docker for this repository. Database credentials stay in local environment variables and are never committed.

Use **separate** development and production databases.

## Prerequisites

- Node.js 22+
- Yarn 3.8+
- A managed PostgreSQL development database (Neon, Supabase Postgres, Railway, RDS, etc.)

## Quick start

```bash
# Install dependencies
yarn install

# Configure remote DB credentials (never commit this file)
cp apps/server/.env.example apps/server/.env
# Edit apps/server/.env and set DATABASE_URL

# Apply schema migrations to the development database
yarn db:migrate

# Run API (health: http://localhost:3001/health)
yarn dev:server

# Run web app (http://localhost:5173)
yarn dev:web
```

If `DATABASE_URL` is missing, the server exits with a setup message. It will not try to discover or start a local database.

## Deploy a test release

The player-facing site is a static build on **GitHub Pages** (always on). The
API, database, and live updates stay on **Render** (free instances sleep when
idle). Phones open Pages immediately and see a wake message while Render boots.

A scheduled GitHub Action (`Keep API awake`) pings `/health` about every ten
minutes so the free instance stays warm when nobody has the app open. Open
phones also share one keepalive among themselves (localStorage), so a full
table does not multiply the traffic.

Share and print the GitHub Pages URL, not the Render URL. Event links look like
`https://<user>.github.io/PodyGuard/#/e/ABC123`.

### 1. API on Render

The included `render.yaml` is the shortest API path:

1. Create a separate production PostgreSQL database and copy its pooled
   `DATABASE_URL`.
2. In Render, create a **Blueprint** from this repository.
3. Enter `DATABASE_URL` when prompted. Render generates and preserves
   `PARTICIPANT_SESSION_SECRET`.
4. Create a private GitHub repository for in-app feedback. Give a fine-grained
   token access only to that repository with **Issues: Read and write**, then
   enter it as `GITHUB_FEEDBACK_TOKEN` and enter `OWNER/REPOSITORY` as
   `GITHUB_FEEDBACK_REPO`. Add the issue labels `type:bug`, `type:ux`,
   `type:idea`, `type:question`, and `source:in-app` to that repository.
5. Deploy. The start command applies committed migrations before accepting
   traffic (Render reserves its dedicated pre-deploy command for paid services).
6. Open `/health` on the Render URL and confirm `ok` and `database: "up"`.

Render still serves a copy of the web app as a fallback. That copy sleeps with
the API, so it is the wrong link for players.

For any other Node host, use the same commands and environment:

```bash
# Build
corepack enable
yarn install --immutable
yarn build

# Start
NODE_ENV=production yarn db:migrate
NODE_ENV=production yarn workspace @podyguard/server start
```

Required production variables on the API host:

- `DATABASE_URL`: production PostgreSQL connection string.
- `PARTICIPANT_SESSION_SECRET`: a long random value, stable across deploys.
- `GITHUB_FEEDBACK_TOKEN`: server-only fine-grained token for the private
  feedback repository.
- `GITHUB_FEEDBACK_REPO`: private repository in `OWNER/REPOSITORY` form.
- `NODE_ENV=production`.

### 2. Always-on site on GitHub Pages

1. In the GitHub repo: **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables**: add `API_ORIGIN`
   with the Render origin, no trailing slash
   (`https://podyguard.onrender.com`). Optional: `PUBLIC_SITE_URL` if you later
   put the UI on a custom domain.
3. Push to `main`. The Pages workflow builds the web app pointed at that API
   and publishes it.

Until `API_ORIGIN` is set, the Pages workflow fails on purpose so a site is
never published that cannot reach the API.

When Render is on a paid always-on plan, keep this split or serve everything
from Render again. The wake screen only appears when `/api/health` fails.

## Install on a phone

The web app ships a manifest, icons, and a service worker, so a deployed release
installs to a home screen and runs without browser chrome — no URL bar stealing
the short side of a phone, and no tab to lose a match behind.

- **iPhone:** Safari, Share, *Add to Home Screen*.
- **Android:** Chrome, menu, *Install app*.

Both require HTTPS, which GitHub Pages has and a LAN dev address does not, so
install from the Pages URL rather than from `yarn dev`.

While the game tracker is open it asks the browser for landscape and fullscreen.
Chrome grants both; WebKit implements neither the orientation lock nor the
manifest's `orientation`, so an iPhone shows a hint to turn the phone instead.

## Workspace scripts

| Script | Description |
|--------|-------------|
| `yarn typecheck` | Typecheck all packages |
| `yarn test` | Run tests in all packages |
| `yarn test:matching` | Matching engine unit, property, and oracle tests |
| `yarn simulate:matching` | Seeded snapshot + event-loop simulation report |
| `yarn benchmark:matching` | Matcher timing report |
| `yarn simulation:run --scenario NORMAL_FRIDAY_40 --seed 1` | Reproduce one simulated event night |
| `yarn simulation:benchmark --runs 1000` | Benchmark all 23 event-night scenarios and write JSON/CSV artifacts |
| `yarn simulation:sweep --runs 100 --seed-start 1` | Sweep queue-v2 grace periods on one paired scenario/seed grid and write the grace report |
| `yarn simulation:benchmark --runs 1000 --save-baseline queue-v2-alpha` | Same benchmark, then save a compact committed baseline |
| `yarn simulation:compare` | Compare the legacy baseline with the latest compatible artifact (or rerun it) |
| `yarn simulation:compare --baseline legacy-v1 --candidate queue-v2-grace-120s-maxwait-600s` | Side-by-side committed baseline history |
| `yarn simulation:test` | Simulation unit and property tests |
| `yarn simulation:test:heavy` | Simulation matcher baseline and heavier property tests |
| `yarn db:generate` | Generate Drizzle migrations from schema (committed to repo) |
| `yarn db:migrate` | Apply migrations to the database in `DATABASE_URL` |

## Monorepo layout

```
apps/web          Player + organiser UI
apps/server       Fastify API + persistence
packages/shared   Shared types and enums
packages/matching Matchmaking engine + test laboratory
packages/simulation Seeded event-night simulation, benchmarks, and reports
```

Simulation benchmark artifacts are written under the gitignored
`artifacts/simulation/` directory. See
[`packages/simulation/README.md`](packages/simulation/README.md) for metrics,
baseline comparison, and reproducibility details.
