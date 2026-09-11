/**
 * Single physical-table claim ledger helpers.
 *
 * Source of truth for "who owns this table right now" is an active
 * `table_reservations` row (released_at IS NULL). `physical_tables.status`
 * mirrors occupancy for host ops and legacy matchers.
 *
 * Stale release rule: only the matching ownerType+ownerId may free a claim.
 * A late Round-2 cleanup must never clear Round-3's reservation.
 */

export const TABLE_OWNER_TYPES = [
  'LIMITED_SESSION',
  'LIMITED_MATCH',
  'POD',
  'ROUND_ASSIGNMENT',
  'MANUAL_RESERVATION',
] as const;

export type TableOwnerType = (typeof TABLE_OWNER_TYPES)[number];

export const TABLE_RESERVATION_PURPOSES = [
  'DRAFT',
  'MATCH',
  'PLAY',
  'ROUND',
  'HOLD',
] as const;

export type TableReservationPurpose =
  (typeof TABLE_RESERVATION_PURPOSES)[number];

export type TableClaim = {
  tableId: string;
  ownerType: TableOwnerType;
  ownerId: string;
  purpose: TableReservationPurpose;
};

export class TableConflictError extends Error {
  readonly code = 'TABLE_CONFLICT';
  readonly tableId: string;
  readonly existingOwnerType?: string;
  readonly existingOwnerId?: string;

  constructor(
    message: string,
    tableId: string,
    existing?: { ownerType: string; ownerId: string },
  ) {
    super(message);
    this.name = 'TableConflictError';
    this.tableId = tableId;
    this.existingOwnerType = existing?.ownerType;
    this.existingOwnerId = existing?.ownerId;
  }
}

export function roundAssignmentOwnerId(
  roundId: string,
  assignmentId: string,
): string {
  // Deterministic synthetic id for ROUND_ASSIGNMENT claims. Stored as text/uuid
  // in Limited code paths; memory store uses string keys. Prefer a stable string
  // that embeds both ids so release can target one assignment.
  return `${roundId}:${assignmentId}`;
}

export function describeTableOwner(ownerType: string): string {
  switch (ownerType) {
    case 'LIMITED_SESSION':
      return 'a Limited draft/session';
    case 'LIMITED_MATCH':
      return 'a Limited match';
    case 'POD':
      return 'a rolling/tournament match';
    case 'ROUND_ASSIGNMENT':
      return 'a synchronized round assignment';
    case 'MANUAL_RESERVATION':
      return 'a manual reservation';
    default:
      return 'another activity';
  }
}

export function tableConflictMessage(
  tableLabel: string,
  ownerType: string,
): string {
  return `Table ${tableLabel} is reserved by ${describeTableOwner(ownerType)}.`;
}
