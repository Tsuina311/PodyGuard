import { describe, expect, it } from 'vitest';
import {
  COMMANDER_DAMAGE_LIMIT,
  HIT_LIMIT,
  POISON_LIMIT,
  STARTING_LIFE,
  TWO_HEADED_GIANT_STARTING_LIFE,
  applyTrackerAction,
  commanderOpponents,
  createTracker,
  elapsedMs,
  pickFirstPlayer,
  treacheryLeaderId,
  uniqueCompletedDungeonCount,
  worstCommanderDamage,
} from './engine';
import { dealTreacheryIdentities } from './treachery';
import { legalNextRoomIds } from './dungeons';

function twoHeadedGiant() {
  let state = createTracker([
    { id: 'a', name: 'Ada' },
    { id: 'b', name: 'Bea' },
    { id: 'c', name: 'Cam' },
    { id: 'd', name: 'Dee' },
  ]);
  state = applyTrackerAction(state, {
    type: 'teams',
    teams: [
      ['a', 'b'],
      ['c', 'd'],
    ],
  });
  return state;
}

describe('Two-Headed Giant tracker', () => {
  it('starts both teams at a shared 60 life', () => {
    let state = twoHeadedGiant();
    expect(state.players.map((player) => player.life)).toEqual([
      TWO_HEADED_GIANT_STARTING_LIFE,
      TWO_HEADED_GIANT_STARTING_LIFE,
      TWO_HEADED_GIANT_STARTING_LIFE,
      TWO_HEADED_GIANT_STARTING_LIFE,
    ]);

    state = applyTrackerAction(state, {
      type: 'life',
      playerId: 'b',
      delta: -5,
    });
    expect(
      state.players
        .filter((player) => ['a', 'b'].includes(player.id))
        .map((player) => player.life),
    ).toEqual([55, 55]);
    expect(
      state.players
        .filter((player) => ['c', 'd'].includes(player.id))
        .map((player) => player.life),
    ).toEqual([60, 60]);
  });

  it('applies commander damage to the shared life and shared damage totals', () => {
    const state = applyTrackerAction(twoHeadedGiant(), {
      type: 'commander',
      commanderId: 'c:1',
      toId: 'a',
      delta: 7,
    });
    expect(state.players.find((player) => player.id === 'a')?.life).toBe(53);
    expect(state.players.find((player) => player.id === 'b')?.life).toBe(53);
    expect(
      state.players.find((player) => player.id === 'a')?.commanderDamage[
        'c:1'
      ],
    ).toBe(7);
    expect(
      state.players.find((player) => player.id === 'b')?.commanderDamage[
        'c:1'
      ],
    ).toBe(7);
  });

  it('ignores commander damage from a teammate', () => {
    const state = applyTrackerAction(twoHeadedGiant(), {
      type: 'commander',
      commanderId: 'b:1',
      toId: 'a',
      delta: 7,
    });
    expect(state.players.find((player) => player.id === 'a')?.life).toBe(
      TWO_HEADED_GIANT_STARTING_LIFE,
    );
    expect(
      state.players.find((player) => player.id === 'a')?.commanderDamage[
        'b:1'
      ],
    ).toBeUndefined();
    expect(commanderOpponents(state, 'a').map((player) => player.id)).toEqual([
      'c',
      'd',
    ]);
  });

  it('randomly chooses a starting team', () => {
    const state = pickFirstPlayer(twoHeadedGiant(), () => 0.99);
    expect(state.firstPlayerId).toBe('c');
  });

  it('uses the Commander team poison limit of 20 on the shared total', () => {
    let state = twoHeadedGiant();
    state = applyTrackerAction(state, {
      type: 'poison',
      playerId: 'a',
      delta: 20,
    });
    expect(state.players.find((player) => player.id === 'a')?.poison).toBe(20);
    expect(state.players.find((player) => player.id === 'b')?.poison).toBe(20);
    expect(
      state.players.find((player) => player.id === 'a')?.pendingLoss,
    ).toEqual({ type: 'poison' });
    expect(
      state.players.find((player) => player.id === 'b')?.pendingLoss,
    ).toBeNull();
  });

  it('eliminates a whole team and names the opposing team winner', () => {
    const state = applyTrackerAction(twoHeadedGiant(), {
      type: 'eliminate',
      playerId: 'a',
    });
    expect(state.players.find((player) => player.id === 'a')?.eliminated).toBe(
      true,
    );
    expect(state.players.find((player) => player.id === 'b')?.eliminated).toBe(
      true,
    );
    expect(state.winnerId).toBe('c');
  });
});

