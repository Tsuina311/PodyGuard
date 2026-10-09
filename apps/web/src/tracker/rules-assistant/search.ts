import { CHILD_IDS, OFFICIAL_RULES_URL, RULES_BY_ID } from './catalog';
import { CURATED_BY_ID, CURATED_RULES } from './curated';
import { pickLocalized } from './localize';
import { editDistance, normalizeQuery, stripQuestion } from './normalize';
import { AMBIGUOUS_PHRASES } from './synonyms';
import type {
  CuratedRule,
  IndexedRule,
  RulesSearchHit,
  RulesSearchResult,
} from './types';

const GLUE = new Set([
  'a',
  'an',
  'the',
  'of',
  'to',
  'in',
  'on',
  'for',
  'from',
  'with',
  'and',
  'or',
  'vs',
  'versus',
  'does',
  'do',
  'did',
  'is',
  'are',
  'was',
  'can',
  'could',
  'it',
  'its',
  'my',
  'your',
  'me',
  'please',
  'about',
  'into',
  'than',
  'then',
  'that',
  'this',
  'these',
  'those',
  'interact',
  'interacts',
  'interaction',
  'interactions',
  'together',
  'between',
  'plus',
  'work',
  'works',
  'mean',
  'means',
  'explain',
  'how',
  'what',
  'when',
  'why',
  'who',
  'which',
  'protect',
  'protects',
  'protected',
  'against',
  'during',
  'while',
  'after',
  'before',
  'et',
  'ou',
  'de',
  'des',
  'du',
  'la',
  'le',
  'les',
  'un',
  'une',
  'avec',
  'contre',
  'que',
  'qui',
  'comment',
  'est',
  'sont',
  'fait',
  'font',
  'au',
  'aux',
  'en',
  'sur',
  'par',
  'pour',
  'dans',
  'ne',
  'pas',
  'se',
  'sa',
  'son',
  'ses',
  'ce',
  'cet',
  'cette',
  'les',
]);

const AMBIGUOUS = new Map<string, readonly string[]>(
  AMBIGUOUS_PHRASES.map(([phrase, ids]) => [phrase, ids]),
);

const PHRASES = new Map<string, string>();
const HEADINGS = new Map<string, string[]>();
const FRENCH_MARKERS = new Set<string>();
const ENGLISH_MARKERS = new Set<string>();

for (const rule of CURATED_RULES) {
  const frenchLabel = normalizeQuery(rule.labelFr);
  const englishTitle = normalizeQuery(rule.title);
  if (frenchLabel) {
    FRENCH_MARKERS.add(frenchLabel);
  }
  if (englishTitle) {
    ENGLISH_MARKERS.add(englishTitle);
  }
  for (const keyword of rule.keywords) {
    const key = normalizeQuery(keyword);
    if (!key) {
      continue;
    }
    if (key === frenchLabel) {
      FRENCH_MARKERS.add(key);
    } else {
      ENGLISH_MARKERS.add(key);
    }
  }
  if (rule.interactionOf) {
    continue;
  }
  registerPhrase(englishTitle, rule.id);
  registerPhrase(normalizeQuery(rule.id.replace(/-/g, ' ')), rule.id);
  registerPhrase(frenchLabel, rule.id);
  for (const keyword of rule.keywords) {
    registerPhrase(normalizeQuery(keyword), rule.id);
  }
}

for (const [phrase] of AMBIGUOUS) {
  ENGLISH_MARKERS.add(phrase);
  FRENCH_MARKERS.delete(phrase);
}
for (const rule of CURATED_RULES) {
  FRENCH_MARKERS.delete(normalizeQuery(rule.title));
}

for (const [id, rule] of RULES_BY_ID) {
  if (!rule.heading) {
    continue;
  }
  const key = normalizeQuery(rule.heading);
  const list = HEADINGS.get(key) ?? [];
  list.push(id);
  HEADINGS.set(key, list);
}

