import {
  poolLabel,
  type EventSnapshot,
  type PublicParticipant,
  type PublicTable,
} from '@podyguard/shared';

export function tableForParticipant(
  snapshot: EventSnapshot | null,
  participant: PublicParticipant | null,
): PublicTable | undefined {
  if (!snapshot || !participant?.tableLabel) {
    return undefined;
  }
  return snapshot.tables.find((row) => row.label === participant.tableLabel);
}

export function assignedDeckLine(participant: PublicParticipant): string {
  if (participant.assignedDeckName) {
    return participant.assignedDeckName;
  }
  if (participant.assignedPoolId) {
    return poolLabel(participant.assignedPoolId);
  }
  return 'Assigned at the table';
}

export function countByStatus(participants: PublicParticipant[]) {
  return {
    ready: participants.filter((row) => row.status === 'ready').length,
    matched: participants.filter((row) => row.status === 'matched').length,
    playing: participants.filter((row) => row.status === 'playing').length,
    paused: participants.filter((row) => row.status === 'paused').length,
  };
}

export function queueByWait(participants: PublicParticipant[]): PublicParticipant[] {
  return participants
    .filter((row) => row.status === 'ready')
    .sort((left, right) => {
      const leftAt = left.readyAt ? Date.parse(left.readyAt) : Number.POSITIVE_INFINITY;
      const rightAt = right.readyAt ? Date.parse(right.readyAt) : Number.POSITIVE_INFINITY;
      return leftAt - rightAt;
    });
}
