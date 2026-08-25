import {
  OFFICIAL_COMMANDER_CHALLENGES,
  type Challenge,
  type ChallengePack,
} from '@podyguard/shared';
import { commanderById, type TrackerState } from './engine';

export type DetectedChallenge = {
  challenge: Challenge;
  participantId: string;
};

/**
 * Evaluates only the predefined primitives in the event's pack.
 * This is deliberately a switch over safe data, never executable pack code.
 */
export function detectAutomaticChallenges(
  state: TrackerState,
  pack: ChallengePack = OFFICIAL_COMMANDER_CHALLENGES,
): DetectedChallenge[] {
  const found: DetectedChallenge[] = [];
  for (const challenge of pack.challenges) {
    if (challenge.detectionMode !== 'automatic') {
      continue;
    }
    const primitive = challenge.primitive;
    if (primitive.type === 'life_reaches') {
      for (const player of state.players) {
        if (player.life >= primitive.threshold) {
          found.push({ challenge, participantId: player.id });
        }
      }
      continue;
    }
    const winnerId = state.winnerId;
    if (!winnerId) {
      continue;
    }
    const winner = state.players.find((player) => player.id === winnerId);
    if (!winner) {
      continue;
    }
    if (
      primitive.type === 'life_below_then_win' &&
      winner.minimumLife <= primitive.threshold
    ) {
      found.push({ challenge, participantId: winner.id });
      continue;
    }
    const last = state.eliminations.at(-1);
    if (
      primitive.type === 'win_by_poison' &&
      last?.cause?.type === 'poison'
    ) {
      found.push({ challenge, participantId: winner.id });
      continue;
    }
    if (
      primitive.type === 'win_by_commander_damage' &&
      last?.cause?.type === 'commander' &&
      commanderById(state, last.cause.commanderId)?.owner.id === winner.id
    ) {
      found.push({ challenge, participantId: winner.id });
    }
  }
  return found;
}

export function detectedConfirmation(
  state: TrackerState,
  pack: ChallengePack = OFFICIAL_COMMANDER_CHALLENGES,
): DetectedChallenge | null {
  if (!state.winnerId || state.eliminations.length < 2) {
    return null;
  }
  const challenge = pack.challenges.find(
    (row) =>
      row.detectionMode === 'confirmation' &&
      row.primitive.type === 'players_eliminated' &&
      state.eliminations.length >= row.primitive.threshold,
  );
  return challenge
    ? { challenge, participantId: state.winnerId }
    : null;
}
