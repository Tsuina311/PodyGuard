/*
  Everything that says "which player am I" or "which game am I in" has to
  outlive the app being closed. A guest has no account to sign back in with, so
  a seat token that died with the tab meant a swiped-away app cost the player
  their seat — the host kept seeing them at the table while they could only
  rejoin as somebody new.

  localStorage is the only store that survives that, and sessionStorage is still
  read once so a session that was open across the upgrade carries over instead
  of being dropped. Private-mode Safari denies both, and tests run without a DOM,
  so every access is guarded and the whole module degrades to an in-memory map
  rather than taking the page down with it.
*/

const memory = new Map<string, string>();

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
  if (legacy !== null) {
    return legacy;
  }
  return memory.get(key) ?? null;
}

export function writeStored(key: string, value: string): void {
  const durable = store('local');
  try {
    if (durable) {
      durable.setItem(key, value);
      memory.set(key, value);
      return;
    }
  } catch {
    // Quota or a denied store: fall through.
  }
  try {
    const session = store('session');
    if (session) {
      session.setItem(key, value);
      memory.set(key, value);
      return;
    }
  } catch {
    // Nothing durable left; keep the value for this tab.
  }
  memory.set(key, value);
}

export function removeStored(key: string): void {
  memory.delete(key);
  for (const kind of ['local', 'session'] as const) {
    try {
      store(kind)?.removeItem(key);
    } catch {
      // Ignore: a store we cannot delete from is a store we never wrote to.
    }
  }
}

/** True when durable localStorage accepts a round-trip write. */
export function probeDurableStorage(): 'ok' | 'unavailable' {
  const probeKey = '__podyguard_storage_probe__';
  try {
    const durable = store('local');
    if (!durable) {
      return 'unavailable';
    }
    durable.setItem(probeKey, '1');
    durable.removeItem(probeKey);
    return 'ok';
  } catch {
    return 'unavailable';
  }
}
