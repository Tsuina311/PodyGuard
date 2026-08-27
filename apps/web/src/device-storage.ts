/*
  Everything that says "which player am I" or "which game am I in" has to
  outlive the app being closed. A guest has no account to sign back in with, so
  a seat token that died with the tab meant a swiped-away app cost the player
  their seat — the host kept seeing them at the table while they could only
  rejoin as somebody new.

  localStorage is the only store that survives that, and sessionStorage is still
  read once so a session that was open across the upgrade carries over instead
  of being dropped. Private-mode Safari denies both, and tests run without a DOM,
  so every access is guarded and the whole module degrades to a no-op rather than
  taking the page down with it.
*/

function store(kind: 'local' | 'session'): Storage | null {
  try {
    const candidate =
      kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    return candidate ?? null;
  } catch {
    return null;
  }
}

function read(from: Storage | null, key: string): string | null {
  try {
    return from?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function readStored(key: string): string | null {
  const durable = store('local');
  const value = read(durable, key);
  if (value !== null) {
    return value;
  }
  const legacy = read(store('session'), key);
  if (legacy !== null && durable) {
    try {
      durable.setItem(key, legacy);
    } catch {
      // Reading is what was asked for; an upgrade that cannot be saved is fine.
    }
  }
  return legacy;
}

export function writeStored(key: string, value: string): void {
  const durable = store('local');
  try {
    if (durable) {
      durable.setItem(key, value);
      return;
    }
  } catch {
    // Quota or a denied store: fall through and keep the value for this
    // session at least, which is what the app had before.
  }
  try {
    store('session')?.setItem(key, value);
  } catch {
    // Nothing left to write to; callers treat storage as best effort.
  }
}

export function removeStored(key: string): void {
  for (const kind of ['local', 'session'] as const) {
    try {
      store(kind)?.removeItem(key);
    } catch {
      // Ignore: a store we cannot delete from is a store we never wrote to.
    }
  }
}
