import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  DEFAULT_DISPLAY_CONFIG,
  DISPLAY_MODES,
  type DisplayConfig,
  type DisplayMode,
  type HostDisplaySession,
  type PublicDisplayAnnouncement,
  type PublicDisplayEventState,
} from '@podyguard/shared';
import type { EventService } from '../events/event-service.js';
import type { DisplayStore, StoredDisplaySession } from './display-store.js';
import {
  configFromSession,
  projectPublicDisplayState,
} from './project-display-state.js';

export class DisplayPairingExpiredError extends Error {
  readonly code = 'DISPLAY_PAIRING_EXPIRED';
  constructor() {
    super('This pairing code has expired. Open /display again.');
    this.name = 'DisplayPairingExpiredError';
  }
}

export class DisplayPairingInvalidError extends Error {
  readonly code = 'DISPLAY_PAIRING_INVALID';
  constructor() {
    super('That pairing code is not valid.');
    this.name = 'DisplayPairingInvalidError';
  }
}

export class DisplayPairingRateLimitedError extends Error {
  readonly code = 'DISPLAY_PAIRING_RATE_LIMITED';
  constructor() {
    super('Too many pairing attempts. Wait and try again.');
    this.name = 'DisplayPairingRateLimitedError';
  }
}

export class DisplayUnauthorizedError extends Error {
  readonly code = 'DISPLAY_UNAUTHORIZED';
  constructor() {
    super('This display is no longer authorized.');
    this.name = 'DisplayUnauthorizedError';
  }
}

export class DisplayNotFoundError extends Error {
  readonly code = 'DISPLAY_NOT_FOUND';
  constructor() {
    super('Display not found.');
    this.name = 'DisplayNotFoundError';
  }
}

export class InvalidDisplayAnnouncementError extends Error {
  readonly code = 'INVALID_DISPLAY_ANNOUNCEMENT';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDisplayAnnouncementError';
  }
}

const PAIRING_TTL_MS = 10 * 60_000;
const PAIRING_MAX_ATTEMPTS = 8;
const CONNECTED_WITHIN_MS = 45_000;
const DEFAULT_ANNOUNCEMENT_SECONDS = 30;
const MAX_ANNOUNCEMENT_SECONDS = 300;
const MAX_ANNOUNCEMENT_LENGTH = 160;
const APPROVE_GUESS_WINDOW_MS = 15 * 60_000;
const APPROVE_GUESS_MAX = 20;

export class DisplayService {
  /** One-time claim envelopes after host approval (raw token never persisted). */
  private readonly claimTokens = new Map<
    string,
    { token: string; expiresAt: number }
  >();
  /** Failed approve guesses per event (short codes are guessable). */
  private readonly approveGuesses = new Map<
    string,
    { count: number; windowStartedAt: number }
  >();

  constructor(
    private readonly store: DisplayStore,
    private readonly events: EventService,
    private readonly tokenSecret: string,
  ) {}

