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
          'In multiplayer Commander, that player draws on their first turn.',
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
          'The Leader takes the first turn and draws on that turn.',
          commanderTax,
        ],
      },
      {
        heading: 'Identities',
        bullets: [
          'Open Check my role from the timer menu. Only you see that card.',
          'On a single tracker, deal the identities at setup and pass the device around so each player reads theirs alone.',
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
          'During each of the Archenemy’s first main phases, open the timer menu and tap Next scheme to set one in motion.',
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
  emperor: {
    title: 'Emperor',
    summary:
      'Two teams of three. Each Emperor sits between two Generals, and eliminating an Emperor wins the game.',
    sections: [
      {
        heading: 'Teams and turns',
        bullets: [
          'Choose both teams and each team’s Emperor, or randomise either choice.',
          `Every player starts at ${String(STARTING_LIFE)} life and keeps their own hand, mana, permanents, poison, and turn.`,
          'Teammates may look at one another’s hands and discuss strategy, but may not manipulate one another’s cards.',
          'Randomly choose which Emperor takes the first turn. That Emperor draws on the first turn.',
        ],
      },
      {
        heading: 'Range and combat',
        bullets: [
          'Generals have range of influence 1. Emperors have range of influence 2.',
          'Spells, abilities, effects, and information can affect only players and objects within their controller’s range.',
          'A player may attack only an opponent seated immediately next to them, or that opponent’s planeswalkers and protected battles.',
          'As players leave, the empty seats stop counting, bringing surviving players into range.',
        ],
      },
      {
        heading: 'Deploy creatures',
        bullets: [
          'Every creature has “Tap: Target teammate gains control of this creature. Activate only as a sorcery.”',
          'This can move creatures through the team as the battle lines change.',
        ],
      },
      {
        heading: 'Winning and Commander rules',
        bullets: [
          'A team wins if its Emperor wins and loses immediately if its Emperor loses. A General may be eliminated without ending the game.',
          `A player loses at 0 life, ${String(POISON_LIMIT)} poison, or ${String(COMMANDER_DAMAGE_LIMIT)} combat damage from one commander.`,
          commanderTax,
        ],
      },
    ],
  },
  star: {
    title: 'Star',
    summary:
      'Five players sit in a circle. Your neighbors are allies and the two players across from you are enemies.',
    sections: [
      {
        heading: 'Positions and allies',
        bullets: [
          'Choose the circular positions manually by exchanging two players, or randomise all five positions.',
          'The players immediately to your left and right are your allies.',
          'The two nonadjacent players across the circle are your enemies.',
          'Positions stay fixed when a player is eliminated; your allies and enemies do not change.',
        ],
      },
      {
        heading: 'Combat and interaction',
        bullets: [
          'Players cannot attack their allies by default.',
          'Spells and abilities may still help or affect any player unless the table agrees on a stricter variant.',
          'Turns proceed clockwise. Randomly choose the starting player; that player draws on the first turn.',
        ],
      },
      {
        heading: 'Winning',
        bullets: [
          'The first surviving player whose two enemies have both been eliminated wins, regardless of who eliminated them.',
          'An eliminated player cannot win later.',
          `Every player starts at ${String(STARTING_LIFE)} life and loses at 0 life, ${String(POISON_LIMIT)} poison, or ${String(COMMANDER_DAMAGE_LIMIT)} combat damage from one commander.`,
          commanderTax,
        ],
      },
    ],
  },
  assassin: {
    title: 'Assassin',
    summary:
      'A free-for-all with secret contracts. Score marks, inherit new targets, and finish with the highest score.',
    sections: [
      {
        heading: 'Secret contracts',
        bullets: [
          'Each player privately receives one target. Contracts form a circle, so nobody targets themselves and everyone is hunted once.',
          'Pass the device around at setup. Open Check target from the timer menu whenever you need to read your current contract again.',
          'Players may attack and affect anyone; the contract determines scoring, not legal targets.',
        ],
      },
      {
        heading: 'Elimination and inheritance',
        bullets: [
          'When a player is eliminated, record who dealt the finishing blow.',
          'If you personally eliminate your assigned target, you score one mark.',
          'The player who was hunting the eliminated target inherits that target’s contract, even if somebody else dealt the finishing blow. This keeps one live contract per surviving player.',
        ],
      },
      {
        heading: 'Winning',
        bullets: [
          'Play until only one player remains. The last survivor scores one additional mark.',
          'The player with the most marks wins; if the highest score is tied, the last survivor wins that tie.',
          `Commander rules still apply: ${String(STARTING_LIFE)} starting life, ${String(POISON_LIMIT)} poison, and ${String(COMMANDER_DAMAGE_LIMIT)} combat damage from one commander are lethal.`,
          commanderTax,
        ],
      },
    ],
  },
};

export function rulesForMode(gameMode: GameMode): ModeRules {
  return MODE_RULES[gameMode];
}
