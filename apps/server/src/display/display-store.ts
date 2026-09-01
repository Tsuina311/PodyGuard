import type {
  DisplayConfig,
  DisplayMode,
  DisplaySessionStatus,
} from '@podyguard/shared';

export type StoredDisplaySession = {
  id: string;
  eventId: string | null;
  tokenHash: string | null;
  pairingCodeHash: string | null;
  pairingCodeLookup: string | null;
  pairingExpiresAt: Date | null;
  pairingAttempts: number;
  status: DisplaySessionStatus;
  label: string;
  mode: DisplayMode;
  showPlayerNames: boolean;
  showQueues: boolean;
  showTimers: boolean;
  createdAt: Date;
  approvedAt: Date | null;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
};

export type StoredDisplayAnnouncement = {
  id: string;
  eventId: string;
  message: string;
  createdAt: Date;
  endsAt: Date;
  cancelledAt: Date | null;
};

export type NewPendingDisplaySession = {
  id: string;
  eventId: string | null;
  pairingCodeHash: string;
  pairingCodeLookup: string;
  pairingExpiresAt: Date;
  label: string;
  createdAt: Date;
};

export type DisplayStore = {
  insertPendingSession(input: NewPendingDisplaySession): Promise<StoredDisplaySession>;
  findSessionById(id: string): Promise<StoredDisplaySession | undefined>;
  findSessionByPairingLookup(
    lookup: string,
  ): Promise<StoredDisplaySession | undefined>;
  findSessionByTokenHash(
    tokenHash: string,
  ): Promise<StoredDisplaySession | undefined>;
  listSessionsByEventId(eventId: string): Promise<StoredDisplaySession[]>;
  listActiveSessionsByEventId(eventId: string): Promise<StoredDisplaySession[]>;
  incrementPairingAttempts(id: string): Promise<StoredDisplaySession>;
  approveSession(input: {
    id: string;
    eventId: string;
    tokenHash: string;
    label: string;
    config: DisplayConfig;
    approvedAt: Date;
  }): Promise<StoredDisplaySession>;
  updateSessionConfig(
    id: string,
    patch: Partial<DisplayConfig> & { label?: string },
  ): Promise<StoredDisplaySession>;
  revokeSession(id: string, revokedAt: Date): Promise<StoredDisplaySession>;
  touchSession(id: string, lastSeenAt: Date): Promise<void>;
  bindPendingToEvent(
    id: string,
    eventId: string,
  ): Promise<StoredDisplaySession>;
  insertAnnouncement(input: {
    id: string;
    eventId: string;
    message: string;
    createdAt: Date;
    endsAt: Date;
  }): Promise<StoredDisplayAnnouncement>;
  findActiveAnnouncement(
    eventId: string,
    now: Date,
  ): Promise<StoredDisplayAnnouncement | undefined>;
  cancelAnnouncement(
    id: string,
    eventId: string,
    cancelledAt: Date,
  ): Promise<StoredDisplayAnnouncement | undefined>;
  listAnnouncements(eventId: string): Promise<StoredDisplayAnnouncement[]>;
};