  async beginPairing(): Promise<{
    sessionId: string;
    pairingCode: string;
    expiresAt: string;
  }> {
    const pairingCode = formatPairingCode(randomInt(0, 1_000_000));
    const lookup = pairingLookupKey(pairingCode);
    if (await this.store.findSessionByPairingLookup(lookup)) {
      return this.beginPairing();
    }
    const id = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);
    await this.store.insertPendingSession({
      id,
      eventId: null,
      pairingCodeHash: hashPairingCode(pairingCode, this.tokenSecret),
      pairingCodeLookup: lookup,
      pairingExpiresAt: expiresAt,
      label: 'Display',
      createdAt: now,
    });
    return {
      sessionId: id,
      pairingCode,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async pollPairing(sessionId: string): Promise<{
    status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'REVOKED';
    expiresAt?: string;
  }> {
    const session = await this.store.findSessionById(sessionId);
    if (!session) {
      return { status: 'EXPIRED' };
    }
    if (session.status === 'REVOKED') {
      return { status: 'REVOKED' };
    }
    if (session.status === 'ACTIVE') {
      return { status: 'ACTIVE' };
    }
    if (
      !session.pairingExpiresAt ||
      session.pairingExpiresAt.getTime() <= Date.now()
    ) {
      return { status: 'EXPIRED' };
    }
    return {
      status: 'PENDING',
      expiresAt: session.pairingExpiresAt.toISOString(),
    };
  }

  /**
   * Display claims the permanent token once after the host approves pairing.
   * The short pairing code is never the long-lived credential.
   */
  async claimToken(sessionId: string): Promise<{ token: string }> {
    const session = await this.store.findSessionById(sessionId);
    if (!session || session.status !== 'ACTIVE') {
      throw new DisplayUnauthorizedError();
    }
    const claim = this.claimTokens.get(sessionId);
    if (!claim || claim.expiresAt < Date.now()) {
      this.claimTokens.delete(sessionId);
      throw new DisplayUnauthorizedError();
    }
    this.claimTokens.delete(sessionId);
    return { token: claim.token };
  }

  async approvePairing(
    joinCode: string,
    hostToken: string,
    input: {
      pairingCode: string;
      label?: string;
      mode?: DisplayMode;
      showPlayerNames?: boolean;
    },
  ): Promise<HostDisplaySession> {
    const event = await this.events.verifyHostToken(joinCode, hostToken);
    this.assertApproveGuessBudget(event.id);

    const code = normalizePairingCode(input.pairingCode);
    if (!code) {
      this.recordApproveGuess(event.id);
      throw new DisplayPairingInvalidError();
    }
    const session = await this.store.findSessionByPairingLookup(
      pairingLookupKey(code),
    );
    if (!session || session.status !== 'PENDING') {
      this.recordApproveGuess(event.id);
      throw new DisplayPairingInvalidError();
    }
    if (session.pairingAttempts >= PAIRING_MAX_ATTEMPTS) {
      throw new DisplayPairingRateLimitedError();
    }
    if (
      !session.pairingExpiresAt ||
      session.pairingExpiresAt.getTime() <= Date.now()
    ) {
      throw new DisplayPairingExpiredError();
    }
    const expected = session.pairingCodeHash;
    if (
      !expected ||
      !safeEqual(
        Buffer.from(expected),
        Buffer.from(hashPairingCode(code, this.tokenSecret)),
      )
    ) {
      await this.store.incrementPairingAttempts(session.id);
      this.recordApproveGuess(event.id);
      throw new DisplayPairingInvalidError();
    }

    this.clearApproveGuesses(event.id);
    const rawToken = issueDisplayToken();
    const config: DisplayConfig = {
      ...DEFAULT_DISPLAY_CONFIG,
      mode:
        input.mode && DISPLAY_MODES.includes(input.mode) ? input.mode : 'FLOOR',
      showPlayerNames: input.showPlayerNames ?? true,
    };
    const approvedAt = new Date();
    const approved = await this.store.approveSession({
      id: session.id,
      eventId: event.id,
      tokenHash: hashDisplayToken(rawToken, this.tokenSecret),
      label: sanitizeLabel(input.label) ?? 'Display',
      config,
      approvedAt,
    });
    this.claimTokens.set(session.id, {
      token: rawToken,
      expiresAt: Date.now() + PAIRING_TTL_MS,
    });
    return toHostDisplay(approved, approvedAt);
  }

  async listDisplays(
    joinCode: string,
    hostToken: string,
  ): Promise<HostDisplaySession[]> {
    const event = await this.events.verifyHostToken(joinCode, hostToken);
    const rows = await this.store.listSessionsByEventId(event.id);
    const now = new Date();
    return rows
      .filter((row) => row.status !== 'PENDING')
      .map((row) => toHostDisplay(row, now));
  }

  async updateDisplay(
    joinCode: string,
    hostToken: string,
    displayId: string,
    patch: Partial<DisplayConfig> & { label?: string },
  ): Promise<HostDisplaySession> {
    const event = await this.events.verifyHostToken(joinCode, hostToken);
    const session = await this.store.findSessionById(displayId);
    if (
      !session ||
      session.eventId !== event.id ||
      session.status !== 'ACTIVE'
    ) {
      throw new DisplayNotFoundError();
    }
    if (patch.mode && !DISPLAY_MODES.includes(patch.mode)) {
      throw new InvalidDisplayAnnouncementError('Invalid display mode.');
    }
    const updated = await this.store.updateSessionConfig(displayId, {
      ...patch,
      ...(patch.label !== undefined
        ? { label: sanitizeLabel(patch.label) ?? session.label }
        : {}),
    });
    return toHostDisplay(updated, new Date());
  }

  async revokeDisplay(
    joinCode: string,
    hostToken: string,
    displayId: string,
  ): Promise<HostDisplaySession> {
    const event = await this.events.verifyHostToken(joinCode, hostToken);
    const session = await this.store.findSessionById(displayId);
    if (!session || session.eventId !== event.id) {
      throw new DisplayNotFoundError();
    }
    const revoked = await this.store.revokeSession(displayId, new Date());
    this.claimTokens.delete(displayId);
    return toHostDisplay(revoked, new Date());
  }

  async createAnnouncement(
    joinCode: string,
    hostToken: string,
    input: { message: string; durationSeconds?: number },
  ): Promise<PublicDisplayAnnouncement> {
    const event = await this.events.verifyHostToken(joinCode, hostToken);
    const message = sanitizeAnnouncement(input.message);
    const duration = clampDuration(input.durationSeconds);
    const createdAt = new Date();
    const endsAt = new Date(createdAt.getTime() + duration * 1000);
    const row = await this.store.insertAnnouncement({
      id: randomUUID(),
      eventId: event.id,
      message,
      createdAt,
      endsAt,
    });
    return {
      id: row.id,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
    };
  }

  async cancelAnnouncement(
    joinCode: string,
    hostToken: string,
    announcementId: string,
  ): Promise<void> {
    const event = await this.events.verifyHostToken(joinCode, hostToken);
    const cancelled = await this.store.cancelAnnouncement(
      announcementId,
      event.id,
      new Date(),
    );
    if (!cancelled) {
      throw new DisplayNotFoundError();
    }
  }

  async requireActiveSession(token: string): Promise<StoredDisplaySession> {
    const session = await this.store.findSessionByTokenHash(
      hashDisplayToken(token, this.tokenSecret),
    );
    if (!session || session.status !== 'ACTIVE' || !session.eventId) {
      throw new DisplayUnauthorizedError();
    }
    return session;
  }

  async getStateForToken(token: string): Promise<PublicDisplayEventState> {
    const session = await this.requireActiveSession(token);
    await this.store.touchSession(session.id, new Date());
    return this.projectForSession(session);
  }

  async listActiveProjectionsForJoinCode(
    joinCode: string,
  ): Promise<Array<{ sessionId: string; state: PublicDisplayEventState }>> {
    const source = await this.events.getDisplaySource(joinCode);
    const sessions = await this.store.listActiveSessionsByEventId(
      source.eventId,
    );
    const announcement = await this.activeAnnouncement(source.eventId);
    return sessions.map((session) => ({
      sessionId: session.id,
      state: projectPublicDisplayState({
        snapshot: source.snapshot,
        config: configFromSession(session),
        pods: source.pods,
        announcement,
      }),
    }));
  }

  private async projectForSession(
    session: StoredDisplaySession,
  ): Promise<PublicDisplayEventState> {
    if (!session.eventId) {
      throw new DisplayUnauthorizedError();
    }
    const joinCode = await this.events.getJoinCodeByEventId(session.eventId);
    if (!joinCode) {
      throw new DisplayUnauthorizedError();
    }
    const source = await this.events.getDisplaySource(joinCode);
    return projectPublicDisplayState({
      snapshot: source.snapshot,
      config: configFromSession(session),
      pods: source.pods,
      announcement: await this.activeAnnouncement(session.eventId),
    });
  }

  private async activeAnnouncement(
    eventId: string,
  ): Promise<PublicDisplayAnnouncement | null> {
    const row = await this.store.findActiveAnnouncement(eventId, new Date());
    if (!row) return null;
    return {
      id: row.id,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
    };
  }

  private assertApproveGuessBudget(eventId: string): void {
    const entry = this.approveGuesses.get(eventId);
    if (!entry) return;
    if (Date.now() - entry.windowStartedAt > APPROVE_GUESS_WINDOW_MS) {
      this.approveGuesses.delete(eventId);
      return;
    }
    if (entry.count >= APPROVE_GUESS_MAX) {
      throw new DisplayPairingRateLimitedError();
    }
  }

  private recordApproveGuess(eventId: string): void {
    const now = Date.now();
    const entry = this.approveGuesses.get(eventId);
    if (!entry || now - entry.windowStartedAt > APPROVE_GUESS_WINDOW_MS) {
      this.approveGuesses.set(eventId, { count: 1, windowStartedAt: now });
      return;
    }
    entry.count += 1;
  }

  private clearApproveGuesses(eventId: string): void {
    this.approveGuesses.delete(eventId);
  }
}

function issueDisplayToken(): string {
  return `ds1.${randomBytes(32).toString('base64url')}`;
}

export function hashDisplayToken(token: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`display-token:${token}`)
    .digest('base64url');
}