describe('Archenemy Commander tracker', () => {
  function archenemy() {
    return applyTrackerAction(
      createTracker([
        { id: 'a', name: 'Ada' },
        { id: 'b', name: 'Bea' },
        { id: 'c', name: 'Cam' },
        { id: 'd', name: 'Dee' },
      ]),
      {
        type: 'teams',
        mode: 'archenemy-commander',
        teams: [['a'], ['b', 'c', 'd']],
        schemeOrder: ['332', '328'],
      },
      1_000,
    );
  }

  it('starts the Archenemy and hero team at 60 with the Archenemy first', () => {
    let state = archenemy();
    expect(state.archenemyId).toBe('a');
    expect(state.firstPlayerId).toBe('a');
    expect(state.players.map((player) => player.life)).toEqual([60, 60, 60, 60]);

    state = applyTrackerAction(state, {
      type: 'life',
      playerId: 'c',
      delta: -5,
    });
    expect(state.players.find((player) => player.id === 'a')?.life).toBe(60);
    expect(
      state.players
        .filter((player) => ['b', 'c', 'd'].includes(player.id))
        .map((player) => player.life),
    ).toEqual([55, 55, 55]);
  });

  it('keeps ongoing schemes face up until they are abandoned', () => {
    let state = applyTrackerAction(archenemy(), { type: 'scheme' });
    expect(state.currentSchemeId).toBe('332');
    expect(state.activeSchemeIds).toEqual(['332']);
    expect(state.schemeOrder).toEqual(['328']);

    state = applyTrackerAction(state, { type: 'scheme' });
    expect(state.currentSchemeId).toBe('328');
    expect(state.schemeOrder).toEqual(['328']);

    state = applyTrackerAction(state, {
      type: 'abandonScheme',
      schemeId: '332',
    });
    expect(state.activeSchemeIds).toEqual([]);
    expect(state.schemeOrder).toEqual(['328', '332']);
  });

  it('buries a resolved scheme and an abandoned ongoing one', () => {
    // 332 is ongoing and stays face up; 328 resolves as soon as it is replaced.
    let state = applyTrackerAction(archenemy(), { type: 'scheme' });
    state = applyTrackerAction(state, { type: 'scheme' });
    expect(state.pastSchemeIds).toEqual([]);

    state = applyTrackerAction(state, { type: 'scheme' });
    expect(state.pastSchemeIds).toEqual(['328']);

    state = applyTrackerAction(state, {
      type: 'abandonScheme',
      schemeId: '332',
    });
    expect(state.pastSchemeIds).toEqual(['328', '332']);
  });

  it('shares poison across the hero team and wins and loses as a team', () => {
    let state = applyTrackerAction(archenemy(), {
      type: 'poison',
      playerId: 'c',
      delta: 10,
    });
    expect(
      state.players
        .filter((player) => ['b', 'c', 'd'].includes(player.id))
        .every((player) => player.poison === 10),
    ).toBe(true);
    expect(state.players.find((player) => player.id === 'b')?.pendingLoss).toEqual(
      { type: 'poison' },
    );
    expect(state.players.find((player) => player.id === 'c')?.pendingLoss).toBeNull();
    state = applyTrackerAction(state, {
      type: 'confirmLoss',
      playerId: 'b',
    });
    expect(
      state.players
        .filter((player) => ['b', 'c', 'd'].includes(player.id))
        .every((player) => player.eliminated),
    ).toBe(true);
    expect(state.winnerId).toBe('a');
  });
});

