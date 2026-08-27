import type { TFunction } from 'i18next';
import type { GameMode, RulesFormat } from '@podyguard/shared';
import { resolveRulesFormat } from '@podyguard/shared';
import {
  ARCHENEMY_STARTING_LIFE,
  COMMANDER_DAMAGE_LIMIT,
  NORMAL_ARCHENEMY_STARTING_LIFE,
  NORMAL_STARTING_LIFE,
  NORMAL_TWO_HEADED_GIANT_STARTING_LIFE,
  POISON_LIMIT,
  STARTING_LIFE,
  TWO_HEADED_GIANT_POISON_LIMIT,
  TWO_HEADED_GIANT_STARTING_LIFE,
  sharedTeamPoisonLimit,
} from './engine';

export type ModeRules = {
  title: string;
  summary: string;
  sections: Array<{ heading: string; bullets: string[] }>;
};

const MODE_SECTION_KEYS: Record<
  GameMode,
  { commander: string[]; normal?: string[] }
> = {
  duel: { commander: ['life', 'turns'] },
  multiplayer: { commander: ['life', 'turns'] },
  commander: { commander: ['life', 'turns', 'commanders'] },
  treachery: {
    commander: ['commander', 'identities'],
    normal: ['life', 'identities'],
  },
  'two-headed-giant': { commander: ['teams', 'life', 'turns'], normal: ['teams', 'life', 'turns'] },
  'archenemy-commander': {
    commander: ['sides', 'schemes', 'life'],
    normal: ['sides', 'schemes', 'life'],
  },
  emperor: { commander: ['teams', 'range', 'deploy', 'winning'], normal: ['teams', 'range', 'deploy', 'winning'] },
  star: { commander: ['positions', 'combat', 'winning'], normal: ['positions', 'combat', 'winning'] },
  assassin: {
    commander: ['contracts', 'elimination', 'winning'],
    normal: ['contracts', 'elimination', 'winning'],
  },
};

function modePrefix(gameMode: GameMode, format: RulesFormat): string {
  if (format === 'normal' && MODE_SECTION_KEYS[gameMode].normal) {
    return `modes.${gameMode}.normal`;
  }
  return `modes.${gameMode}`;
}

function interpolationForMode(gameMode: GameMode, format: RulesFormat) {
  const resolved = resolveRulesFormat(gameMode, format);
  const shared = {
    poison: POISON_LIMIT,
    commanderDamage: COMMANDER_DAMAGE_LIMIT,
    sharedLife:
      resolved === 'normal'
        ? NORMAL_TWO_HEADED_GIANT_STARTING_LIFE
        : TWO_HEADED_GIANT_STARTING_LIFE,
    sharedPoison:
      resolved === 'normal'
        ? sharedTeamPoisonLimit('normal')
        : TWO_HEADED_GIANT_POISON_LIMIT,
  };
  switch (gameMode) {
    case 'duel':
    case 'multiplayer':
      return { ...shared, life: NORMAL_STARTING_LIFE };
    case 'archenemy-commander':
      return {
        ...shared,
        life:
          resolved === 'normal'
            ? NORMAL_ARCHENEMY_STARTING_LIFE
            : ARCHENEMY_STARTING_LIFE,
      };
    default:
      return {
        ...shared,
        life: resolved === 'normal' ? NORMAL_STARTING_LIFE : STARTING_LIFE,
      };
  }
}

function sectionBullets(
  t: TFunction,
  gameMode: GameMode,
  format: RulesFormat,
  sectionKey: string,
): string[] {
  const prefix = modePrefix(gameMode, format);
  const raw = t(`${prefix}.sections.${sectionKey}.bullets`, {
    returnObjects: true,
    ...interpolationForMode(gameMode, format),
  });
  return Array.isArray(raw) ? raw.map(String) : [String(raw)];
}

function sectionKeys(gameMode: GameMode, format: RulesFormat): string[] {
  const keys = MODE_SECTION_KEYS[gameMode];
  if (format === 'normal' && keys.normal) {
    return keys.normal;
  }
  return keys.commander;
}

export function rulesForMode(
  gameMode: GameMode,
  t: TFunction,
  format?: RulesFormat | null,
): ModeRules {
  const resolved = resolveRulesFormat(gameMode, format);
  const prefix = modePrefix(gameMode, resolved);
  return {
    title: t(`modes.${gameMode}.title`),
    summary: t(`${prefix}.summary`),
    sections: sectionKeys(gameMode, resolved).map((sectionKey) => ({
      heading: t(`${prefix}.sections.${sectionKey}.heading`),
      bullets: sectionBullets(t, gameMode, resolved, sectionKey),
    })),
  };
}
