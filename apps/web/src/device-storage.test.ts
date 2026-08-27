import { afterEach, describe, expect, it } from 'vitest';
import { readStored, removeStored, writeStored } from './device-storage';

type FakeStore = Storage & { map: Map<string, string> };

// The node test environment has no web storage, so stand one up by hand.
function fakeStore(options?: { denyWrites?: boolean }): FakeStore {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (options?.denyWrites) {
        throw new Error('QuotaExceededError');
      }
      map.set(key, value);
    },
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  } as FakeStore;
}

function install(kind: 'local' | 'session', value: Storage | undefined): void {
  Object.defineProperty(globalThis, `${kind}Storage`, {
    configurable: true,
    value,
  });
}

afterEach(() => {
  install('local', undefined);
  install('session', undefined);
});

describe('device storage', () => {
  it('keeps values where a closed app can still find them', () => {
    const local = fakeStore();
    const session = fakeStore();
    install('local', local);
    install('session', session);

    writeStored('podyguard.player.ABC123', 'seat-token');

    expect(local.map.get('podyguard.player.ABC123')).toBe('seat-token');
    expect(session.map.size).toBe(0);
    expect(readStored('podyguard.player.ABC123')).toBe('seat-token');
  });

  it('carries a session left over from the old storage forward', () => {
    const local = fakeStore();
    const session = fakeStore();
    session.setItem('podyguard.player.ABC123', 'seat-token');
    install('local', local);
    install('session', session);

    expect(readStored('podyguard.player.ABC123')).toBe('seat-token');
    expect(local.map.get('podyguard.player.ABC123')).toBe('seat-token');
  });

  it('prefers the durable copy over a stale session one', () => {
    const local = fakeStore();
    const session = fakeStore();
    local.setItem('key', 'fresh');
    session.setItem('key', 'stale');
    install('local', local);
    install('session', session);

    expect(readStored('key')).toBe('fresh');
  });

  it('forgets a value in both stores', () => {
    const local = fakeStore();
    const session = fakeStore();
    local.setItem('key', 'a');
    session.setItem('key', 'b');
    install('local', local);
    install('session', session);

    removeStored('key');

    expect(readStored('key')).toBeNull();
    expect(local.map.size).toBe(0);
    expect(session.map.size).toBe(0);
  });

  it('still holds the value for this session when the durable store refuses', () => {
    const session = fakeStore();
    install('local', fakeStore({ denyWrites: true }));
    install('session', session);

    writeStored('key', 'value');

    expect(session.map.get('key')).toBe('value');
    expect(readStored('key')).toBe('value');
  });

  it('is a no-op with no storage at all', () => {
    expect(() => writeStored('key', 'value')).not.toThrow();
    expect(readStored('key')).toBeNull();
    expect(() => removeStored('key')).not.toThrow();
  });
});
