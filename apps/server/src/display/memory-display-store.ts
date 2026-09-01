import { randomUUID } from 'node:crypto';
import type { DisplayConfig } from '@podyguard/shared';
import type {
  DisplayStore,
  NewPendingDisplaySession,
  StoredDisplayAnnouncement,
  StoredDisplaySession,
} from './display-store.js';

export class MemoryDisplayStore implements DisplayStore {
  private readonly sessions = new Map<string, StoredDisplaySession>();
  private readonly announcements = new Map<string, StoredDisplayAnnouncement>();

  async insertPendingSession(
    input: NewPendingDisplaySession,
  ): Promise<StoredDisplaySession> {
    const row: StoredDisplaySession = {
      id: input.id,
      eventId: input.eventId,
      tokenHash: null,
      pairingCodeHash: input.pairingCodeHash,
      pairingCodeLookup: input.pairingCodeLookup,
      pairingExpiresAt: input.pairingExpiresAt,
      pairingAttempts: 0,
      status: 'PENDING',
      label: input.label,
      mode: 'FLOOR',
      showPlayerNames: true,
      showQueues: true,
      showTimers: true,
      createdAt: input.createdAt,
      approvedAt: null,
      lastSeenAt: null,
      revokedAt: null,
    };
    this.sessions.set(row.id, row);
    return { ...row };
  }

  async findSessionById(id: string): Promise<StoredDisplaySession | undefined> {
    const row = this.sessions.get(id);
    return row ? { ...row } : undefined;
  }

  async findSessionByPairingLookup(
    lookup: string,
  ): Promise<StoredDisplaySession | undefined> {
    for (const row of this.sessions.values()) {
      if (row.pairingCodeLookup === lookup) {
        return { ...row };
      }
    }
    return undefined;
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<StoredDisplaySession | undefined> {
    for (const row of this.sessions.values()) {
      if (row.tokenHash === tokenHash) {
        return { ...row };
      }
    }
    return undefined;
  }

  async listSessionsByEventId(eventId: string): Promise<StoredDisplaySession[]> {
    return [...this.sessions.values()]
      .filter((row) => row.eventId === eventId)
      .map((row) => ({ ...row }))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async listActiveSessionsByEventId(
    eventId: string,
  ): Promise<StoredDisplaySession[]> {
    return (await this.listSessionsByEventId(eventId)).filter(
      (row) => row.status === 'ACTIVE',
    );
  }

  async incrementPairingAttempts(id: string): Promise<StoredDisplaySession> {
    const row = this.require(id);
    row.pairingAttempts += 1;
    return { ...row };
  }

  async approveSession(input: {
    id: string;
    eventId: string;
    tokenHash: string;
    label: string;
    config: DisplayConfig;
    approvedAt: Date;
  }): Promise<StoredDisplaySession> {
    const row = this.require(input.id);
    row.eventId = input.eventId;
    row.tokenHash = input.tokenHash;
    row.label = input.label;
    row.mode = input.config.mode;
    row.showPlayerNames = input.config.showPlayerNames;
    row.showQueues = input.config.showQueues;
    row.showTimers = input.config.showTimers;
    row.status = 'ACTIVE';
    row.approvedAt = input.approvedAt;
    row.pairingCodeHash = null;
    row.pairingCodeLookup = null;
    row.pairingExpiresAt = null;
    return { ...row };
  }

  async updateSessionConfig(
    id: string,
    patch: Partial<DisplayConfig> & { label?: string },
  ): Promise<StoredDisplaySession> {
    const row = this.require(id);
    if (patch.label !== undefined) row.label = patch.label;
    if (patch.mode !== undefined) row.mode = patch.mode;
    if (patch.showPlayerNames !== undefined) {
      row.showPlayerNames = patch.showPlayerNames;
    }
    if (patch.showQueues !== undefined) row.showQueues = patch.showQueues;
    if (patch.showTimers !== undefined) row.showTimers = patch.showTimers;
    return { ...row };
  }

  async revokeSession(id: string, revokedAt: Date): Promise<StoredDisplaySession> {
    const row = this.require(id);
    row.status = 'REVOKED';
    row.revokedAt = revokedAt;
    row.tokenHash = null;
    row.pairingCodeHash = null;
    row.pairingCodeLookup = null;
    return { ...row };
  }

  async touchSession(id: string, lastSeenAt: Date): Promise<void> {
    const row = this.sessions.get(id);
    if (row) {
      row.lastSeenAt = lastSeenAt;
    }
  }

  async bindPendingToEvent(
    id: string,
    eventId: string,
  ): Promise<StoredDisplaySession> {
    const row = this.require(id);
    row.eventId = eventId;
    return { ...row };
  }

  async insertAnnouncement(input: {
    id: string;
    eventId: string;
    message: string;
    createdAt: Date;
    endsAt: Date;
  }): Promise<StoredDisplayAnnouncement> {
    const row: StoredDisplayAnnouncement = {
      ...input,
      cancelledAt: null,
    };
    this.announcements.set(row.id, row);
    return { ...row };
  }

  async findActiveAnnouncement(
    eventId: string,
    now: Date,
  ): Promise<StoredDisplayAnnouncement | undefined> {
    const rows = [...this.announcements.values()]
      .filter(
        (row) =>
          row.eventId === eventId &&
          row.cancelledAt === null &&
          row.endsAt.getTime() > now.getTime(),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return rows[0] ? { ...rows[0] } : undefined;
  }

  async cancelAnnouncement(
    id: string,
    eventId: string,
    cancelledAt: Date,
  ): Promise<StoredDisplayAnnouncement | undefined> {
    const row = this.announcements.get(id);
    if (!row || row.eventId !== eventId) {
      return undefined;
    }
    row.cancelledAt = cancelledAt;
    return { ...row };
  }

  async listAnnouncements(
    eventId: string,
  ): Promise<StoredDisplayAnnouncement[]> {
    return [...this.announcements.values()]
      .filter((row) => row.eventId === eventId)
      .map((row) => ({ ...row }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /** Test helper: create an already-approved session without pairing. */
  seedActiveSession(input: {
    eventId: string;
    tokenHash: string;
    label?: string;
    config?: DisplayConfig;
  }): StoredDisplaySession {
    const id = randomUUID();
    const now = new Date();
    const config = input.config;
    const row: StoredDisplaySession = {
      id,
      eventId: input.eventId,
      tokenHash: input.tokenHash,
      pairingCodeHash: null,
      pairingCodeLookup: null,
      pairingExpiresAt: null,
      pairingAttempts: 0,
      status: 'ACTIVE',
      label: input.label ?? 'Main TV',
      mode: config?.mode ?? 'FLOOR',
      showPlayerNames: config?.showPlayerNames ?? true,
      showQueues: config?.showQueues ?? true,
      showTimers: config?.showTimers ?? true,
      createdAt: now,
      approvedAt: now,
      lastSeenAt: now,
      revokedAt: null,
    };
    this.sessions.set(id, row);
    return { ...row };
  }

  private require(id: string): StoredDisplaySession {
    const row = this.sessions.get(id);
    if (!row) {
      throw new Error(`Display session ${id} not found.`);
    }
    return row;
  }
}
