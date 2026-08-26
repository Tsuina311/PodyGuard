import {
  TREACHERY_ROLE_INFO,
  type GameMode,
} from '@podyguard/shared';
import {
  ARCHENEMY_STARTING_LIFE,
  COMMANDER_DAMAGE_LIMIT,
  POISON_LIMIT,
  STARTING_LIFE,
  TWO_HEADED_GIANT_POISON_LIMIT,
  TWO_HEADED_GIANT_STARTING_LIFE,
} from './engine';

export type ModeRules = {
  title: string;
  summary: string;
  sections: Array<{ heading: string; bullets: string[] }>;
};

const commanderCombat = `A player loses after taking ${String(COMMANDER_DAMAGE_LIMIT)} combat damage from one commander.`;
const commanderTax =
  'Each time a commander is recast from the command zone, it costs 2 more mana.';

export const MODE_RULES: Record<GameMode, ModeRules> = {
  commander: {
    title: 'Commander',
    summary: 'Free-for-all multiplayer. Each player fights for themselves.',
    sections: [
      {
        heading: 'Life and loss',
        bullets: [
          `Each player starts at ${String(STARTING_LIFE)} life.`,
          'A player loses at 0 life.',
          `A player loses at ${String(POISON_LIMIT)} poison counters.`,
          commanderCombat,
        ],
      },
      {
        heading: 'Turns',
        bullets: [
          'The starting player is drawn at random.',
          'That player skips the draw step on their first turn.',
        ],
      },
      {
        heading: 'Commanders',
        bullets: [
          'Commanders begin in the command zone and may be recast from there.',
          commanderTax,
        ],
      },
    ],
  },
  treachery: {
    title: 'Treachery',
    summary:
      'Commander with secret identities. The Leader is public; everyone else stays hidden.',
    sections: [
      {
        heading: 'Commander rules still apply',
        bullets: [
          `Each player starts at ${String(STARTING_LIFE)} life.`,
          `A player loses at 0 life, ${String(POISON_LIMIT)} poison, or ${String(COMMANDER_DAMAGE_LIMIT)} combat damage from one commander.`,
          'The Leader takes the first turn and skips that draw step.',
          commanderTax,
        ],
      },
      {
        heading: 'Identities',
        bullets: [
          'Open Check my role from the timer menu. Only you see that card.',
          `${TREACHERY_ROLE_INFO.leader.name}: ${TREACHERY_ROLE_INFO.leader.objective} ${TREACHERY_ROLE_INFO.leader.guidance}`,
          `${TREACHERY_ROLE_INFO.guardian.name}: ${TREACHERY_ROLE_INFO.guardian.objective} ${TREACHERY_ROLE_INFO.guardian.guidance}`,
          `${TREACHERY_ROLE_INFO.assassin.name}: ${TREACHERY_ROLE_INFO.assassin.objective} ${TREACHERY_ROLE_INFO.assassin.guidance}`,
          `${TREACHERY_ROLE_INFO.traitor.name}: ${TREACHERY_ROLE_INFO.traitor.objective} ${TREACHERY_ROLE_INFO.traitor.guidance}`,
          'Follow any extra abilities printed on your identity card.',
        ],
      },
    ],
  },
  'two-headed-giant': {
    title: 'Two-Headed Giant',
    summary: 'Two teams of two. Teammates share a life total and a turn.',
    sections: [
      {
        heading: 'Teams',
        bullets: [
          'Pick two allies, or let the table randomise the pairs.',
          `Each team starts at ${String(TWO_HEADED_GIANT_STARTING_LIFE)} shared life.`,
          'Teammates take their turn together. Each player still has their own hand, library, and commanders.',
        ],
      },
      {
        heading: 'Life and loss',
        bullets: [
          'A team loses when its shared life reaches 0.',
          `A team loses at ${String(TWO_HEADED_GIANT_POISON_LIMIT)} shared poison counters.`,
          commanderCombat,
        ],
      },
      {
        heading: 'Turns',
        bullets: [
          'The starting team is drawn at random and skips the draw step on its first turn.',
          commanderTax,
        ],
      },
    ],
  },
  'archenemy-commander': {
    title: 'Archenemy Commander',
    summary:
      'One Archenemy against a team of three, with a scheme deck in motion.',
    sections: [
      {
        heading: 'Sides',
        bullets: [
          'Choose the Archenemy, or assign one at random. The other three players are the heroes.',
          `Both sides start at ${String(ARCHENEMY_STARTING_LIFE)} life.`,
          'The heroes share that life total and take their turn together.',
          'The Archenemy goes first and draws on that turn.',
        ],
      },
      {
        heading: 'Schemes',
        bullets: [
          'The 40 Duskmourn Commander schemes are shuffled at the start.',
          'During each of the Archenemy’s first main phases, tap Next scheme to set one in motion.',
          'A scheme that is not ongoing resolves, then goes to the bottom of the scheme deck.',
          'An ongoing scheme stays face up until the table marks it abandoned, then it goes to the bottom.',
        ],
      },
      {
        heading: 'Life and loss',
        bullets: [
          'The Archenemy loses at 0 life, or when the usual poison and commander-damage limits are reached.',
          'The heroes lose together when their shared life reaches 0.',
          commanderCombat,
          commanderTax,
        ],
      },
    ],
  },
};

export function rulesForMode(gameMode: GameMode): ModeRules {
  return MODE_RULES[gameMode];
}
