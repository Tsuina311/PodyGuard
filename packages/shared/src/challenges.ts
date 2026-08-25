export type ChallengeDetectionMode = 'automatic' | 'confirmation' | 'manual';
export type ChallengeRepeatRule =
  | 'once-per-event'
  | 'once-per-game'
  | 'repeatable';

export type ChallengePrimitive =
  | { type: 'life_reaches'; threshold: number }
  | { type: 'life_below_then_win'; threshold: number }
  | { type: 'win_by_commander_damage' }
  | { type: 'win_by_poison' }
  | { type: 'players_eliminated'; threshold: number }
  | { type: 'manual_claim' };

export type Challenge = {
  id: string;
  name: string;
  description: string;
  category: 'survival' | 'combat' | 'elimination' | 'alternative';
  detectionMode: ChallengeDetectionMode;
  points: number;
  repeatRule: ChallengeRepeatRule;
  primitive: ChallengePrimitive;
  confirmationQuestion?: string;
};

export type ChallengePack = {
  id: string;
  version: number;
  name: string;
  description: string;
  /** Event-local packs stay private. Community visibility is a later phase. */
  visibility?: 'private';
  challenges: readonly Challenge[];
};

export const CHALLENGE_CATEGORIES = [
  'survival',
  'combat',
  'elimination',
  'alternative',
] as const;

export const CHALLENGE_PRIMITIVE_TYPES = [
  'life_reaches',
  'life_below_then_win',
  'win_by_commander_damage',
  'win_by_poison',
  'players_eliminated',
  'manual_claim',
] as const;

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;
const MAX_CHALLENGES = 16;

export type PublicChallengeCompletion = {
  challengeId: string;
  participantId: string;
  podId: string;
  points: number;
  completedAt: string;
};

/**
 * The immutable starter pack used by every beta event. A later pack creator
 * can copy this version, but historical events must never see these definitions
 * mutate underneath their recorded challenge ids.
 */
export const OFFICIAL_COMMANDER_CHALLENGES: ChallengePack = {
  id: 'classic-commander-v1',
  version: 1,
  name: 'Classic Commander Challenges',
  description: 'Shared achievements for a casual Commander event.',
  challenges: [
    {
      id: 'centurion',
      name: 'Centurion',
      description: 'Reach 100 or more life.',
      category: 'survival',
      detectionMode: 'automatic',
      points: 5,
      repeatRule: 'once-per-event',
      primitive: { type: 'life_reaches', threshold: 100 },
    },
    {
      id: 'comeback',
      name: 'Comeback',
      description: 'Win after having 5 or less life.',
      category: 'survival',
      detectionMode: 'automatic',
      points: 5,
      repeatRule: 'once-per-event',
      primitive: { type: 'life_below_then_win', threshold: 5 },
    },
    {
      id: 'commander-finish',
      name: 'Commander Finish',
      description: 'Win by eliminating the last opponent with commander damage.',
      category: 'combat',
      detectionMode: 'automatic',
      points: 4,
      repeatRule: 'once-per-event',
      primitive: { type: 'win_by_commander_damage' },
    },
    {
      id: 'toxic',
      name: 'Toxic',
      description: 'Win by eliminating the last opponent with poison.',
      category: 'elimination',
      detectionMode: 'automatic',
      points: 4,
      repeatRule: 'once-per-event',
      primitive: { type: 'win_by_poison' },
    },
    {
      id: 'double-kill',
      name: 'Double Kill',
      description: 'Eliminate at least two opponents during the same turn.',
      category: 'elimination',
      detectionMode: 'confirmation',
      points: 5,
      repeatRule: 'once-per-event',
      primitive: { type: 'players_eliminated', threshold: 2 },
      confirmationQuestion:
        'Did the winner eliminate at least two opponents during the same turn?',
    },
    {
      id: 'alternate-destiny',
      name: 'Alternate Destiny',
      description: 'Win through a card’s alternative win condition.',
      category: 'alternative',
      detectionMode: 'manual',
      points: 4,
      repeatRule: 'once-per-event',
      primitive: { type: 'manual_claim' },
    },
  ],
} as const;

export function challengeById(id: string): Challenge | undefined {
  return challengeInPack(OFFICIAL_COMMANDER_CHALLENGES, id);
}

export function challengeInPack(
  pack: ChallengePack,
  id: string,
): Challenge | undefined {
  return pack.challenges.find((challenge) => challenge.id === id);
}

export function cloneOfficialPack(packId: string): ChallengePack {
  return {
    id: packId,
    version: 1,
    name: `${OFFICIAL_COMMANDER_CHALLENGES.name} (private copy)`,
    description: OFFICIAL_COMMANDER_CHALLENGES.description,
    visibility: 'private',
    challenges: OFFICIAL_COMMANDER_CHALLENGES.challenges.map(cloneChallenge),
  };
}