describe('Emperor tracker', () => {
  function emperor() {
    return applyTrackerAction(createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
      { id: 'c', name: 'Cam' },
      { id: 'd', name: 'Dee' },
      { id: 'e', name: 'Eli' },
      { id: 'f', name: 'Fay' },
    ]), {
      type: 'teams',
      mode: 'emperor',
      teams: [
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ],
      emperorIds: ['b', 'e'],
    });
  }

  it('keeps individual life totals and chooses the first player from the emperors', () => {
    let state = emperor();
    expect(state.players.map((player) => player.life)).toEqual([
      40, 40, 40, 40, 40, 40,
    ]);
    state = applyTrackerAction(state, {
      type: 'life',
      playerId: 'a',
      delta: -5,
    });
    expect(state.players.map((player) => player.life)).toEqual([
      35, 40, 40, 40, 40, 40,
    ]);

    state = pickFirstPlayer(state, () => 0);
    expect(state.firstPlayerId).toBe('b');
  });

  it('allows a general to lose without eliminating their team', () => {
    let state = applyTrackerAction(emperor(), {
      type: 'life',
      playerId: 'a',
      delta: -40,
    });
    expect(state.players.find((player) => player.id === 'a')?.pendingLoss).toEqual(
      { type: 'life' },
    );
    state = applyTrackerAction(state, {
      type: 'confirmLoss',
      playerId: 'a',
    });
    expect(state.players.find((player) => player.id === 'a')?.eliminated).toBe(
      true,
    );
    expect(state.players.find((player) => player.id === 'b')?.eliminated).toBe(
      false,
    );
    expect(state.winnerId).toBeNull();

    state = applyTrackerAction(state, {
      type: 'eliminate',
      playerId: 'e',
    });
    expect(
      state.players
        .filter((player) => ['d', 'e', 'f'].includes(player.id))
        .every((player) => player.eliminated),
    ).toBe(true);
    expect(state.winnerId).toBe('b');
  });
});

describe('Star tracker', () => {
  function star() {
    return applyTrackerAction(createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
      { id: 'c', name: 'Cam' },
      { id: 'd', name: 'Dee' },
      { id: 'e', name: 'Eli' },
    ]), {
      type: 'starSeats',
      order: ['a', 'b', 'c', 'd', 'e'],
    });
  }

  it('keeps individual life and the chosen circular order', () => {
    let state = star();
    expect(state.starOrder).toEqual(['a', 'b', 'c', 'd', 'e']);
    state = applyTrackerAction(state, {
      type: 'life',
      playerId: 'b',
      delta: -5,
    });
    expect(state.players.map((player) => player.life)).toEqual([
      40, 35, 40, 40, 40,
    ]);
  });

  it('only accepts commander damage from the two enemies', () => {
    const state = star();
    // Order a-b-c-d-e: a’s allies are e and b; enemies are c and d.
    expect(commanderOpponents(state, 'a').map((player) => player.id)).toEqual([
      'c',
      'd',
    ]);
    const fromAlly = applyTrackerAction(state, {
      type: 'commander',
      commanderId: 'b:1',
      toId: 'a',
      delta: 5,
    });
    expect(fromAlly.players.find((player) => player.id === 'a')?.life).toBe(40);
    expect(
      fromAlly.players.find((player) => player.id === 'a')?.commanderDamage[
        'b:1'
      ],
    ).toBeUndefined();

    const fromEnemy = applyTrackerAction(state, {
      type: 'commander',
      commanderId: 'c:1',
      toId: 'a',
      delta: 5,
    });
    expect(fromEnemy.players.find((player) => player.id === 'a')?.life).toBe(35);
    expect(
      fromEnemy.players.find((player) => player.id === 'a')?.commanderDamage[
        'c:1'
      ],
    ).toBe(5);
  });

  it('wins when both nonadjacent enemies have been eliminated', () => {
    let state = applyTrackerAction(star(), {
      type: 'eliminate',
      playerId: 'c',
    });
    expect(state.winnerId).toBeNull();

    state = applyTrackerAction(state, {
      type: 'eliminate',
      playerId: 'd',
    });
    expect(state.winnerId).toBe('a');
  });
});

describe('Assassin tracker', () => {
  function assassin() {
    return applyTrackerAction(createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
      { id: 'c', name: 'Cam' },
      { id: 'd', name: 'Dee' },
    ]), {
      type: 'assassinContracts',
      order: ['a', 'b', 'c', 'd'],
    });
  }

  it('deals one secret target each and inherits an eliminated target contract', () => {
    let state = assassin();
    expect(state.assassinTargets).toEqual({
      a: 'b',
      b: 'c',
      c: 'd',
      d: 'a',
    });

    state = applyTrackerAction(state, {
      type: 'assassinate',
      victimId: 'b',
      killerId: 'a',
    });
    expect(state.assassinScores.a).toBe(1);
    expect(state.assassinTargets.a).toBe('c');
    expect(state.assassinTargets.b).toBeUndefined();
  });

  it('passes a contract without a score when someone else gets the kill', () => {
    const state = applyTrackerAction(assassin(), {
      type: 'assassinate',
      victimId: 'b',
      killerId: 'd',
    });
    expect(state.assassinScores.a).toBe(0);
    expect(state.assassinScores.d).toBe(0);
    expect(state.assassinTargets.a).toBe('c');
  });

  it('awards the survivor point and lets the highest score win', () => {
    let state = assassin();
    state = applyTrackerAction(state, {
      type: 'assassinate',
      victimId: 'b',
      killerId: 'a',
    });
    state = applyTrackerAction(state, {
      type: 'assassinate',
      victimId: 'c',
      killerId: 'a',
    });
    state = applyTrackerAction(state, {
      type: 'assassinate',
      victimId: 'd',
      killerId: 'a',
    });
    expect(state.assassinScores.a).toBe(4);
    expect(state.winnerId).toBe('a');
  });
});

