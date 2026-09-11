import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  probeDurableStorage,
  readStored,
  removeStored,
  writeStored,
} from './device-storage';

afterEach(() => {
  vi.unstubAllGlobals();
  removeStored('probe-key');
});

describe('device-storage', () => {
  it('survives localStorage getItem throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    });
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => undefined,
    });

    expect(() => writeStored('probe-key', 'value')).not.toThrow();
    expect(readStored('probe-key')).toBe('value');
    expect(probeDurableStorage()).toBe('unavailable');
  });

  it('survives QuotaExceededError on setItem', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    });
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: (key: string, value: string) => {
        data.set(`s:${key}`, value);
      },
      removeItem: (key: string) => {
        data.delete(`s:${key}`);
      },
    });

    expect(() => writeStored('probe-key', 'saved')).not.toThrow();
    expect(readStored('probe-key')).toBe('saved');
  });
});
