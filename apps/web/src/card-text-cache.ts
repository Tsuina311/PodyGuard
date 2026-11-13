import { parseCardText, type CardText } from '@podyguard/shared';
import { searchCardText } from './api';
import { readStored, writeStored } from './device-storage';

export const CARD_TEXT_CACHE_KEY = 'podyguard.card-text.v1';
const MAX_AGE = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 40;
type Entry = { query: string; savedAt: number; cards: CardText[] };

function queryKey(query: string) {
  return query.normalize('NFKC').trim().toLowerCase();
}

/** Called at startup: reject corrupt/expired data and discard non-text fields. */
export function verifyCardTextCache(now = Date.now()): Entry[] {
  let stored: unknown;
  try {
    const raw = readStored(CARD_TEXT_CACHE_KEY);
    stored = raw && raw.length <= 2_000_000 ? JSON.parse(raw) : null;
  } catch { stored = null; }
  const entries: Entry[] = [];
  if (Array.isArray(stored)) {
    for (const value of stored.slice(-MAX_ENTRIES)) {
      if (!value || typeof value !== 'object') continue;
      const entry = value as Record<string, unknown>;
      if (typeof entry.query !== 'string' || !entry.query.trim() || entry.query.length > 200 ||
          typeof entry.savedAt !== 'number' || !Number.isFinite(entry.savedAt) ||
          entry.savedAt > now || now - entry.savedAt >= MAX_AGE ||
          !Array.isArray(entry.cards) || !entry.cards.length || entry.cards.length > 20) continue;
      const cards = entry.cards.map(parseCardText);
      if (cards.some(card => !card)) continue;
      entries.push({ query: queryKey(entry.query), savedAt: entry.savedAt, cards: cards as CardText[] });
    }
  }
  writeStored(CARD_TEXT_CACHE_KEY, JSON.stringify(entries));
  return entries;
}

export async function lookupCardText(query: string): Promise<CardText[]> {
  const key = queryKey(query);
  const entries = verifyCardTextCache();
  const cached = entries.find(entry => entry.query === key);
  if (cached) return cached.cards;
  const response = await searchCardText(query.trim());
  const cards = response.cards.map(parseCardText);
  if (cards.some(card => !card)) throw new Error('Invalid card text response');
  const valid = cards as CardText[];
  // Don't persist misses: a newly released/translated card may appear later.
  if (valid.length) {
    // Re-read after the request so overlapping searches don't overwrite each other.
    const latest = verifyCardTextCache().filter(entry => entry.query !== key);
    writeStored(CARD_TEXT_CACHE_KEY, JSON.stringify([
      ...latest, { query: key, savedAt: Date.now(), cards: valid },
    ].slice(-MAX_ENTRIES)));
  }
  return valid;
}