describe('Treachery tracker', () => {
  function treachery() {
    const state = createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
      { id: 'c', name: 'Cam' },
      { id: 'd', name: 'Dee' },
    ]);
    return applyTrackerAction(state, {
      type: 'treacheryIdentities',
      deal: dealTreacheryIdentities(['a', 'b', 'c', 'd'], () => 0),
    });
  }

  it('deals one identity each and starts the table on the Leader', () => {
    const state = treachery();
    expect(Object.keys(state.treacheryRoles)).toHaveLength(4);
    expect(Object.keys(state.treacheryIdentities)).toHaveLength(4);
    expect(state.treacheryRolesReady).toBe(false);
    const leaderId = treacheryLeaderId(state);
    expect(leaderId).not.toBeNull();
    expect(state.treacheryRoles[leaderId!]).toBe('leader');
  });

  it('refuses a deal that does not seat the table', () => {
    const state = applyTrackerAction(treachery(), {
      type: 'treacheryIdentities',
      deal: dealTreacheryIdentities(['a', 'b', 'c', 'd', 'e'], () => 0),
    });
    expect(Object.keys(state.treacheryRoles)).toHaveLength(4);
  });

  it('opens the board once every identity has been read', () => {
    const state = applyTrackerAction(treachery(), { type: 'treacheryReady' });
    expect(state.treacheryRolesReady).toBe(true);
  });

  it('unveils an identity to the table only once', () => {
    let state = applyTrackerAction(treachery(), {
      type: 'unveilTreachery',
      playerId: 'b',
    });
    state = applyTrackerAction(state, {
      type: 'unveilTreachery',
      playerId: 'b',
    });
    state = applyTrackerAction(state, {
      type: 'unveilTreachery',
      playerId: 'nobody',
    });
    expect(state.treacheryUnveiled).toEqual(['b']);
  });
});

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

  it.each([
    ['duel-commander', 20] as const,
    ['brawl', 25] as const,
  ])('starts %s games at %i life', (gameMode, life) => {
    const state = createTracker(
      [
        { id: 'a', name: 'Ada' },
        { id: 'b', name: 'Bea' },
      ],
      Date.now(),
      { gameMode },
    );
    expect(state.players.map((player) => player.life)).toEqual([life, life]);
  });

  it('does not offer a commander-damage loss in duel commander', () => {
    let state = createTracker(
      [
        { id: 'a', name: 'Ada' },
        { id: 'b', name: 'Bea' },
      ],
      Date.now(),
      { gameMode: 'duel-commander' },
    );
    state = applyTrackerAction(state, {
      type: 'commander',
      commanderId: 'b:1',
      toId: 'a',
      delta: 15,
    });
    const tracked = state.players.find((row) => row.id === 'a');
    expect(tracked?.life).toBe(5);
    expect(tracked?.pendingLoss).toBeNull();

    state = applyTrackerAction(state, {
      type: 'commander',
      commanderId: 'b:1',
      toId: 'a',
      delta: 6,
    });
    const lethal = state.players.find((row) => row.id === 'a');
    expect(lethal?.pendingLoss).toEqual({ type: 'life' });
    expect(lethal?.pendingLoss?.type).not.toBe('commander');
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

  it('tracks secondary counters and caps progressive designations at four', () => {
    let state = createTracker([{ id: 'a', name: 'Ada' }]);
    state = applyTrackerAction(state, {
      type: 'counter',
      playerId: 'a',
      counter: 'energy',
      delta: 6,
    });
    state = applyTrackerAction(state, {
      type: 'counter',
      playerId: 'a',
      counter: 'ring',
      delta: 9,
    });
    state = applyTrackerAction(state, {
      type: 'counter',
      playerId: 'a',
      counter: 'speed',
      delta: 4,
    });
    state = applyTrackerAction(state, {
      type: 'counter',
      playerId: 'a',
      counter: 'ring',
      delta: -2,
    });

    expect(state.players[0]?.counters).toEqual({
      acorn: 0,
      energy: 6,
      experience: 0,
      hit: 0,
      rad: 0,
      ring: 2,
      speed: 4,
      ticket: 0,
    });
  });

  it('prompts at three Etrata hits and clears the prompt when undone', () => {
    let state = createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
    ]);
    state = applyTrackerAction(state, {
      type: 'counter',
      playerId: 'a',
      counter: 'hit',
      delta: HIT_LIMIT,
    });
    expect(state.players[0]?.counters.hit).toBe(HIT_LIMIT);
    expect(state.players[0]?.pendingLoss).toEqual({ type: 'hit' });

    state = applyTrackerAction(state, {
      type: 'counter',
      playerId: 'a',
      counter: 'hit',
      delta: -1,
    });
    expect(state.players[0]?.pendingLoss).toBeNull();
  });

  it('tracks enduring story and city blessing independently per player', () => {
    let state = createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
    ]);
    state = applyTrackerAction(state, {
      type: 'designation',
      playerId: 'a',
      designation: 'enduringStory',
      value: true,
    });
    state = applyTrackerAction(state, {
      type: 'designation',
      playerId: 'b',
      designation: 'cityBlessing',
      value: true,
    });

    expect(state.players[0]?.enduringStory).toBe(true);
    expect(state.players[0]?.cityBlessing).toBe(false);
    expect(state.players[1]?.enduringStory).toBe(false);
    expect(state.players[1]?.cityBlessing).toBe(true);
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

  it('knocks a seat out that lost to something the board cannot see', () => {
    let state = createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
      { id: 'c', name: 'Cam' },
    ]);
    state = applyTrackerAction(state, { type: 'eliminate', playerId: 'a' });
    expect(state.players[0]?.eliminated).toBe(true);
    expect(state.players[0]?.life).toBe(STARTING_LIFE);
    expect(state.winnerId).toBeNull();

    state = applyTrackerAction(state, { type: 'eliminate', playerId: 'b' });
    expect(state.players[1]?.eliminated).toBe(true);
    expect(state.winnerId).toBe('c');
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
    expect(picked.startedAt).toBeNull();
    expect(elapsedMs(picked, 6500)).toBe(0);
    const begun = applyTrackerAction(picked, { type: 'begin' }, 5000);
    expect(begun.startedAt).toBe(5000);
    expect(elapsedMs(begun, 6500)).toBe(1500);
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

  it('re-enters Undercity while still holding the initiative after finishing it', () => {
    let state = createTracker([{ id: 'a', name: 'Ada' }]);
    state = applyTrackerAction(state, {
      type: 'initiative',
      playerId: 'a',
    });
    expect(state.dungeons.a?.dungeonId).toBe('undercity');
    expect(state.initiativeId).toBe('a');

    while (state.dungeons.a && !state.dungeons.a.completed) {
      const nextRooms = legalNextRoomIds(state.dungeons.a);
      expect(nextRooms.length).toBeGreaterThan(0);
      state = applyTrackerAction(state, {
        type: 'advanceDungeon',
        playerId: 'a',
        roomId: nextRooms[0]!,
      });
    }
    expect(state.dungeons.a?.completed).toBe(true);
    expect(state.initiativeId).toBe('a');

    state = applyTrackerAction(state, {
      type: 'enterDungeon',
      playerId: 'a',
      dungeonId: 'undercity',
      viaInitiative: true,
    });
    expect(state.dungeons.a).toMatchObject({
      dungeonId: 'undercity',
      roomId: 'secret',
      completed: false,
      visitedRoomIds: ['secret'],
    });
    expect(state.initiativeId).toBe('a');
  });

  it('reorders seats without dropping player state', () => {
    let state = createTracker([
      { id: 'a', name: 'Ada' },
      { id: 'b', name: 'Bea' },
      { id: 'c', name: 'Cam' },
    ]);
    state = applyTrackerAction(state, {
      type: 'life',
      playerId: 'a',
      delta: -7,
    });
    state = applyTrackerAction(state, {
      type: 'reorderPlayers',
      order: ['c', 'a', 'b'],
    });
    expect(state.players.map((player) => player.id)).toEqual(['c', 'a', 'b']);
    expect(state.players.find((player) => player.id === 'a')?.life).toBe(
      STARTING_LIFE - 7,
    );
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
