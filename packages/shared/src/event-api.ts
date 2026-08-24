import type {
  EventStatus,
  ParticipantStatus,
  PhysicalTableStatus,
} from './enums';

export type PublicEvent = {
  id: string;
  name: string;
  joinCode: string;
  status: EventStatus;
  allowThreePods: boolean;
  allowFivePods: boolean;
};

export type CommanderSelection = {
  oracleId: string;
  cardId: string;
  name: string;
  artCropUri: string;
  typeLine: string;
  oracleText: string;
  keywords: string[];
};

export type PublicDeck = {
  id: string;
  name?: string;
  poolId: string;
  preference: 'preferred' | 'accepted';
  commanders: CommanderSelection[];
};

export type PublicParticipant = {
  id: string;
  displayName: string;
  status: ParticipantStatus;
  isBot: boolean;
  tableLabel?: string;
  readyAt?: string;
  decks: PublicDeck[];
  assignedPoolId?: string;
  assignedDeckName?: string;
  assignedCommanders: CommanderSelection[];
  flexCredits: number;
};

export type PublicTable = {
  id: string;
  label: string;
  sortOrder: number;
  status: PhysicalTableStatus;
  seatedNames: string[];
  podStatus?: 'formed' | 'playing';
  poolId?: string;
};

export type EventSnapshot = {
  event: PublicEvent;
  participants: PublicParticipant[];
  tables: PublicTable[];
};

export type PublicPod = {
  id: string;
  tableLabel: string;
  playerNames: string[];
  status: 'formed' | 'playing' | 'completed' | 'cancelled';
  poolId?: string;
};