const CURATED_BY_NUMBER = new Map<string, CuratedRule>();
for (const rule of CURATED_RULES) {
  if (rule.interactionOf) {
    continue;
  }
  const previous = CURATED_BY_NUMBER.get(rule.officialRuleNumber);
  if (previous && previous.id !== rule.id) {
    throw new Error(
      `Rule ${rule.officialRuleNumber} is claimed by ${previous.id} and ${rule.id}`,
    );
  }
  CURATED_BY_NUMBER.set(rule.officialRuleNumber, rule);
}

function registerPhrase(phrase: string, id: string) {
  if (!phrase || AMBIGUOUS.has(phrase)) {
    return;
  }
  const existing = PHRASES.get(phrase);
  if (existing && existing !== id) {
    throw new Error(`Synonym "${phrase}" points at ${existing} and ${id}`);
  }
  PHRASES.set(phrase, id);
}

function emptyResult(normalizedQuery: string): RulesSearchResult {
  return {
    status: 'none',
    normalizedQuery,
    unverifiedCombination: false,
    primary: null,
    companions: [],
    related: [],
    alternatives: [],
    completion: null,
  };
}

function longestMarker(
  words: string[],
  start: number,
  table: ReadonlySet<string>,
): number {
  const max = Math.min(6, words.length - start);
  for (let length = max; length >= 1; length -= 1) {
    if (table.has(words.slice(start, start + length).join(' '))) {
      return length;
    }
  }
  return 0;
}

/** French questions stay in French even when the rest of the app is not. */
export function answerLocale(raw: string, uiLocale: string): string {
  const ui = uiLocale.toLowerCase().slice(0, 2) || 'en';
  if (ui === 'fr' || queryUsesFrench(raw)) {
    return 'fr';
  }
  const words = stripQuestion(normalizeQuery(raw)).split(' ').filter(Boolean);
  const prefix = words.length > 0 ? prefixAt(words, 0, ui) : null;
  if (prefix?.french && prefix.length === words.length) {
    return 'fr';
  }
  return ui;
}

function queryUsesFrench(raw: string): boolean {
  const query = stripQuestion(normalizeQuery(raw));
  if (!query) {
    return false;
  }
  const words = query.split(' ');
  let french = 0;
  let english = 0;
  let index = 0;
  while (index < words.length) {
    const frenchLength = longestMarker(words, index, FRENCH_MARKERS);
    const englishLength = longestMarker(words, index, ENGLISH_MARKERS);
    if (frenchLength > 0 && frenchLength >= englishLength) {
      french += frenchLength;
      index += frenchLength;
      continue;
    }
    if (englishLength > 0) {
      english += englishLength;
      index += englishLength;
      continue;
    }
    index += 1;
  }
  return french > english;
}

function bump(scores: Map<string, number>, id: string, score: number) {
  scores.set(id, Math.max(scores.get(id) ?? 0, score));
}

function extractRuleNumbers(query: string): string[] {
  const found: string[] = [];
  for (const match of query.matchAll(/\b\d{3}(?:\.\d+)?[a-z]?\b/g)) {
    const id = match[0];
    if (RULES_BY_ID.has(id) && !found.includes(id)) {
      found.push(id);
    }
  }
  if (/^[1-9]$/.test(query) && RULES_BY_ID.has(query)) {
    found.push(query);
  }
  return found;
}

function longestPhrase(
  words: string[],
  start: number,
  table: ReadonlyMap<string, string | readonly string[]>,
): { length: number; value: string | readonly string[] } | null {
  const max = Math.min(6, words.length - start);
  for (let length = max; length >= 1; length -= 1) {
    const phrase = words.slice(start, start + length).join(' ');
    const value = table.get(phrase);
    if (value) {
      return { length, value };
    }
  }
  return null;
}

