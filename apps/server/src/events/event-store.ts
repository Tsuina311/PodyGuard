import type {
  CommanderSelection,
  PublicEvent,
  PublicParticipant,
  PublicPod,
  PublicTable,
} from '@podyguard/shared';

export class EventNotFoundError extends Error {
  readonly code = 'EVENT_NOT_FOUND';

  constructor() {
    super('Event not found.');
    this.name = 'EventNotFoundError';
  }
}

export class EventNotJoinableError extends Error {
  readonly code = 'EVENT_NOT_JOINABLE';

  constructor() {
    super('This event is not accepting new participants.');
    this.name = 'EventNotJoinableError';
  }
}

export class InvalidHostPinError extends Error {
  readonly code = 'INVALID_HOST_PIN';

  constructor() {
    super('Host PIN is incorrect.');
    this.name = 'InvalidHostPinError';
  }
}

export class JoinCodeConflictError extends Error {
  readonly code = 'JOIN_CODE_CONFLICT';

  constructor() {
    super('Join code already exists.');
    this.name = 'JoinCodeConflictError';
  }
}

export class InvalidParticipantTransitionError extends Error {
  readonly code = 'INVALID_PARTICIPANT_TRANSITION';

  constructor(message = 'That status change is not allowed.') {
    super(message);
    this.name = 'InvalidParticipantTransitionError';
  }
}

export class TableNotFoundError extends Error {
  readonly code = 'TABLE_NOT_FOUND';

  constructor() {
    super('Table not found.');
    this.name = 'TableNotFoundError';
  }
}

export class DevToolsDisabledError extends Error {
  readonly code = 'DEV_TOOLS_DISABLED';

  constructor() {
    super('Developer tools are only available in development.');
    this.name = 'DevToolsDisabledError';
  }
}

export class PodNotFoundError extends Error {
  readonly code = 'POD_NOT_FOUND';

  constructor() {
    super('No active pod is seated at that table.');
    this.name = 'PodNotFoundError';
  }
}

export type StoredEvent = {
  id: string;
  name: string;
  joinCode: string;
  status: PublicEvent['status'];
  hostCredentialHash: string;
  allowThreePods: boolean;
  allowFivePods: boolean;
  createdAt: Date;
};

export type StoredParticipant = {
  id: string;
  eventId: string;
  displayName: string;
  isBot: boolean;
  status: PublicParticipant['status'];
  readyAt: Date | null;
  flexCredits: number;
  createdAt: Date;
};

export type StoredAssignment = {
  podId: string;
  participantId: string;
  tableId: string;
  tableLabel: string;
  podStatus: 'formed' | 'playing';
  poolId?: string;
  deckName?: string;
  commanders: CommanderSelection[];
};

export type StoredDeck = {
  id: string;
  participantId: string;
  name: string | null;
  poolId: string;
  preference: 'preferred' | 'accepted';
  commanders: CommanderSelection[];
};

export type StoredPod = PublicPod & {
  eventId: string;
  tableId: string;
  memberIds: string[];
};

export type NewStoredDeck = {
  participantId: string;
  name: string | null;
  poolId: string;
  preference: 'preferred' | 'accepted';
  commanders: CommanderSelection[];
};

export type StoredTable = {
  id: string;
  eventId: string;
  label: string;
  sortOrder: number;
  status: PublicTable['status'];
  createdAt: Date;
};

export type NewStoredEvent = {
  name: string;
  joinCode: string;
  hostCredentialHash: string;
  allowThreePods?: boolean;
  allowFivePods?: boolean;
};

export type NewStoredParticipant = {
  eventId: string;
  displayName: string;
  isBot?: boolean;
  status?: StoredParticipant['status'];
  readyAt?: Date | null;
};

export type NewStoredPod = {
  eventId: string;
  tableId: string;
  poolId: string;
  seats: Array<{
    participantId: string;
    deckId: string;
    assignedPoolId: string;
  }>;
};

export type NewStoredTable = {
  eventId: string;
  label: string;
  sortOrder: number;
};

export interface EventStore {
  insertEvent(input: NewStoredEvent): Promise<StoredEvent>;
  findEventByJoinCode(joinCode: string): Promise<StoredEvent | undefined>;
  findEventById(id: string): Promise<StoredEvent | undefined>;
  insertParticipant(input: NewStoredParticipant): Promise<StoredParticipant>;
  findParticipantById(id: string): Promise<StoredParticipant | undefined>;
  listParticipants(eventId: string): Promise<StoredParticipant[]>;
  updateParticipant(
    id: string,
    patch: {
      status: StoredParticipant['status'];
      readyAt: Date | null;
      flexCredits?: number;
    },
  ): Promise<StoredParticipant>;
  insertTable(input: NewStoredTable): Promise<StoredTable>;
  listTables(eventId: string): Promise<StoredTable[]>;
  findTableById(id: string): Promise<StoredTable | undefined>;
  updateTableStatus(
    id: string,
    status: StoredTable['status'],
  ): Promise<StoredTable>;
  createPod(input: NewStoredPod): Promise<StoredPod>;
  listAssignments(eventId: string): Promise<StoredAssignment[]>;
  listDecks(eventId: string): Promise<StoredDeck[]>;
  replaceDecks(
    participantId: string,
    decks: NewStoredDeck[],
  ): Promise<StoredDeck[]>;
  listMatchHistory(eventId: string): Promise<string[][]>;
  findActivePodByTableId(
    eventId: string,
    tableId: string,
  ): Promise<StoredPod | undefined>;
  startPod(podId: string): Promise<StoredPod>;
  completePod(podId: string): Promise<StoredPod>;
  cancelPod(podId: string): Promise<StoredPod>;
  updateEvent(
    id: string,
    patch: { allowThreePods?: boolean; allowFivePods?: boolean },
  ): Promise<StoredEvent>;
}
