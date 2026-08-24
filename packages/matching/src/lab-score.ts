import type { MatchHistory, MatchResult } from './types.js';
import { PREFERRED_POD_SIZE } from './types.js';

export type PlanScore = {
  matched: number;
  fours: number;
  concessions: number;
  rematches: number;
};

export function planScore(
  result: MatchResult,
  history: MatchHistory = { groups: [] },
  preferredSize = PREFERRED_POD_SIZE,
): PlanScore {
  const pairHistory = new Set<string>();
  for (const group of history.groups) {
    for (let left = 0; left < group.length; left += 1) {
      for (let right = left + 1; right < group.length; right += 1) {
        const first = group[left];
        const second = group[right];
        if (first && second) {
          pairHistory.add(first < second ? `${first}:${second}` : `${second}:${first}`);
        }
      }
    }
  }
  return {
    matched: result.matches.reduce((sum, row) => sum + row.seats.length, 0),
    fours: result.matches.filter((row) => row.seats.length === preferredSize).length,
    concessions: result.matches.reduce(
      (sum, row) => sum + row.seats.filter((seat) => seat.concession).length,
      0,
    ),
    rematches: result.matches.reduce((sum, row) => {
      const ids = row.seats.map((seat) => seat.participantId);
      let count = 0;
      for (let left = 0; left < ids.length; left += 1) {
        for (let right = left + 1; right < ids.length; right += 1) {
          const first = ids[left];
          const second = ids[right];
          if (first && second) {
            const key = first < second ? `${first}:${second}` : `${second}:${first}`;
            if (pairHistory.has(key)) {
              count += 1;
            }
          }
        }
      }
      return sum + count;
    }, 0),
  };
}

/** 1.0 means production matches the oracle on matched seats (and is not worse). */
export function optimalityRatio(production: PlanScore, oracle: PlanScore): number {
  if (oracle.matched === 0) {
    return production.matched === 0 ? 1 : 0;
  }
  return production.matched / oracle.matched;
}

export function isNoWorseThanOracle(production: PlanScore, oracle: PlanScore): boolean {
  if (production.matched !== oracle.matched) {
    return production.matched > oracle.matched;
  }
  if (production.fours !== oracle.fours) {
    return production.fours > oracle.fours;
  }
  if (production.concessions !== oracle.concessions) {
    return production.concessions < oracle.concessions;
  }
  if (production.rematches !== oracle.rematches) {
    return production.rematches < oracle.rematches;
  }
  return true;
}