function fuzzyAt(
  words: string[],
  start: number,
): { ids: string[]; length: number; distance: number } | null {
  const max = Math.min(4, words.length - start);
  for (let length = max; length >= 1; length -= 1) {
    const window = words.slice(start, start + length);
    if (window.every((word) => GLUE.has(word))) {
      continue;
    }
    let bestDistance = 3;
    const ids: string[] = [];
    for (const [phrase, id] of PHRASES) {
      const phraseWords = phrase.split(' ');
      if (phraseWords.length !== length) {
        continue;
      }
      let distance = 0;
      let ok = true;
      for (let index = 0; index < length; index += 1) {
        const left = window[index] ?? '';
        const right = phraseWords[index] ?? '';
        const step = editDistance(left, right);
        const size = Math.max(left.length, right.length);
        const limit = size >= 8 ? 2 : 1;
        if (size < 5 || left[0] !== right[0] || step > limit) {
          ok = false;
          break;
        }
        distance += step;
      }
      if (!ok || distance === 0 || distance > 2) {
        continue;
      }
      if (distance < bestDistance) {
        bestDistance = distance;
        ids.length = 0;
        ids.push(id);
      } else if (distance === bestDistance && !ids.includes(id)) {
        ids.push(id);
      }
    }
    if (ids.length > 0) {
      return { ids, length, distance: bestDistance };
    }
  }
  return null;
}

/**
 * Speech often stops early ("initiat"). A token that is the start of one
 * keyword completes to that keyword; several keywords become suggestions.
 */
function prefixAt(
  words: string[],
  start: number,
  locale: string,
): { ids: string[]; length: number; phrase: string; french: boolean } | null {
  const max = Math.min(4, words.length - start);
  for (let length = max; length >= 1; length -= 1) {
    const window = words.slice(start, start + length);
    if (window.some((word) => word.length < 5) || window.every((word) => GLUE.has(word))) {
      continue;
    }
    const entries: Array<{ ids: string[]; phrase: string; extra: number }> = [];
    const consider = (phrase: string, ids: readonly string[]) => {
      const phraseWords = phrase.split(' ');
      if (phraseWords.length !== length) {
        return;
      }
      let extra = 0;
      let prefixed = false;
      for (let index = 0; index < length; index += 1) {
        const left = window[index] ?? '';
        const right = phraseWords[index] ?? '';
        if (left === right) {
          continue;
        }
        if (
          right.startsWith(left) &&
          right.length - left.length <= 4 &&
          left[0] === right[0]
        ) {
          prefixed = true;
          extra += right.length - left.length;
          continue;
        }
        return;
      }
      if (!prefixed) {
        return;
      }
      entries.push({ ids: [...ids], phrase, extra });
    };
    for (const [phrase, id] of PHRASES) {
      consider(phrase, [id]);
    }
    for (const [phrase, ids] of AMBIGUOUS) {
      consider(phrase, ids);
    }
    if (entries.length === 0) {
      continue;
    }
    entries.sort((left, right) => left.extra - right.extra);
    const extra = entries[0]?.extra ?? 0;
    const closest = entries.filter((entry) => entry.extra === extra);
    const ids = [...new Set(closest.flatMap((entry) => entry.ids))];
    if (ids.length === 0 || ids.length > 4) {
      continue;
    }
    return {
      ids,
      length,
      french: closest.every(
        (entry) =>
          FRENCH_MARKERS.has(entry.phrase) && !ENGLISH_MARKERS.has(entry.phrase),
      ),
      phrase: completionLabel(
        closest.map((entry) => entry.phrase),
        ids,
        locale,
      ),
    };
  }
  return null;
}

function completionLabel(
  phrases: string[],
  ids: string[],
  locale: string,
): string {
  if (ids.length === 1) {
    const rule = CURATED_BY_ID.get(ids[0] ?? '');
    if (rule) {
      return displayTitle(rule, locale);
    }
  }
  const wantFrench = locale.toLowerCase().startsWith('fr');
  const preferred = phrases.find((phrase) =>
    wantFrench ? FRENCH_MARKERS.has(phrase) : ENGLISH_MARKERS.has(phrase),
  );
  return preferred ?? phrases[0] ?? '';
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const extra = new Set(right);
  return left.every((id) => extra.has(id));
}

function displayTitle(rule: CuratedRule, locale: string): string {
  return locale.toLowerCase().startsWith('fr') ? rule.labelFr : rule.title;
}

