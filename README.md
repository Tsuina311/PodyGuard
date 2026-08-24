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
