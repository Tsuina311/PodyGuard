const releaseLabels = new Map([
  ['release:patch', 'patch'],
  ['release:minor', 'minor'],
  ['release:major', 'major'],
]);

const compatibilityPaths = new Set([
  'apps/server/src/db/schema.ts',
  'apps/web/src/active-match.ts',
  'apps/web/src/device-storage.ts',
  'apps/web/src/limited/local-limited.ts',
  'apps/web/src/match-config.ts',
  'apps/web/src/offline-queue.ts',
  'apps/web/src/player-sessions.ts',
  'packages/shared/src/display.ts',
  'packages/shared/src/event-api.ts',
  'packages/shared/src/event-tracker.ts',
  'packages/shared/src/identity.ts',
  'packages/shared/src/table-view.ts',
]);

export function nextVersion(current, bump) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(current);
  if (!match) throw new Error(`VERSION must be X.Y.Z, got "${current}".`);

  const [major, minor, patch] = match.slice(1).map(BigInt);
  switch (bump) {
    case 'patch': return `${major}.${minor}.${patch + 1n}`;
    case 'minor': return `${major}.${minor + 1n}.0`;
    case 'major': return `${major + 1n}.0.0`;
    default: throw new Error(`Unknown version bump "${bump}". Use patch, minor, or major.`);
  }
}

export function releasePlan({ labels, changedPaths, baseVersion, proposedVersion, draft }) {
  const selected = labels.filter(label => releaseLabels.has(label));
  if (selected.length > 1) {
    throw new Error('Choose exactly one release label: release:patch, release:minor, or release:major.');
  }

  const reviewPaths = changedPaths.filter(path =>
    compatibilityPaths.has(path) ||
    (path.startsWith('apps/server/drizzle/') && path.endsWith('.sql')),
  );
  const proposal = [...releaseLabels.values()].find(
    bump => nextVersion(baseVersion, bump) === proposedVersion,
  );
  const bump = releaseLabels.get(selected[0]) ?? proposal ?? 'patch';
  const expectedVersion = nextVersion(baseVersion, bump);
  if (proposedVersion !== expectedVersion) {
    throw new Error(
      `Expected VERSION ${expectedVersion} for a ${bump} bump from ${baseVersion}, got ${proposedVersion}. ` +
      `Run yarn bump:${bump} against the latest main and commit VERSION.`,
    );
  }

  const pendingLabel = selected.length === 0 && (bump !== 'patch' || reviewPaths.length > 0)
    ? `release:${bump}`
    : null;
  if (pendingLabel && !draft) {
    throw new Error([
      `VERSION ${baseVersion} → ${proposedVersion} is valid. Add the ${pendingLabel} label after owner approval, then GitHub will rerun this check.`,
      ...(reviewPaths.length > 0 ? ['Review compatibility for these changes:', ...reviewPaths.map(path => `- ${path}`)] : []),
    ].join('\n'));
  }
  return { bump, pendingLabel };
}
