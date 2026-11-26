import { describe, expect, it } from 'vitest';
import { allocateTableGames, buildTableAreas, defaultLimitedTablePlan, limitedTableGroups, tableGameSizes, validateLimitedTablePlan, validateTableLayouts } from './table-layout';

describe('physical table layouts', () => {
  it('maximizes seated players across uneven game areas and keeps an unused larger space free', () => {
    expect(allocateTableGames(12, [4, 4, 3, 3], [4, 3], 4)).toEqual([3, 3, 3, 3]);
    expect(allocateTableGames(8, [4, 3], [4, 3], 4)).toEqual([4, 3]);
    expect(allocateTableGames(3, [4, 3], [4, 3], 4)).toEqual([0, 3]);
  });
  it('divides tables into the maximum number of legal games and uses preferred sizes when tied', () => {
    expect(tableGameSizes(7, [3, 4, 5], 4)).toEqual([4, 3]);
    expect(tableGameSizes(8, [3, 4, 5], 4)).toEqual([4, 4]);
    expect(tableGameSizes(9, [3, 4, 5], 4)).toEqual([3, 3, 3]);
    expect(tableGameSizes(7, [4], 4)).toEqual([4]);
    expect(tableGameSizes(7, [2], 2)).toEqual([2, 2, 2]);
    expect(tableGameSizes(3, [4], 4)).toEqual([]);
  });
  it('keeps stable physical numbers and independent lettered spaces across draft and play layouts', () => {
    const areas = buildTableAreas([{ shape: 'square', seats: 4 }, { shape: 'round', seats: 2 }, { shape: 'rectangle', seats: 2 }],
      [2], 2, [{ shape: 'round', seats: 8 }]);
    expect(areas.map(area => area.label)).toEqual(['Table 1 · Part A', 'Table 1 · Part B', 'Table 2', 'Table 3']);
    expect(areas.slice(0, 2).map(row => row.area.draft?.seats)).toEqual([8, 8]);
    const tables = areas.map((row, i) => ({ ...row, id: String(i), status: 'free' }));
    expect(limitedTableGroups(tables, true, 8).map(group => group.map(row => row.id))).toEqual([['0', '1']]);
    tables[1]!.status = 'occupied';
    expect(limitedTableGroups(tables, true, 8)).toEqual([]);
  });
  it('groups Sealed deckbuilding seats without treating every duel space as a separate cohort', () => {
    const tables = buildTableAreas(defaultLimitedTablePlan(4, false).play, [2], 2)
      .map((row, index) => ({ ...row, id: String(index), status: 'free' }));
    expect(limitedTableGroups(tables, false, 4)).toHaveLength(1);
  });
  it('caps playing seats across the tables at the total planned players', () => {
    const draft = [{ shape: 'round', seats: 8 }] as const;
    const play = [{ shape: 'square', seats: 4 }, { shape: 'rectangle', seats: 2 }, { shape: 'square', seats: 2 }] as const;
    expect(validateLimitedTablePlan({ draft, play }, 8, true).play).toHaveLength(3);
    expect(() => validateLimitedTablePlan({ draft, play: [...play, play[2]] }, 8, true)).toThrow('at most 8 seats');
    expect(validateLimitedTablePlan({ draft: [...draft, ...draft], play: [...play, ...play] }, 8, true).play).toHaveLength(6);
    expect(validateLimitedTablePlan(defaultLimitedTablePlan(5, false), 5, false).play).toHaveLength(2);
  });
  it('rejects malformed, too small and insufficient layouts', () => {
    expect(() => validateTableLayouts([{ shape: 'triangle', seats: 8 }])).toThrow();
    expect(() => validateTableLayouts([{ shape: 'round', seats: 2.5 }])).toThrow();
    expect(() => validateLimitedTablePlan({ draft: [{ shape: 'round', seats: 4 }], play: [{ shape: 'square', seats: 8 }] }, 8, true)).toThrow('complete draft pod');
    expect(() => validateLimitedTablePlan({ draft: [{ shape: 'round', seats: 8 }], play: [{ shape: 'square', seats: 7 }] }, 8, true)).toThrow('enough two-player');
    expect(validateLimitedTablePlan(defaultLimitedTablePlan(8), 8, true).play).toHaveLength(4);
  });
});
