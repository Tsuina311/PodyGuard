import identityData from './treachery-identities.json';

export const GAME_MODES = [
  'duel',
  'multiplayer',
  'commander',
  'duel-commander',
  'brawl',
  'treachery',
  'two-headed-giant',
  'archenemy-commander',
  'emperor',
  'star',
  'assassin',
] as const;
export type GameMode = (typeof GAME_MODES)[number];

export type GameModeFamily = 'normal' | 'commander';
export type RulesFormat = GameModeFamily;

export function isGameMode(value: unknown): value is GameMode {
  return (
    typeof value === 'string' &&
    (GAME_MODES as readonly string[]).includes(value)
  );
}

export function parseGameMode(value: unknown): GameMode {
  return isGameMode(value) ? value : 'commander';
}

export function isRulesFormat(value: unknown): value is RulesFormat {
  return value === 'normal' || value === 'commander';
}

export function parseRulesFormat(value: unknown): RulesFormat | undefined {
  return isRulesFormat(value) ? value : undefined;
}

/** Legacy default when an event or match config has no explicit format stored. */
export function defaultRulesFormat(mode: GameMode): RulesFormat {
  return mode === 'duel' || mode === 'multiplayer' ? 'normal' : 'commander';
}

export function resolveRulesFormat(
  mode: GameMode,
  format?: RulesFormat | null,
): RulesFormat {
  return format ?? defaultRulesFormat(mode);
}

export function gameModeFamily(mode: GameMode): GameModeFamily {
  return defaultRulesFormat(mode);
}

/** Commander damage, tax, and related chrome only apply in Commander format. */
export function usesCommanderRules(
  mode: GameMode,
  format?: RulesFormat | null,
): boolean {
  return resolveRulesFormat(mode, format) === 'commander';
}

export type CommanderSearchProfile = 'commander' | 'duel-commander' | 'brawl';

/** Scryfall legality filter for commander pickers in each mode. */
export function commanderSearchProfile(mode: GameMode): CommanderSearchProfile {
  if (mode === 'duel-commander') {
    return 'duel-commander';
  }
  if (mode === 'brawl') {
    return 'brawl';
  }
  return 'commander';
}

/** Classic Commander and similar formats track 21 commander damage; DC and Brawl do not. */
export function usesCommanderDamage(
  mode: GameMode,
  format?: RulesFormat | null,
): boolean {
  if (!usesCommanderRules(mode, format)) {
    return false;
  }
  return mode !== 'duel-commander' && mode !== 'brawl';
}

export const DUEL_COMMANDER_STARTING_LIFE = 20;
export const BRAWL_STARTING_LIFE = 25;

export const CLASSIC_COMMANDER_MIN_PLAYERS = 3;

export function startingLifeForGameMode(
  mode: GameMode,
  format?: RulesFormat | null,
): number | null {
  const resolved = resolveRulesFormat(mode, format);
  if (resolved === 'normal') {
    return 20;
  }
  if (mode === 'duel' || mode === 'multiplayer') {
    return 20;
  }
  if (mode === 'duel-commander') {
    return DUEL_COMMANDER_STARTING_LIFE;
  }
  if (mode === 'brawl') {
    return BRAWL_STARTING_LIFE;
  }
  return 40;
}

export const MODES_BY_FAMILY: Record<
  GameModeFamily,
  readonly GameMode[]
> = {
  normal: [
    'duel',
    'multiplayer',
    'treachery',
    'two-headed-giant',
    'archenemy-commander',
    'emperor',
    'star',
    'assassin',
  ],
  commander: [
    'commander',
    'duel-commander',
    'brawl',
    'treachery',
    'two-headed-giant',
    'archenemy-commander',
    'emperor',
    'star',
    'assassin',
  ],
};

export const TREACHERY_ROLES = [
  'leader',
  'guardian',
  'assassin',
  'traitor',
] as const;
export type TreacheryRole = (typeof TREACHERY_ROLES)[number];

export type TreacheryRoleInfo = {
  role: TreacheryRole;
  name: string;
  objective: string;
  guidance: string;
  public: boolean;
};

export const TREACHERY_ROLE_INFO: Record<TreacheryRole, TreacheryRoleInfo> = {
  leader: {
    role: 'leader',
    name: 'Leader',
    objective: 'Survive until every Assassin and Traitor is eliminated.',
    guidance:
      'Reveal yourself to the table. The Guardians share your victory, but you do not know who they are.',
    public: true,
  },
  guardian: {
    role: 'guardian',
    name: 'Guardian',
    objective: 'Keep the Leader alive and eliminate the Leader’s enemies.',
    guidance:
      'Your identity is secret. You win and lose with the Leader, even if you are eliminated first.',
    public: false,
  },
  assassin: {
    role: 'assassin',
    name: 'Assassin',
    objective: 'Eliminate the Leader.',
    guidance:
      'Your identity is secret. Assassins share the same objective, but you do not know who the other Assassins are.',
    public: false,
  },
  traitor: {
    role: 'traitor',
    name: 'Traitor',
    objective: 'Be the last player standing.',
    guidance:
      'Your identity is secret. Keep the Leader alive until the other threats are gone, then take the throne for yourself.',
    public: false,
  },
};

