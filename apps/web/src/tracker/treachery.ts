import {
  assignTreacheryIdentities,
  assignTreacheryRoles,
  TREACHERY_POD_SIZES,
  type TreacheryRole,
} from '@podyguard/shared';

export type TreacheryDeal = {
  playerId: string;
  role: TreacheryRole;
  identityId: number;
};

/**
 * The server deals identities one participant at a time, one phone each. A pod
 * on a single tracker has no server, so the whole table is dealt here and the
 * device is passed around instead.
 */
export function dealTreacheryIdentities(
  playerIds: string[],
  random: () => number = Math.random,
): TreacheryDeal[] {
  const size = playerIds.length;
  if (
    !TREACHERY_POD_SIZES.some((allowed) => allowed === size) ||
    new Set(playerIds).size !== size
  ) {
    return [];
  }
  const roles = assignTreacheryRoles(playerIds, random);
  const identities = assignTreacheryIdentities(roles, random);
  return playerIds.map((playerId) => ({
    playerId,
    role: roles.get(playerId)!,
    identityId: identities.get(playerId)!,
  }));
}
