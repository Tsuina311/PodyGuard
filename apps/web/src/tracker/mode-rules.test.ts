import { describe, expect, it } from 'vitest';
import { GAME_MODES } from '@podyguard/shared';
import { MODE_RULES, rulesForMode } from './mode-rules';

describe('mode rules', () => {
  it('covers every implemented game mode', () => {
    expect(Object.keys(MODE_RULES).sort()).toEqual([...GAME_MODES].sort());
  });

  it('gives each mode a title, a summary, and at least one section of bullets', () => {
    for (const mode of GAME_MODES) {
      const rules = rulesForMode(mode);
      expect(rules.title.length).toBeGreaterThan(0);
      expect(rules.summary.length).toBeGreaterThan(0);
      expect(rules.sections.length).toBeGreaterThan(0);
      for (const section of rules.sections) {
        expect(section.heading.length).toBeGreaterThan(0);
        expect(section.bullets.length).toBeGreaterThan(0);
      }
    }
  });
});