export type TreacheryRoleAssignment = {
  podId: string;
  role: TreacheryRole;
  identity: TreacheryIdentityCard;
  unveiled: boolean;
  leaderParticipantId: string;
  distribution: Record<TreacheryRole, number>;
};

export type TreacheryIdentityCard = {
  id: number;
  slug: string;
  name: string;
  role: TreacheryRole;
  rarity: 'common' | 'uncommon' | 'rare' | 'mythic' | 'special';
  text: string[];
  flavor: string;
  artist: string;
  rulings: string[];
  image: string;
};

export type PublicTreacheryIdentity = Pick<
  TreacheryIdentityCard,
  'id' | 'name' | 'role' | 'image'
>;

export const TREACHERY_IDENTITIES =
  identityData as TreacheryIdentityCard[];

export function treacheryIdentityById(
  id: number,
): TreacheryIdentityCard | undefined {
  return TREACHERY_IDENTITIES.find((card) => card.id === id);
}

export function assignTreacheryIdentities(
  roles: Map<string, TreacheryRole>,
  random: () => number = Math.random,
): Map<string, number> {
  const available = new Map<TreacheryRole, number[]>();
  for (const role of TREACHERY_ROLES) {
    const ids = TREACHERY_IDENTITIES.filter((card) => card.role === role).map(
      (card) => card.id,
    );
    for (let index = ids.length - 1; index > 0; index -= 1) {
      const swapWith = Math.floor(random() * (index + 1));
      [ids[index], ids[swapWith]] = [ids[swapWith]!, ids[index]!];
    }
    available.set(role, ids);
  }

  const assigned = new Map<string, number>();
  for (const [participantId, role] of roles) {
    const identityId = available.get(role)?.pop();
    if (identityId === undefined) {
      throw new Error(`No ${role} identity is available.`);
    }
    assigned.set(participantId, identityId);
  }
  return assigned;
}

export const TREACHERY_POD_SIZES = [4, 5, 6, 7, 8] as const;
export type TreacheryPodSize = (typeof TREACHERY_POD_SIZES)[number];

export const ASSASSIN_POD_SIZES = [3, 4, 5, 6, 7, 8] as const;
export type AssassinPodSize = (typeof ASSASSIN_POD_SIZES)[number];

/**
 * The recommended identity mix from the Treachery comprehensive rules.
 * Matching prefers the host's chosen base size and leftover tables down to 4.
 */
const ROLE_DISTRIBUTIONS: Record<number, TreacheryRole[]> = {
  4: ['leader', 'traitor', 'assassin', 'assassin'],
  5: ['leader', 'traitor', 'assassin', 'assassin', 'guardian'],
  6: ['leader', 'traitor', 'assassin', 'assassin', 'assassin', 'guardian'],
  7: [
    'leader',
    'traitor',
    'assassin',
    'assassin',
    'assassin',
    'guardian',
    'guardian',
  ],
  8: [
    'leader',
    'traitor',
    'traitor',
    'assassin',
    'assassin',
    'assassin',
    'guardian',
    'guardian',
  ],
};

export function treacheryRolesForSize(size: number): TreacheryRole[] {
  const roles = ROLE_DISTRIBUTIONS[size];
  if (!roles) {
    throw new Error('Treachery requires between 4 and 8 players.');
  }
  return [...roles];
}

export function treacheryDistribution(
  roles: TreacheryRole[],
): Record<TreacheryRole, number> {
  const result: Record<TreacheryRole, number> = {
    leader: 0,
    guardian: 0,
    assassin: 0,
    traitor: 0,
  };
  for (const role of roles) {
    result[role] += 1;
  }
  return result;
}

export function assignTreacheryRoles(
  participantIds: string[],
  random: () => number = Math.random,
): Map<string, TreacheryRole> {
  const roles = treacheryRolesForSize(participantIds.length);
  for (let index = roles.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(random() * (index + 1));
    [roles[index], roles[swapWith]] = [roles[swapWith]!, roles[index]!];
  }
  return new Map(
    participantIds.map((participantId, index) => [
      participantId,
      roles[index]!,
    ]),
  );
}