function hitFromCurated(
  rule: CuratedRule,
  score: number,
  locale: string,
): RulesSearchHit {
  const explanation = pickLocalized(rule.explanation, locale);
  const example = pickLocalized(rule.example, locale);
  return {
    id: rule.id,
    title: displayTitle(rule, locale),
    officialRuleNumber: rule.officialRuleNumber,
    citations: rule.citations ?? [rule.officialRuleNumber],
    officialSourceUrl: OFFICIAL_RULES_URL,
    category: rule.category,
    explanation: explanation.text,
    explanationLocale: explanation.locale,
    explanationFallback: explanation.fallback,
    example: example.text,
    exampleLocale: example.locale,
    exampleFallback: example.fallback,
    curated: true,
    score,
  };
}

function hitFromIndex(
  rule: IndexedRule,
  score: number,
): RulesSearchHit {
  return {
    id: rule.id,
    title: rule.heading ? `${rule.id}. ${rule.heading}` : `Rule ${rule.id}`,
    officialRuleNumber: rule.id,
    citations: [rule.id],
    officialSourceUrl: OFFICIAL_RULES_URL,
    category: null,
    explanation: null,
    explanationLocale: null,
    explanationFallback: false,
    example: null,
    exampleLocale: null,
    exampleFallback: false,
    curated: false,
    score,
  };
}

function resolveHit(
  id: string,
  score: number,
  locale: string,
): RulesSearchHit | null {
  if (id.startsWith('rule:')) {
    const rule = RULES_BY_ID.get(id.slice(5));
    return rule ? hitFromIndex(rule, score) : null;
  }
  const curated = CURATED_BY_ID.get(id);
  if (curated) {
    return hitFromCurated(curated, score, locale);
  }
  const indexed = RULES_BY_ID.get(id);
  return indexed ? hitFromIndex(indexed, score) : null;
}

function relatedHits(
  ids: readonly string[],
  locale: string,
  exclude: Set<string>,
): RulesSearchHit[] {
  const hits: RulesSearchHit[] = [];
  for (const id of ids) {
    if (exclude.has(id)) {
      continue;
    }
    const hit = resolveHit(id, 0, locale);
    if (!hit) {
      continue;
    }
    exclude.add(id);
    hits.push(hit);
  }
  return hits;
}

function indexRelated(ruleId: string): RulesSearchHit[] {
  const hits: RulesSearchHit[] = [];
  const parent = RULES_BY_ID.get(ruleId)?.parentId;
  if (parent) {
    const parentRule = RULES_BY_ID.get(parent);
    if (parentRule?.heading) {
      hits.push(hitFromIndex(parentRule, 0));
    }
  }
  for (const childId of CHILD_IDS.get(ruleId) ?? []) {
    const child = RULES_BY_ID.get(childId);
    if (!child?.heading) {
      continue;
    }
    hits.push(hitFromIndex(child, 0));
    if (hits.length >= 8) {
      break;
    }
  }
  return hits;
}

function ranked(scores: Map<string, number>): Array<{ id: string; score: number }> {
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
}

/**
 * Deterministic local search. It never invents a combined ruling: a pair of
 * mechanics is explained together only when a curated interaction exists.
 */