export function emptyPrivatePack(packId: string): ChallengePack {
  return {
    id: packId,
    version: 1,
    name: 'Custom challenges',
    description: 'Private pack for this event.',
    visibility: 'private',
    challenges: [
      {
        id: 'table-claim',
        name: 'Table claim',
        description: 'Award this at the table.',
        category: 'alternative',
        detectionMode: 'manual',
        points: 1,
        repeatRule: 'once-per-game',
        primitive: { type: 'manual_claim' },
      },
    ],
  };
}

export function parseChallengePack(value: unknown): ChallengePack {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Challenge pack must be an object.');
  }
  const row = value as Record<string, unknown>;
  const id = parseId(row.id, 'pack id');
  const version = parsePositiveInt(row.version, 'pack version');
  const name = parseLabel(row.name, 'pack name', 80);
  const description = parseLabel(row.description, 'pack description', 240);
  if (row.visibility !== undefined && row.visibility !== 'private') {
    throw new Error('Only private packs can be saved from the event desk.');
  }
  if (!Array.isArray(row.challenges) || row.challenges.length === 0) {
    throw new Error('A pack needs at least one challenge.');
  }
  if (row.challenges.length > MAX_CHALLENGES) {
    throw new Error(`A pack can have at most ${String(MAX_CHALLENGES)} challenges.`);
  }
  const challenges = row.challenges.map((item, index) =>
    parseChallenge(item, index),
  );
  const ids = new Set(challenges.map((challenge) => challenge.id));
  if (ids.size !== challenges.length) {
    throw new Error('Challenge ids in a pack must be unique.');
  }
  return {
    id,
    version,
    name,
    description,
    visibility: 'private',
    challenges,
  };
}

function cloneChallenge(challenge: Challenge): Challenge {
  return {
    ...challenge,
    primitive: { ...challenge.primitive },
    confirmationQuestion: challenge.confirmationQuestion,
  };
}

function parseChallenge(value: unknown, index: number): Challenge {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Challenge ${String(index + 1)} is invalid.`);
  }
  const row = value as Record<string, unknown>;
  const primitive = parsePrimitive(row.primitive);
  const detectionMode = expectedDetectionMode(primitive);
  if (row.detectionMode !== detectionMode) {
    throw new Error(
      `Challenge ${String(index + 1)} detection must be ${detectionMode} for that primitive.`,
    );
  }
  const category = row.category;
  if (
    category !== 'survival' &&
    category !== 'combat' &&
    category !== 'elimination' &&
    category !== 'alternative'
  ) {
    throw new Error(`Challenge ${String(index + 1)} has an unknown category.`);
  }
  const repeatRule = row.repeatRule;
  if (
    repeatRule !== 'once-per-event' &&
    repeatRule !== 'once-per-game' &&
    repeatRule !== 'repeatable'
  ) {
    throw new Error(`Challenge ${String(index + 1)} has an unknown repeat rule.`);
  }
  const challenge: Challenge = {
    id: parseId(row.id, `challenge ${String(index + 1)} id`),
    name: parseLabel(row.name, `challenge ${String(index + 1)} name`, 60),
    description: parseLabel(
      row.description,
      `challenge ${String(index + 1)} description`,
      240,
    ),
    category,
    detectionMode,
    points: parsePoints(row.points),
    repeatRule,
    primitive,
  };
  if (typeof row.confirmationQuestion === 'string') {
    const question = row.confirmationQuestion.trim();
    if (question.length > 0) {
      challenge.confirmationQuestion = question.slice(0, 240);
    }
  }
  if (detectionMode === 'confirmation' && !challenge.confirmationQuestion) {
    throw new Error(
      `Challenge ${String(index + 1)} needs a confirmation question.`,
    );
  }
  return challenge;
}

function parsePrimitive(value: unknown): ChallengePrimitive {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Challenge primitives must be predefined objects, not code.');
  }
  const row = value as Record<string, unknown>;
  const type = row.type;
  if (
    type === 'life_reaches' ||
    type === 'life_below_then_win' ||
    type === 'players_eliminated'
  ) {
    return { type, threshold: parseThreshold(row.threshold) };
  }
  if (
    type === 'win_by_commander_damage' ||
    type === 'win_by_poison' ||
    type === 'manual_claim'
  ) {
    return { type };
  }
  throw new Error('That automatic-detection primitive is not allowed.');
}

function expectedDetectionMode(
  primitive: ChallengePrimitive,
): ChallengeDetectionMode {
  if (primitive.type === 'manual_claim') {
    return 'manual';
  }
  if (primitive.type === 'players_eliminated') {
    return 'confirmation';
  }
  return 'automatic';
}

function parseId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new Error(`${field} must be a short lowercase id.`);
  }
  return value;
}

function parseLabel(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string.`);
  }
  const label = value.trim();
  if (label.length < 1 || label.length > max) {
    throw new Error(`${field} is too short or too long.`);
  }
  return label;
}

function parsePositiveInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive whole number.`);
  }
  return value;
}

function parsePoints(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 20
  ) {
    throw new Error('Challenge points must be a whole number from 1 to 20.');
  }
  return value;
}

function parseThreshold(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 999
  ) {
    throw new Error('Primitive thresholds must be a whole number from 1 to 999.');
  }
  return value;
}
