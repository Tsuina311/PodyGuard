# Developer checks and demo

Use Node 22 (`.nvmrc` and `.node-version`) and the committed Yarn 3.8.1 release.
Run `corepack enable`, `yarn install --immutable`, then `yarn playwright install chromium`.
On this Windows clone a project-local Node 22 was bootstrapped in `.tools/`; the
hook runner uses it when present. Other machines should install Node 22 normally.

## Commit, push, and reports

Husky installs on `yarn install` through `prepare`.

| Action | Checks |
| --- | --- |
| Commit | All workspace types; shared non-property, matching, server and web tests; existing version bump after checks pass |
| Push | All workspace types and tests (including property/simulation), web build and complete Chromium E2E suite |
| PR / main / nightly | Types, all unit/component tests, production builds, complete browser suite |
| Release | Push checks, full build, dedicated managed-database persistence check |

`yarn check:quick`, `yarn check:push` and `yarn check:release` run checks manually.
The hooks retain terminal output in `reports/quick.log` or `reports/push.log`.
Failures stop the commit/push. Checks inspect the working tree, so stage complete
changes and avoid leaving unrelated broken work in the same checkout.

Run `yarn test:e2e:ui` to step through browser tests, or
`yarn playwright test commander-lobby --headed` after building the web app.
`yarn test:e2e:report` opens the HTML report. Failed tests retain screenshots,
videos, traces and primary-page browser/network diagnostics in `test-results/`.
Traces can contain test data and session tokens; keep the demo/test environment
separate from real accounts. JUnit results live in `reports/e2e.xml`.

CI uploads HTML reports, traces and screenshots for 14 days, including failed
runs. Configure GitHub Actions failure notifications in your GitHub notification
settings. CI retries once; a retry pass is flaky and must be investigated.
The local server is fresh by default. `E2E_REUSE_SERVER=1` deliberately reuses
one when debugging; it can contain previous test state.

## Isolated demo

Run `yarn demo`, open `http://127.0.0.1:4173/demo`, and click **Open demo account**.
The fictional account has Ada, Bea, Cal and Dara, saved Commanders, one game,
one winner and three losses. Browser tests use this same isolated fixture.
The demo server always uses memory, replaces inherited database credentials
with an unused placeholder, binds to loopback, and resets on restart. Neither
the demo login nor the known local admin credential exists in production.

## Read-only admin console

Set `ADMIN_ACCESS_TOKEN` on the API server to a securely generated value of at
least 32 characters. Never put it in a Vite variable, URL, or source control.
Open the normal site at `/#/admin` (Pages: `/PodyGuard/#/admin`) and enter it.
The screen lists playgroups across owners and shows saved commanders, player
win/loss/draw totals, previous opponents and recent recorded game results.
Use **Refresh playgroups** for a fresh snapshot, then select a group.
The credential stays in page memory and is cleared by **Lock administration**
or page reload. This is a single operator credential, not account-based roles.
Admin endpoints reject normal account/participant credentials and send no-store
responses. No admin mutations are provided.

For local demo admin, use `local-demo-admin-token-not-for-production`.

Production account login requires `RESEND_API_KEY` and `AUTH_EMAIL_FROM` on the
API server. Verify the sender domain with Resend first. Without delivery
configuration, sign-in returns a clear unavailable error; it never reveals a
verification code. Development/demo retains on-screen codes. The unverified
Neon subject compatibility endpoint is development-only.
See https://resend.com/docs/api-reference/emails/send-email for sender/API setup.

## Database verification

Provision a separate managed test database and apply the committed migrations
to that database before running `yarn test:persistence`. Set `TEST_DATABASE_URL`
to its connection string; the command refuses a missing URL or the same value
as `DATABASE_URL`. It creates a uniquely named fictional account, checks data
after reconnecting, and removes only that account's fixture data in `finally`.
This is an explicit release check; a memory-only browser pass does not prove
PostgreSQL persistence. No production data is used for automated tests.

## Deployment

Pages now depends on the reusable CI workflow: checks must succeed before the
frontend is published. The Render blueprint already sets
`autoDeployTrigger: checksPass`; verify the live Render service follows that
setting because repository YAML cannot prove dashboard configuration.
Task branches do not publish Pages. Review and merge the PR to release.

## Browser coverage

- Commander: four-player joining, bracket changes, readiness, matching, starting,
  tracker life changes, undo, refresh recovery, result recording and playgroup
  history; failed deck-save protection and empty-queue feedback.
- Playgroups: independent returning browser sessions and saved commanders,
  results/opponents checked against API; admin access, data display and locking.
- Limited: Booster Draft (8), Pick-Two Draft (4), Sealed (4), real UI joining,
  readiness, seating, phases, results, standings and table release.
- Existing quick play, setup transfer, invite links and constructed/Limited
  screen regressions remain covered.

These checks do not replace real-phone testing of Safari, QR scanning, screen
locking, intermittent mobile connectivity or the actual deployed frontend/API.