export function searchRules(raw: string, locale: string): RulesSearchResult {
  const normalizedQuery = stripQuestion(normalizeQuery(raw)).slice(0, 500);
  if (!normalizedQuery) {
    return emptyResult(normalizedQuery);
  }

  const numbers = extractRuleNumbers(normalizedQuery);
  const numberWords = new Set(numbers);
  const words = normalizedQuery.split(' ').filter((word) => !numberWords.has(word));
  const scores = new Map<string, number>();
  const ambiguousGroups: string[][] = [];
  let completedPhrase: string | null = null;

  for (const number of numbers) {
    const curated = CURATED_BY_NUMBER.get(number);
    bump(scores, curated ? curated.id : `rule:${number}`, 200);
  }

  let index = 0;
  while (index < words.length) {
    const exact = longestPhrase(words, index, PHRASES);
    if (exact && typeof exact.value === 'string') {
      bump(scores, exact.value, 100);
      index += exact.length;
      continue;
    }
    const ambiguous = longestPhrase(words, index, AMBIGUOUS);
    if (ambiguous && typeof ambiguous.value !== 'string') {
      ambiguousGroups.push([...ambiguous.value]);
      for (const id of ambiguous.value) {
        bump(scores, id, 70);
      }
      index += ambiguous.length;
      continue;
    }
    const prefix = prefixAt(words, index, locale);
    if (prefix) {
      if (prefix.ids.length > 1) {
        ambiguousGroups.push(prefix.ids);
      }
      for (const id of prefix.ids) {
        bump(scores, id, 85);
      }
      if (index === 0 && numbers.length === 0 && index + prefix.length === words.length) {
        completedPhrase = prefix.phrase;
      }
      index += prefix.length;
      continue;
    }
    const fuzzy = fuzzyAt(words, index);
    if (fuzzy) {
      if (fuzzy.ids.length > 1) {
        ambiguousGroups.push(fuzzy.ids);
      }
      for (const id of fuzzy.ids) {
        bump(scores, id, 80 - fuzzy.distance * 10);
      }
      index += fuzzy.length;
      continue;
    }
    index += 1;
  }

  if (scores.size === 0) {
    const headingIds = HEADINGS.get(normalizedQuery) ?? [];
    if (headingIds.length === 1) {
      const only = headingIds[0];
      if (only) {
        bump(scores, `rule:${only}`, 90);
      }
    } else if (headingIds.length > 1 && headingIds.length <= 4) {
      ambiguousGroups.push(headingIds.map((id) => `rule:${id}`));
      for (const id of headingIds) {
        bump(scores, `rule:${id}`, 70);
      }
    }
  }

  if (scores.size === 0) {
    return emptyResult(normalizedQuery);
  }

  if (ambiguousGroups.length > 0) {
    const alternatives = ranked(scores)
      .map((entry) => resolveHit(entry.id, entry.score, locale))
      .filter((hit): hit is RulesSearchHit => hit !== null);
    return {
      status: 'ambiguous',
      normalizedQuery,
      unverifiedCombination: false,
      primary: null,
      companions: [],
      related: [],
      alternatives,
      completion: completedPhrase,
    };
  }

  const conceptIds = [...scores.keys()].filter((id) => !id.startsWith('rule:'));
  const interaction = CURATED_RULES.find(
    (rule) =>
      rule.interactionOf !== undefined &&
      sameMembers(rule.interactionOf, conceptIds),
  );
  const order = ranked(scores);
  const exclude = new Set<string>();

  if (interaction) {
    const primary = hitFromCurated(interaction, 100, locale);
    exclude.add(primary.id);
    return {
      status: 'match',
      normalizedQuery,
      unverifiedCombination: false,
      primary,
      companions: [],
      related: relatedHits(interaction.related, locale, exclude),
      alternatives: [],
      completion: completedPhrase,
    };
  }

  const top = order[0];
  if (!top) {
    return emptyResult(normalizedQuery);
  }
  const primary = resolveHit(top.id, top.score, locale);
  if (!primary) {
    return emptyResult(normalizedQuery);
  }
  exclude.add(primary.id);
  const companions = order
    .slice(1)
    .map((entry) => resolveHit(entry.id, entry.score, locale))
    .filter((hit): hit is RulesSearchHit => hit !== null);
  for (const companion of companions) {
    exclude.add(companion.id);
  }

  const curated = CURATED_BY_ID.get(primary.id);
  const related = curated
    ? relatedHits(curated.related, locale, exclude)
    : indexRelated(primary.officialRuleNumber).filter((hit) => {
        if (exclude.has(hit.id)) {
          return false;
        }
        exclude.add(hit.id);
        return true;
      });

  return {
    status: 'match',
    normalizedQuery,
    unverifiedCombination: order.length > 1,
    primary,
    companions,
    related,
    alternatives: [],
    completion: completedPhrase,
  };
}

export function curatedRuleCount(): number {
  return CURATED_RULES.length;
}