function hashPairingCode(code: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`display-pair:${code}`)
    .digest('base64url');
}

function pairingLookupKey(code: string): string {
  return createHash('sha256')
    .update(`display-pair-lookup:${code}`)
    .digest('base64url');
}

function formatPairingCode(value: number): string {
  const padded = value.toString().padStart(6, '0');
  return `${padded.slice(0, 3)} ${padded.slice(3)}`;
}

function normalizePairingCode(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 6) {
    return null;
  }
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

function sanitizeLabel(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim().replace(/\s+/g, ' ').slice(0, 40);
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeAnnouncement(message: string): string {
  const trimmed = message
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
  if (trimmed.length < 1 || trimmed.length > MAX_ANNOUNCEMENT_LENGTH) {
    throw new InvalidDisplayAnnouncementError(
      `Announcement must be 1–${MAX_ANNOUNCEMENT_LENGTH} characters.`,
    );
  }
  return trimmed.replace(/[<>]/g, '');
}

function clampDuration(seconds: number | undefined): number {
  if (seconds === undefined || !Number.isFinite(seconds)) {
    return DEFAULT_ANNOUNCEMENT_SECONDS;
  }
  return Math.min(MAX_ANNOUNCEMENT_SECONDS, Math.max(5, Math.floor(seconds)));
}

function toHostDisplay(
  row: StoredDisplaySession,
  now: Date,
): HostDisplaySession {
  const lastSeenAt = row.lastSeenAt?.toISOString();
  const connected =
    row.status === 'ACTIVE' &&
    Boolean(row.lastSeenAt) &&
    now.getTime() - (row.lastSeenAt?.getTime() ?? 0) <= CONNECTED_WITHIN_MS;
  return {
    id: row.id,
    label: row.label,
    status: row.status,
    config: configFromSession(row),
    connected,
    ...(lastSeenAt ? { lastSeenAt } : {}),
    ...(row.approvedAt ? { approvedAt: row.approvedAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
