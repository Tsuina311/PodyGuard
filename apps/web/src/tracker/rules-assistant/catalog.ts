import {
  RULE_INDEX_EFFECTIVE_DATE,
  RULE_INDEX_ROWS,
  RULE_INDEX_SOURCE_URL,
} from './generated/rule-index';
import type { IndexedRule } from './types';

/**
 * Wizards of the Coast holds the copyright in the Comprehensive Rules.
 * This index stores identifiers, hierarchy, and short titles only.
 * Rule prose is not bundled. Read it at the official source.
 */
export const OFFICIAL_RULES_URL = RULE_INDEX_SOURCE_URL;
export const RULES_EFFECTIVE_DATE = RULE_INDEX_EFFECTIVE_DATE;

export const INDEXED_RULES: readonly IndexedRule[] = RULE_INDEX_ROWS.map(
  ([id, parentId, heading]) => ({ id, parentId, heading }),
);

export const RULES_BY_ID: ReadonlyMap<string, IndexedRule> = new Map(
  INDEXED_RULES.map((rule) => [rule.id, rule]),
);

export const INDEXED_RULE_COUNT = INDEXED_RULES.length;

export const HEADING_COUNT = INDEXED_RULES.reduce(
  (count, rule) => count + (rule.heading ? 1 : 0),
  0,
);

const children = new Map<string, string[]>();
for (const rule of INDEXED_RULES) {
  if (!rule.parentId) {
    continue;
  }
  const list = children.get(rule.parentId) ?? [];
  list.push(rule.id);
  children.set(rule.parentId, list);
}

export const CHILD_IDS: ReadonlyMap<string, readonly string[]> = children;
