import { describe, expect, it } from 'vitest';
import {
  HEADING_COUNT,
  INDEXED_RULE_COUNT,
  INDEXED_RULES,
  RULES_BY_ID,
  RULES_EFFECTIVE_DATE,
} from './catalog';
import { CURATED_RULES } from './curated';
import { searchRules } from './search';

describe('rules search', () => {
  it('recognizes an exact keyword', () => {
    const result = searchRules('double strike', 'en');
    expect(result.status).toBe('match');
    expect(result.primary?.id).toBe('double-strike');
    expect(result.primary?.officialRuleNumber).toBe('702.4');
    expect(result.primary?.curated).toBe(true);
  });

  it('maps multilingual synonyms onto the same rule', () => {
    expect(searchRules('double initiative', 'fr').primary?.id).toBe(
      'double-strike',
    );
    expect(searchRules('Piétinement', 'fr').primary?.id).toBe('trample');
    expect(searchRules('contact mortel', 'en').primary?.id).toBe('deathtouch');
    expect(searchRules('lien de vie', 'fr').primary?.id).toBe('lifelink');
  });

  it('folds case and accents', () => {
    expect(searchRules('TrAmPle', 'en').primary?.id).toBe('trample');
    expect(searchRules('PIETINEMENT', 'en').primary?.id).toBe('trample');
  });

  it('removes question phrasing', () => {
    expect(searchRules('What does double strike do?', 'en').primary?.id).toBe(
      'double-strike',
    );
    expect(searchRules('Explain trample', 'en').primary?.id).toBe('trample');
    expect(searchRules("Qu'est-ce que le piétinement ?", 'fr').primary?.id).toBe(
      'trample',
    );
  });

  it('looks up a rule number', () => {
    const result = searchRules('702.4', 'en');
    expect(result.primary?.id).toBe('double-strike');
    expect(searchRules('rule 903.8', 'en').primary?.id).toBe('commander-tax');
  });

  it('corrects common transcription mistakes', () => {
    expect(searchRules('trampl', 'en').primary?.id).toBe('trample');
    expect(searchRules('hexprof', 'en').primary?.id).toBe('hexproof');
    expect(searchRules('dubble strike', 'en').primary?.id).toBe('double-strike');
  });

  it('does not guess an ambiguous word', () => {
    const strike = searchRules('strike', 'en');
    expect(strike.status).toBe('ambiguous');
    expect(strike.primary).toBeNull();
    expect(strike.alternatives.map((hit) => hit.id).sort()).toEqual([
      'double-strike',
      'first-strike',
    ]);

    const initiative = searchRules('initiative', 'fr');
    expect(initiative.status).toBe('ambiguous');
    expect(initiative.alternatives.map((hit) => hit.id).sort()).toEqual([
      'first-strike',
      'the-initiative',
    ]);
  });

  it('says when nothing reliable matches', () => {
    expect(searchRules('splorch', 'en').status).toBe('none');
    expect(searchRules('flample', 'en').status).toBe('none');
  });

  it('uses a checked interaction and otherwise refuses to combine rules', () => {
    const paired = searchRules(
      'How does deathtouch interact with trample?',
      'en',
    );
    expect(paired.status).toBe('match');
    expect(paired.primary?.id).toBe('deathtouch-trample');
    expect(paired.unverifiedCombination).toBe(false);
    expect(paired.related.map((hit) => hit.id)).toEqual(
      expect.arrayContaining(['deathtouch', 'trample']),
    );

    const separate = searchRules('flying and haste', 'en');
    expect(separate.unverifiedCombination).toBe(true);
    expect(
      [separate.primary?.id, ...separate.companions.map((hit) => hit.id)].sort(),
    ).toEqual(['flying', 'haste']);
  });

  it('answers hexproof without inventing a board-wipe rule', () => {
    const result = searchRules('Does hexproof protect from board wipes?', 'en');
    expect(result.primary?.id).toBe('hexproof');
    expect(result.unverifiedCombination).toBe(false);
    expect(result.primary?.explanation ?? '').toMatch(/board wipe/i);
  });

  it('accepts English keywords while the interface is French', () => {
    const result = searchRules('hexproof', 'fr');
    expect(result.primary?.id).toBe('hexproof');
    expect(result.primary?.explanationFallback).toBe(false);
    expect(result.primary?.title).toBe('Défense talismanique');
  });

  it('shows the English note when a translation is missing', () => {
    const result = searchRules('flying', 'de');
    expect(result.primary?.explanationFallback).toBe(true);
    expect(result.primary?.explanationLocale).toBe('en');
    expect(result.primary?.explanation).toMatch(/flying or reach/i);
  });

  it('does not invent an explanation for an uncurated subrule', () => {
    const result = searchRules('702.4a', 'en');
    expect(result.primary?.curated).toBe(false);
    expect(result.primary?.explanation).toBeNull();
    expect(result.primary?.officialRuleNumber).toBe('702.4a');
    expect(result.related.map((hit) => hit.officialRuleNumber)).toContain(
      '702.4',
    );
  });

  it('keeps multiplayer, casual, and untitled keyword headings searchable', () => {
    expect(RULES_BY_ID.has('800')).toBe(true);
    expect(RULES_BY_ID.has('811')).toBe(true);
    expect(RULES_BY_ID.has('900')).toBe(true);
    expect(RULES_BY_ID.has('905')).toBe(true);
    expect(searchRules('800', 'en').primary?.officialRuleNumber).toBe('800');
    expect(searchRules('903', 'en').primary?.id).toBe('commander');
    const storm = searchRules('storm', 'en');
    expect(storm.primary?.officialRuleNumber).toBe('702.40');
    expect(storm.primary?.curated).toBe(false);
    expect(storm.primary?.explanation).toBeNull();
  });

  it('returns related rules for navigation', () => {
    const result = searchRules('double strike', 'en');
    expect(result.related.map((hit) => hit.id)).toContain('first-strike');
  });

  it('checks curated numbers against the indexed Comprehensive Rules', () => {
    expect(RULES_EFFECTIVE_DATE).toBe('September 25, 2026');
    expect(INDEXED_RULE_COUNT).toBeGreaterThan(3000);
    expect(HEADING_COUNT).toBeGreaterThan(300);
    for (const rule of INDEXED_RULES) {
      if (!rule.heading) {
        continue;
      }
      expect(rule.heading.length).toBeLessThanOrEqual(64);
      expect(rule.heading).not.toMatch(/[“”:.]/);
      expect(rule.heading.startsWith('A ') || rule.heading.startsWith('An ')).toBe(
        false,
      );
    }
    for (const rule of CURATED_RULES) {
      for (const number of rule.citations ?? [rule.officialRuleNumber]) {
        expect(RULES_BY_ID.has(number), number).toBe(true);
      }
      for (const related of rule.related) {
        expect(CURATED_RULES.some((entry) => entry.id === related)).toBe(true);
      }
      expect(rule.explanation.en).not.toBe(rule.example.en);
      expect(rule.explanation.fr?.length).toBeGreaterThan(20);
    }
  });
});
