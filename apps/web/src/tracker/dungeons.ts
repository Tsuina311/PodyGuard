export type DungeonId =
  | 'lost-mine'
  | 'mad-mage'
  | 'tomb'
  | 'undercity';

/**
 * Room box on the printed card, as percentages of the card image so the
 * overlay scales with however wide the card is rendered.
 */
export type RoomRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DungeonRoom = {
  id: string;
  name: string;
  effect: string;
  next: string[];
  row: number;
  rect: RoomRect;
};

export type DungeonDefinition = {
  id: DungeonId;
  name: string;
  initiativeOnly?: boolean;
  /** Card scan served from apps/web/public/dungeons. */
  image: string;
  rooms: DungeonRoom[];
};

export type DungeonProgress = {
  dungeonId: DungeonId;
  roomId: string;
  visitedRoomIds: string[];
  completed: boolean;
};

export const DUNGEONS: DungeonDefinition[] = [
  {
    id: 'lost-mine',
    name: 'Lost Mine of Phandelver',
    image: '/dungeons/lost-mine.jpg',
    rooms: [
      room('cave', 'Cave Entrance', 'Scry 1.', ['goblin', 'tunnels'], 1, {
        x: 7.2,
        y: 14.7,
        w: 86.1,
        h: 14.7,
      }),
      room(
        'goblin',
        'Goblin Lair',
        'Create a 1/1 red Goblin creature token.',
        ['store', 'pool'],
        2,
        { x: 7.8, y: 33.1, w: 43, h: 14.7 },
      ),
      room(
        'tunnels',
        'Mine Tunnels',
        'Create a Treasure token.',
        ['pool', 'fungi'],
        2,
        { x: 51.6, y: 33.1, w: 41.6, h: 14.7 },
      ),
      room(
        'store',
        'Storeroom',
        'Put a +1/+1 counter on target creature.',
        ['temple'],
        3,
        { x: 7.8, y: 50.7, w: 26.6, h: 22.1 },
      ),
      room(
        'pool',
        'Dark Pool',
        'Each opponent loses 1 life and you gain 1 life.',
        ['temple'],
        3,
        { x: 35.9, y: 50.7, w: 28.7, h: 22.1 },
      ),
      room(
        'fungi',
        'Fungi Cavern',
        'Target creature gets -4/-0 until your next turn.',
        ['temple'],
        3,
        { x: 66, y: 50.7, w: 27.2, h: 22.1 },
      ),
      room('temple', 'Temple of Dumathoin', 'Draw a card.', [], 4, {
        x: 7.8,
        y: 75,
        w: 85.5,
        h: 13.2,
      }),
    ],
  },
  {
    id: 'mad-mage',
    name: 'Dungeon of the Mad Mage',
    image: '/dungeons/mad-mage.jpg',
    rooms: [
      room('portal', 'Yawning Portal', 'You gain 1 life.', ['level'], 1, {
        x: 7.8,
        y: 15.9,
        w: 85.5,
        h: 6.2,
      }),
      room('level', 'Dungeon Level', 'Scry 1.', ['bazaar', 'twisted'], 2, {
        x: 7.8,
        y: 23.5,
        w: 85.5,
        h: 6.6,
      }),
      room('bazaar', 'Goblin Bazaar', 'Create a Treasure token.', ['lost'], 3, {
        x: 7.8,
        y: 31.6,
        w: 42,
        h: 11.8,
      }),
      room(
        'twisted',
        'Twisted Caverns',
        "Target creature can't attack until your next turn.",
        ['lost'],
        3,
        { x: 50.8, y: 31.6, w: 42.4, h: 11.8 },
      ),
      room('lost', 'Lost Level', 'Scry 2.', ['runestone', 'graveyard'], 4, {
        x: 7.8,
        y: 45.6,
        w: 85.5,
        h: 6.6,
      }),
      room(
        'runestone',
        'Runestone Caverns',
        'Exile the top two cards of your library. You may play them.',
        ['deep'],
        5,
        { x: 7.8, y: 52.9, w: 42, h: 14 },
      ),
      room(
        'graveyard',
        "Muiral's Graveyard",
        'Create two 1/1 black Skeleton creature tokens.',
        ['deep'],
        5,
        { x: 50.8, y: 52.9, w: 42.4, h: 14 },
      ),
      room('deep', 'Deep Mines', 'Scry 3.', ['lair'], 6, {
        x: 7.8,
        y: 69.1,
        w: 85.5,
        h: 6.6,
      }),
      room(
        'lair',
        "Mad Wizard's Lair",
        'Draw three cards and reveal them. You may cast one of them without paying its mana cost.',
        [],
        7,
        { x: 7.8, y: 76.5, w: 85.5, h: 11 },
      ),
    ],
  },
  {
    id: 'tomb',
    name: 'Tomb of Annihilation',
    image: '/dungeons/tomb.jpg',
    rooms: [
      room(
        'entry',
        'Trapped Entry',
        'Each player loses 1 life.',
        ['veils', 'oubliette'],
        1,
        { x: 7.8, y: 14.7, w: 85.5, h: 14 },
      ),
      room(
        'veils',
        'Veils of Fear',
        'Each player loses 2 life unless they discard a card.',
        ['sandfall'],
        2,
        { x: 7.8, y: 30.6, w: 41.4, h: 17.9 },
      ),
      room(
        'oubliette',
        'Oubliette',
        'Discard a card and sacrifice an artifact, a creature, and a land.',
        ['cradle'],
        2,
        { x: 50.2, y: 30.6, w: 43, h: 36.3 },
      ),
      room(
        'sandfall',
        'Sandfall Cell',
        'Each player loses 2 life unless they sacrifice an artifact, creature, or land.',
        ['cradle'],
        3,
        { x: 7.8, y: 50, w: 41.4, h: 17.4 },
      ),
      room(
        'cradle',
        'Cradle of the Death God',
        'Create The Atropal, a legendary 4/4 black God Horror creature token with deathtouch.',
        [],
        4,
        { x: 7.8, y: 71.6, w: 85.5, h: 16.2 },
      ),
    ],
  },
  {
    id: 'undercity',
    name: 'Undercity',
    initiativeOnly: true,
    image: '/dungeons/undercity.jpg',
    rooms: [
      room(
        'secret',
        'Secret Entrance',
        'Search your library for a basic land card, reveal it, put it into your hand, then shuffle.',
        ['forge', 'well'],
        1,
        { x: 7.8, y: 20, w: 85.5, h: 9.4 },
      ),
      room(
        'forge',
        'Forge',
        'Put two +1/+1 counters on target creature.',
        ['trap', 'arena'],
        2,
        { x: 7.8, y: 31.2, w: 42, h: 11.2 },
      ),
      room('well', 'Lost Well', 'Scry 2.', ['arena', 'stash'], 2, {
        x: 51.6,
        y: 31.2,
        w: 41.6,
        h: 11.2,
      }),
      room('trap', 'Trap!', 'Target player loses 5 life.', ['archives'], 3, {
        x: 7.8,
        y: 43.7,
        w: 29.1,
        h: 14,
      }),
      room('arena', 'Arena', 'Goad target creature.', ['archives', 'catacombs'], 3, {
        x: 38.5,
        y: 43.7,
        w: 21.9,
        h: 14,
      }),
      room('stash', 'Stash', 'Create a Treasure token.', ['catacombs'], 3, {
        x: 61.9,
        y: 43.7,
        w: 31.4,
        h: 14,
      }),
      room('archives', 'Archives', 'Draw a card.', ['throne'], 4, {
        x: 7.8,
        y: 59.1,
        w: 42,
        h: 12.1,
      }),
      room(
        'catacombs',
        'Catacombs',
        'Create a 4/1 black Skeleton creature token with menace.',
        ['throne'],
        4,
        { x: 51.6, y: 59.1, w: 41.6, h: 12.1 },
      ),
      room(
        'throne',
        'Throne of the Dead Three',
        'Reveal the top ten cards of your library. Put a creature card from among them onto the battlefield with three +1/+1 counters on it. It gains hexproof until your next turn. Then shuffle.',
        [],
        5,
        { x: 7.8, y: 72.9, w: 85.5, h: 17.1 },
      ),
    ],
  },
];

export const DUNGEON_COUNT = DUNGEONS.length;

export function dungeonById(id: DungeonId): DungeonDefinition {
  const dungeon = DUNGEONS.find((row) => row.id === id);
  if (!dungeon) {
    throw new Error('Unknown dungeon.');
  }
  return dungeon;
}

export function roomById(
  dungeon: DungeonDefinition,
  id: string,
): DungeonRoom {
  const found = dungeon.rooms.find((row) => row.id === id);
  if (!found) {
    throw new Error('Unknown dungeon room.');
  }
  return found;
}

export function legalNextRoomIds(progress: DungeonProgress): string[] {
  if (progress.completed) {
    return [];
  }
  const dungeon = dungeonById(progress.dungeonId);
  return roomById(dungeon, progress.roomId).next;
}

function room(
  id: string,
  name: string,
  effect: string,
  next: string[],
  row: number,
  rect: RoomRect,
): DungeonRoom {
  return { id, name, effect, next, row, rect };
}
