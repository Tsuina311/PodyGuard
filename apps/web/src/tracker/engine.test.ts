import { describe, expect, it } from 'vitest';
import {
  COMMANDER_DAMAGE_LIMIT,
  POISON_LIMIT,
  applyTrackerAction,
  createTracker,
  elapsedMs,
  pickFirstPlayer,
  uniqueCompletedDungeonCount,
  worstCommanderDamage,
} from './engine';

describe('commander tracker', () => {
  it('starts at 40 life and can undo via previous snapshots', () => {
    const start = createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
      { id: 'c', name: 'Cam' },
    ]);
    const hit = applyTrackerAction(start, { type: 'life', playerId: 'a', delta: -4 });
    expect(hit.players[0]?.life).toBe(36);
    expect(start.players[0]?.life).toBe(40);
  });

  it('asks about lethal commander damage, then names the last player winner', () => {
    let state = createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
    ]);
    state = applyTrackerAction(state, {
      type: 'commander',
      commanderId: 'b:1',
      toId: 'a',
      delta: COMMANDER_DAMAGE_LIMIT,
    });
    const asked = state.players.find((row) => row.id === 'a');
    expect(asked?.eliminated).toBe(false);
    expect(asked?.life).toBe(40 - COMMANDER_DAMAGE_LIMIT);
    expect(asked?.pendingLoss).toEqual({
      type: 'commander',
      commanderId: 'b:1',
    });
    expect(state.winnerId).toBeNull();

    state = applyTrackerAction(state, { type: 'confirmLoss', playerId: 'a' });
    expect(state.players.find((row) => row.id === 'a')?.eliminated).toBe(true);
    expect(state.winnerId).toBe('b');
  });

  it('lowers life by the same amount as commander damage', () => {
    let state = createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
    ]);
    state = applyTrackerAction(state, {
      type: 'commander',
      commanderId: 'b:1',
      toId: 'a',
      delta: 6,
    });
    const hit = state.players.find((row) => row.id === 'a');
    expect(hit?.life).toBe(34);
    expect(hit?.commanderDamage['b:1']).toBe(6);

    state = applyTrackerAction(state, {
      type: 'commander',
      commanderId: 'b:1',
      toId: 'a',
      delta: -2,
    });
    const corrected = state.players.find((row) => row.id === 'a');
    expect(corrected?.life).toBe(36);
    expect(corrected?.commanderDamage['b:1']).toBe(4);
  });

  it('tracks partner commanders separately from the main commander', () => {
    let state = createTracker([
      { id: 'a', name: 'Ada' },
      {
        id: 'b',
        name: 'Bea',
        commanders: [
          commander('card-one', 'Commander One'),
          commander('card-two', 'Commander Two'),
        ],
      },
    ]);
    expect(state.players.find((row) => row.id === 'b')?.commanders).toHaveLength(
      2,
    );

    state = applyTrackerAction(state, {
      type: 'commander',
      commanderId: 'b:card-one',
      toId: 'a',
      delta: 10,
    });
    state = applyTrackerAction(state, {
      type: 'commander',
      commanderId: 'b:card-two',
      toId: 'a',
      delta: 8,
    });
    const hit = state.players.find((row) => row.id === 'a');
    expect(hit?.life).toBe(22);
    expect(hit?.commanderDamage['b:card-one']).toBe(10);
    expect(hit?.commanderDamage['b:card-two']).toBe(8);
    expect(hit?.pendingLoss).toBeNull();
  });

  it('singles out the commander with the most damage, not the total', () => {
    let state = createTracker([
      { id: 'a', name: 'Ada' },
      {
        id: 'b',
        name: 'Bea',
        commanders: [
          commander('card-one', 'Commander One'),
          commander('card-two', 'Commander Two'),
        ],
      },
      { id: 'c', name: 'Cam' },
    ]);
    const clean = state.players
      .filter((row) => row.id === 'a')
      .map((row) => worstCommanderDamage(state, row));
    expect(clean).toEqual([null]);

    for (const [commanderId, delta] of [
      ['b:card-one', 13],
      ['b:card-two', 8],
      ['c:1', 6],
    ] as const) {
      state = applyTrackerAction(state, {
        type: 'commander',
        commanderId,
        toId: 'a',
        delta,
      });
    }
    const worst = state.players
      .filter((row) => row.id === 'a')
      .map((row) => worstCommanderDamage(state, row));
    expect(worst).toEqual([
      {
        commanderId: 'b:card-one',
        owner: 'Bea',
        commander: 'Commander One',
        value: 13,
      },
    ]);
  });

  it('keeps a player in the game when the loss is declined', () => {
    let state = createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
    ]);
    state = applyTrackerAction(state, { type: 'life', playerId: 'a', delta: -40 });
    expect(state.players[0]?.pendingLoss).toEqual({ type: 'life' });

    state = applyTrackerAction(state, { type: 'declineLoss', playerId: 'a' });
    expect(state.players[0]?.eliminated).toBe(false);
    expect(state.players[0]?.pendingLoss).toBeNull();
    expect(state.winnerId).toBeNull();

    // Still at zero life, so further damage must not re-open the question.
    state = applyTrackerAction(state, { type: 'life', playerId: 'a', delta: -1 });
    expect(state.players[0]?.pendingLoss).toBeNull();

    // Recovering and dying again is a fresh event worth asking about.
    state = applyTrackerAction(state, { type: 'life', playerId: 'a', delta: 5 });
    state = applyTrackerAction(state, { type: 'life', playerId: 'a', delta: -5 });
    expect(state.players[0]?.pendingLoss).toEqual({ type: 'life' });
  });

  it('asks separately about a second lethal cause', () => {
    let state = createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
    ]);
    state = applyTrackerAction(state, {
      type: 'poison',
      playerId: 'a',
      delta: POISON_LIMIT,
    });
    state = applyTrackerAction(state, { type: 'life', playerId: 'a', delta: -40 });
    expect(state.players[0]?.pendingLoss).toEqual({ type: 'poison' });

    state = applyTrackerAction(state, { type: 'declineLoss', playerId: 'a' });
    expect(state.players[0]?.pendingLoss).toEqual({ type: 'life' });
  });

  it('clears the poison prompt and the counters when a stray tap is walked back', () => {
    let state = createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
    ]);
    state = applyTrackerAction(state, {
      type: 'poison',
      playerId: 'a',
      delta: POISON_LIMIT,
    });
    expect(state.players[0]?.pendingLoss).toEqual({ type: 'poison' });

    state = applyTrackerAction(state, { type: 'poison', playerId: 'a', delta: -1 });
    expect(state.players[0]?.poison).toBe(POISON_LIMIT - 1);
    expect(state.players[0]?.pendingLoss).toBeNull();

    // Neither counter can be driven below zero.
    state = applyTrackerAction(state, { type: 'poison', playerId: 'a', delta: -99 });
    state = applyTrackerAction(state, { type: 'tax', playerId: 'a', delta: -2 });
    expect(state.players[0]?.poison).toBe(0);
    expect(state.players[0]?.commanderTax).toBe(0);
  });

  it('keeps the monarch until another player takes it', () => {
    let state = createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
      { id: 'c', name: 'Cam' },
    ]);
    state = applyTrackerAction(state, { type: 'monarch', playerId: 'a' });
    expect(state.monarchId).toBe('a');

    // Unrelated actions must not drop the monarchy.
    state = applyTrackerAction(state, { type: 'life', playerId: 'b', delta: -3 });
    state = applyTrackerAction(state, { type: 'poison', playerId: 'c', delta: 1 });
    expect(state.monarchId).toBe('a');

    state = applyTrackerAction(state, { type: 'monarch', playerId: 'b' });
    expect(state.monarchId).toBe('b');

    // It leaves the game with its holder.
    state = applyTrackerAction(state, { type: 'eliminate', playerId: 'b' });
    expect(state.monarchId).toBeNull();
  });

  it('picks a random first player from the living', () => {
    const start = createTracker(
      [
        { id: 'a', name: 'Ada' },
        { id: 'b', name: 'Bea' },
        { id: 'c', name: 'Cam' },
      ],
      1000,
    );
    expect(elapsedMs(start, 1500)).toBe(0);
    const picked = pickFirstPlayer(start, () => 0, 5000);
    expect(picked.firstPlayerId).toBe('a');
    expect(picked.startedAt).toBe(5000);
    expect(elapsedMs(picked, 6500)).toBe(1500);
  });

  it('tracks day and night', () => {
    const start = createTracker([{ id: 'a', name: 'Ada' }]);
    const day = applyTrackerAction(start, { type: 'dayNight', value: 'day' });
    const night = applyTrackerAction(day, {
      type: 'dayNight',
      value: 'night',
    });
    expect(day.dayNight).toBe('day');
    expect(night.dayNight).toBe('night');
  });

  it('only advances into legally connected dungeon rooms', () => {
    let state = createTracker([{ id: 'a', name: 'Ada' }]);
    state = applyTrackerAction(state, {
      type: 'enterDungeon',
      playerId: 'a',
      dungeonId: 'lost-mine',
    });
    expect(state.dungeons.a?.roomId).toBe('cave');

    const illegal = applyTrackerAction(state, {
      type: 'advanceDungeon',
      playerId: 'a',
      roomId: 'temple',
    });
    expect(illegal.dungeons.a?.roomId).toBe('cave');

    const legal = applyTrackerAction(state, {
      type: 'advanceDungeon',
      playerId: 'a',
      roomId: 'tunnels',
    });
    expect(legal.dungeons.a?.roomId).toBe('tunnels');
  });

  it('follows the printed Mad Mage path through the Lost Level', () => {
    let state = createTracker([{ id: 'a', name: 'Ada' }]);
    state = applyTrackerAction(state, {
      type: 'enterDungeon',
      playerId: 'a',
      dungeonId: 'mad-mage',
    });
    expect(state.dungeons.a?.roomId).toBe('portal');

    state = applyTrackerAction(state, {
      type: 'advanceDungeon',
      playerId: 'a',
      roomId: 'level',
    });
    state = applyTrackerAction(state, {
      type: 'advanceDungeon',
      playerId: 'a',
      roomId: 'twisted',
    });
    expect(state.dungeons.a?.roomId).toBe('twisted');

    // Twisted Caverns only leads to the Lost Level, never straight to Runestone.
    const skipped = applyTrackerAction(state, {
      type: 'advanceDungeon',
      playerId: 'a',
      roomId: 'runestone',
    });
    expect(skipped.dungeons.a?.roomId).toBe('twisted');

    state = applyTrackerAction(state, {
      type: 'advanceDungeon',
      playerId: 'a',
      roomId: 'lost',
    });
    state = applyTrackerAction(state, {
      type: 'advanceDungeon',
      playerId: 'a',
      roomId: 'runestone',
    });
    expect(state.dungeons.a?.roomId).toBe('runestone');
  });

  it('steps back a misclicked room without leaving the dungeon', () => {
    let state = createTracker([{ id: 'a', name: 'Ada' }]);
    state = applyTrackerAction(state, {
      type: 'enterDungeon',
      playerId: 'a',
      dungeonId: 'lost-mine',
    });
    state = applyTrackerAction(state, {
      type: 'advanceDungeon',
      playerId: 'a',
      roomId: 'tunnels',
    });

    state = applyTrackerAction(state, { type: 'stepBackDungeon', playerId: 'a' });
    expect(state.dungeons.a?.roomId).toBe('cave');
    expect(state.dungeons.a?.visitedRoomIds).toEqual(['cave']);

    // The other branch is reachable again after the correction.
    state = applyTrackerAction(state, {
      type: 'advanceDungeon',
      playerId: 'a',
      roomId: 'goblin',
    });
    expect(state.dungeons.a?.roomId).toBe('goblin');

    // The entrance is as far back as it goes.
    state = applyTrackerAction(state, { type: 'stepBackDungeon', playerId: 'a' });
    state = applyTrackerAction(state, { type: 'stepBackDungeon', playerId: 'a' });
    expect(state.dungeons.a?.roomId).toBe('cave');
    expect(state.dungeons.a?.dungeonId).toBe('lost-mine');
  });

  it('reopens a dungeon when the completing room is undone', () => {
    let state = createTracker([{ id: 'a', name: 'Ada' }]);
    state = applyTrackerAction(state, {
      type: 'enterDungeon',
      playerId: 'a',
      dungeonId: 'tomb',
    });
    for (const roomId of ['oubliette', 'cradle']) {
      state = applyTrackerAction(state, {
        type: 'advanceDungeon',
        playerId: 'a',
        roomId,
      });
    }
    expect(state.dungeons.a?.completed).toBe(true);
    expect(state.completedDungeons.a).toEqual(['tomb']);
    expect(uniqueCompletedDungeonCount(state.completedDungeons.a)).toBe(1);

    state = applyTrackerAction(state, { type: 'stepBackDungeon', playerId: 'a' });
    expect(state.dungeons.a?.completed).toBe(false);
    expect(state.dungeons.a?.roomId).toBe('oubliette');
    expect(state.completedDungeons.a).toEqual([]);
    expect(uniqueCompletedDungeonCount(state.completedDungeons.a)).toBe(0);
  });

  it('counts distinct completed dungeons, not repeats', () => {
    let state = createTracker([{ id: 'a', name: 'Ada' }]);
    state = applyTrackerAction(state, {
      type: 'enterDungeon',
      playerId: 'a',
      dungeonId: 'tomb',
    });
    for (const roomId of ['oubliette', 'cradle']) {
      state = applyTrackerAction(state, {
        type: 'advanceDungeon',
        playerId: 'a',
        roomId,
      });
    }
    state = applyTrackerAction(state, {
      type: 'enterDungeon',
      playerId: 'a',
      dungeonId: 'tomb',
    });
    for (const roomId of ['oubliette', 'cradle']) {
      state = applyTrackerAction(state, {
        type: 'advanceDungeon',
        playerId: 'a',
        roomId,
      });
    }
    expect(state.completedDungeons.a).toEqual(['tomb', 'tomb']);
    expect(uniqueCompletedDungeonCount(state.completedDungeons.a)).toBe(1);

    state = applyTrackerAction(state, {
      type: 'enterDungeon',
      playerId: 'a',
      dungeonId: 'lost-mine',
    });
    for (const roomId of ['goblin', 'store', 'temple']) {
      state = applyTrackerAction(state, {
        type: 'advanceDungeon',
        playerId: 'a',
        roomId,
      });
    }
    expect(uniqueCompletedDungeonCount(state.completedDungeons.a)).toBe(2);
    expect(uniqueCompletedDungeonCount(state.completedDungeons.a)).toBeLessThanOrEqual(
      4,
    );
  });

  it('cannot abandon an unfinished dungeon', () => {
    let state = createTracker([{ id: 'a', name: 'Ada' }]);
    state = applyTrackerAction(state, {
      type: 'enterDungeon',
      playerId: 'a',
      dungeonId: 'tomb',
    });
    const switched = applyTrackerAction(state, {
      type: 'enterDungeon',
      playerId: 'a',
      dungeonId: 'mad-mage',
    });
    expect(switched.dungeons.a?.dungeonId).toBe('tomb');
  });

  it('Undercity is initiative-only and initiative cannot exit another dungeon', () => {
    let state = createTracker([{ id: 'a', name: 'Ada' }]);
    const invalid = applyTrackerAction(state, {
      type: 'enterDungeon',
      playerId: 'a',
      dungeonId: 'undercity',
    });
    expect(invalid.dungeons.a).toBeUndefined();

    state = applyTrackerAction(state, {
      type: 'enterDungeon',
      playerId: 'a',
      dungeonId: 'lost-mine',
    });
    state = applyTrackerAction(state, {
      type: 'initiative',
      playerId: 'a',
    });
    expect(state.initiativeId).toBe('a');
    expect(state.dungeons.a?.dungeonId).toBe('lost-mine');

    const fresh = createTracker([{ id: 'b', name: 'Bea' }]);
    const initiative = applyTrackerAction(fresh, {
      type: 'initiative',
      playerId: 'b',
    });
    expect(initiative.dungeons.b?.dungeonId).toBe('undercity');
    expect(initiative.dungeons.b?.roomId).toBe('secret');
  });
});

function commander(cardId: string, name: string) {
  return {
    oracleId: `oracle-${cardId}`,
    cardId,
    name,
    artCropUri: `https://cards.scryfall.io/art_crop/${cardId}.jpg`,
    typeLine: 'Legendary Creature',
    oracleText: 'Partner',
    keywords: ['Partner'],
  };
}
