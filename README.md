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

The production build is one Node service: Fastify serves the built React app,
the `/api` routes, and Socket.IO from the same origin. This keeps QR links,
requests, and live event updates working without cross-origin configuration.

The included `render.yaml` is the shortest deployment path:

1. Create a separate production PostgreSQL database and copy its pooled
   `DATABASE_URL`.
2. In Render, create a **Blueprint** from this repository.
3. Enter `DATABASE_URL` when prompted. Render generates and preserves
   `PARTICIPANT_SESSION_SECRET`.
4. Deploy. The start command applies committed migrations before accepting
   traffic (Render reserves its dedicated pre-deploy command for paid services).
5. Open `/health` on the public URL and confirm `ok` and `database: "up"`.

Render builds all workspaces and the web assets, then starts the Fastify server.
Direct browser routes fall back to the React app, while unknown API requests
still return JSON 404 responses. Event links use `/#/e/ABC123`.

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

Required production variables:

- `DATABASE_URL`: production PostgreSQL connection string.
- `PARTICIPANT_SESSION_SECRET`: a long random value, stable across deploys.
- `NODE_ENV=production`.

## Install on a phone

The web app ships a manifest, icons, and a service worker, so a deployed release
installs to a home screen and runs without browser chrome — no URL bar stealing
the short side of a phone, and no tab to lose a match behind.

- **iPhone:** Safari, Share, *Add to Home Screen*.
- **Android:** Chrome, menu, *Install app*.

Both require HTTPS, which the deployed URL has and a LAN dev address does not, so
install from the deployed site rather than from `yarn dev`.

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
| `yarn db:generate` | Generate Drizzle migrations from schema (committed to repo) |
| `yarn db:migrate` | Apply migrations to the database in `DATABASE_URL` |

## Monorepo layout

```
apps/web          Player + organiser UI
apps/server       Fastify API + persistence
packages/shared   Shared types and enums
packages/matching Matchmaking engine + test laboratory
```
