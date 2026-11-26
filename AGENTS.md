## Standing authorization

These permissions apply to all PodyGuard work, including future Codex sessions in Cursor and Cloud.

- The owner preauthorizes writing and running commands needed for the requested work, including builds, type checks, unit/integration tests, and Playwright. Do not ask for separate permission to run them.
- The owner preauthorizes Git operations needed to prepare, implement, and publish work on task branches: inspect, fetch, pull, create/switch task branches, resolve conflicts while preserving unrelated work, stage, commit, and push task branches. Do not ask for per-command confirmation. Opening or updating the task's PR is also authorized.
- For local commands and Git work, ask permission only before installing software, tools, or dependencies on the machine, or before an operation that would modify the project's main/default branch. Fetching and pulling are permitted, including for main. Keep implementation and commits on task branches; do not infer permission to change main from a general task request.
- These instructions do not override security controls imposed by the Codex app or execution environment. If that environment requires an approval prompt, explain that it is an environment requirement rather than requesting the same project authorization again.
- Run preauthorized test and task-branch Git commands normally; do not proactively request elevated execution. If the environment actually blocks a necessary command, follow the tool's required escalation process and identify the specific restriction.

## Review workflow

These standing instructions apply repository-wide to Codex in Cursor and Cloud.

- The owner authorizes task branches, commits, pushes to task branches, pulls, and fetches for requested changes. Use the same task branch for the current batch of fixes. Never push to main or the remote default branch, merge a PR, or enable auto-merge. The owner reviews and merges changes before they reach production.
- Run relevant builds and tests, including Playwright, as part of the authorized work without asking for separate confirmation.
- Discuss substantial product choices such as authentication, hosting, and external providers before implementing them. Prefer free alternatives; do not spend money, enable billing, or add paid commitments without explicit approval.

## Release versions

- Pick one bump per PR and describe the player impact in the PR body. Patch is the default for fixes, polish, reliability, and internal changes. Propose minor for a backward-compatible capability or major when existing clients, sessions, or saved data require a change or migration.
- The owner confirms minor and major bumps with the corresponding release label. Explain compatibility in the PR when changes touch API contracts, saved data, or the database schema.
- The release workflow assigns the next version after the owner squash-merges into `main`. The release tag identifies the squash commit and supplies the version to both deployments. Leave the baseline `VERSION` file alone.

## Git preparation

- Before implementation, inspect the working tree, identify the user's intended branch and the remote default branch, and fetch the latest state from origin. Start from the latest remote state of the intended branch when safe; use a task branch for new work. If no branch is specified and no existing task branch is intended, start a new task branch from the latest remote default branch.
- Preserve all unrelated local changes, staged changes, and local commits. Do not discard, overwrite, or include them in the task commit. Use an isolated worktree when needed. If synchronizing or proceeding safely is blocked by conflicts or ambiguous branch intent, report the blocker and request only the clarification needed to proceed.
## GitHub handoff

- At completion, run checks relevant to the change and inspect the final diff. When authorized to commit and push, stage only task changes, commit them, and push the task branch to origin using only the existing GitHub integration and authorized credentials. Do not obtain replacement credentials or bypass access controls.
- Update the existing PR for the task branch, or open a draft PR against the repository's default branch when supported. Include a clear description of the change and validation results. Verify the remote branch or PR after pushing and report its URL.
- Never push to the default branch, force-push, merge a PR, or enable auto-merge. The owner reviews and merges manually.
- In the final handoff, report the branch, commit SHA, PR link (or remote branch URL if PR creation is unsupported or blocked), and checks with their outcomes. Explicitly report any permission, conflict, or push blocker, including any incomplete handoff steps; do not claim success for an unverified push or PR.
