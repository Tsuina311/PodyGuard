const releaseBumps = ['patch', 'minor', 'major'];

export const releaseTagPrefix = 'podyguard-v';
export const releaseBaseline = '66397c7ff7b51fcb94e3105dbe05171fe60baf15';

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

export function releaseBump(labels) {
  const selected = releaseBumps.filter(bump => labels.includes(`release:${bump}`));
  return { bump: selected.at(-1) ?? 'patch', multiple: selected.length > 1 };
}

export function labelsAtMerge(events) {
  const labels = new Set();
  for (const item of events) {
    if (item.event === 'merged') return [...labels];
    if (item.event === 'labeled') labels.add(item.label.name);
    if (item.event === 'unlabeled') labels.delete(item.label.name);
  }
  return null;
}

export function parseReleaseTags(lines) {
  const versions = new Map();
  for (const line of lines.trim().split('\n')) {
    const [commit, ref] = line.split('\t');
    if (!ref?.startsWith(`refs/tags/${releaseTagPrefix}`)) continue;
    const version = ref.slice(`refs/tags/${releaseTagPrefix}`.length);
    // Also ignore peeled annotated tag lines and tags outside the version format.
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
    if (versions.has(commit) && versions.get(commit) !== version) {
      throw new Error(`Multiple release versions are tagged for ${commit}.`);
    }
    versions.set(commit, version);
  }
  return versions;
}
