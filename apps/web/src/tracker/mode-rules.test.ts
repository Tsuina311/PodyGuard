import { describe, expect, it } from 'vitest';
import { GAME_MODES } from '@podyguard/shared';
import i18n from '../i18n';
import { rulesForMode } from './mode-rules';

describe('mode rules', () => {
  it('covers every implemented game mode', () => {
    const covered = GAME_MODES.map((mode) => rulesForMode(mode, i18n.t));
    expect(covered).toHaveLength(GAME_MODES.length);
  });

  it('gives each mode a title, a summary, and at least one section of bullets', () => {
    for (const mode of GAME_MODES) {
      const rules = rulesForMode(mode, i18n.t);
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
