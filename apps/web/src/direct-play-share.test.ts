import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyDirectPlayPayload,
  decodeDirectPlayPayload,
  encodeDirectPlayPayload,
} from './direct-play-share';
import { defaultMatchConfig, loadMatchConfig } from './match-config';
import type { CommanderSelection } from './scryfall';

function installStorage(name: 'localStorage' | 'sessionStorage'): void {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
  });
}

const atraXa: CommanderSelection = {
  oracleId: 'oracle-atraxa',
  cardId: 'card-atraxa',
  name: 'Atraxa, Praetors\' Voice',
  artCropUri: 'https://example.com/art.jpg',
  typeLine: 'Legendary Creature — Phyrexian Angel Horror',
  oracleText: 'Flying, vigilance, deathtouch, lifelink',
  keywords: ['Flying', 'Vigilance', 'Deathtouch', 'Lifelink'],
};

describe('direct play share payload', () => {
  beforeEach(() => {
    installStorage('localStorage');
    installStorage('sessionStorage');
  });

  it('round-trips seat names and commanders without art', () => {
    const config = {
      ...defaultMatchConfig(),
      gameMode: 'commander' as const,
      rulesFormat: 'commander' as const,
      seatCount: 4,
      names: ['Alex', 'Blake', 'Casey', 'Drew', 'Extra', 'Extra', 'Extra', 'Extra'],
      commanders: [[atraXa], [], [], [], [], [], [], []],
    };
    const token = encodeDirectPlayPayload(config);
    const decoded = decodeDirectPlayPayload(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.gameMode).toBe('commander');
    expect(decoded?.seatCount).toBe(4);
    expect(decoded?.names.slice(0, 4)).toEqual([
      'Alex',
      'Blake',
      'Casey',
      'Drew',
    ]);
    expect(decoded?.commanders[0]?.[0]?.name).toBe(atraXa.name);
    expect(decoded?.commanders[0]?.[0]?.artCropUri).toBe('');
    expect(decoded?.commanders[0]?.[0]?.keywords).toContain('Flying');
  });

  it('rejects garbage tokens', () => {
    expect(decodeDirectPlayPayload('')).toBeNull();
    expect(decodeDirectPlayPayload('not-valid')).toBeNull();
  });

  it('applies into local match config for the tracker route', () => {
    const token = encodeDirectPlayPayload({
      ...defaultMatchConfig(),
      names: ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'],
      seatCount: 3,
      gameMode: 'multiplayer',
      rulesFormat: 'normal',
    });
    const applied = applyDirectPlayPayload(token);
    expect(applied?.seatCount).toBe(3);
    expect(loadMatchConfig().names[0]).toBe('One');
    expect(loadMatchConfig().gameMode).toBe('multiplayer');
  });
});
