import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { CommanderSelection } from '@podyguard/shared';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 32;

export async function hashHostPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(pin, salt, KEY_LENGTH)) as Buffer;
  return `scrypt:${salt.toString('base64url')}:${derived.toString('base64url')}`;
}

export async function verifyHostPin(
  pin: string,
  stored: string,
): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split(':');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) {
    return false;
  }

  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(hashB64, 'base64url');
  const derived = (await scryptAsync(pin, salt, KEY_LENGTH)) as Buffer;
  if (derived.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(derived, expected);
}

export function assertEventName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 1 || trimmed.length > 80) {
    throw new InvalidEventInputError(
      'Event name must be between 1 and 80 characters.',
    );
  }
  return trimmed;
}

export function assertHostPin(pin: string): string {
  if (!/^\d{4,8}$/.test(pin)) {
    throw new InvalidEventInputError(
      'Host PIN must be 4 to 8 digits.',
    );
  }
  return pin;
}

export function assertDisplayName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 1 || trimmed.length > 24) {
    throw new InvalidEventInputError(
      'Display name must be between 1 and 24 characters.',
    );
  }
  return trimmed;
}

export function assertTableLabel(label: string): string {
  const trimmed = label.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 1 || trimmed.length > 24) {
    throw new InvalidEventInputError(
      'Table label must be between 1 and 24 characters.',
    );
  }
  return trimmed;
}

export function assertTableCount(count: number): number {
  if (!Number.isInteger(count) || count < 1 || count > 40) {
    throw new InvalidEventInputError('Choose between 1 and 40 tables.');
  }
  return count;
}

export type DeckDraft = {
  name?: string;
  poolId: string;
  preference?: 'preferred' | 'accepted';
  commanders?: CommanderSelection[];
};

export function assertDecks(input: DeckDraft[]): Array<{
  name: string | null;
  poolId: string;
  preference: 'preferred' | 'accepted';
  commanders: CommanderSelection[];
}> {
  if (input.length < 1 || input.length > 8) {
    throw new InvalidEventInputError('Register between 1 and 8 decks.');
  }
  const decks = input.map((row, index) => {
    const poolId = row.poolId.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,23}$/.test(poolId)) {
      throw new InvalidEventInputError('Each deck needs a valid pool.');
    }
    const name = row.name?.trim().replace(/\s+/g, ' ') ?? '';
    if (name.length > 40) {
      throw new InvalidEventInputError('Deck names must be at most 40 characters.');
    }
    const preference =
      row.preference === 'accepted' || row.preference === 'preferred'
        ? row.preference
        : index === 0
          ? 'preferred'
          : 'accepted';
    const commanders = assertCommanders(row.commanders ?? []);
    return {
      name: name.length > 0 ? name : null,
      poolId,
      preference,
      commanders,
    };
  });
  const preferredCount = decks.filter((row) => row.preference === 'preferred').length;
  if (preferredCount === 0) {
    const first = decks[0];
    if (first) {
      first.preference = 'preferred';
    }
  }
  if (decks.filter((row) => row.preference === 'preferred').length !== 1) {
    throw new InvalidEventInputError('Mark exactly one deck as preferred.');
  }
  return decks;
}

function assertCommanders(input: CommanderSelection[]): CommanderSelection[] {
  if (!Array.isArray(input) || input.length > 2) {
    throw new InvalidEventInputError('Each deck can have at most 2 commanders.');
  }
  return input.map((commander) => {
    if (typeof commander !== 'object' || commander === null) {
      throw new InvalidEventInputError('Each commander is invalid.');
    }
    const oracleId = requiredString(commander.oracleId, 'oracle ID', 100);
    const cardId = requiredString(commander.cardId, 'card ID', 100);
    const name = requiredString(commander.name, 'name', 200);
    const artCropUri = requiredString(commander.artCropUri, 'art URL', 2_000);
    const typeLine = requiredString(commander.typeLine, 'type line', 500);
    const oracleText = boundedString(commander.oracleText, 'oracle text', 20_000);
    if (!isHttpUrl(artCropUri)) {
      throw new InvalidEventInputError('Commander art URL must be a valid HTTP URL.');
    }
    if (
      !Array.isArray(commander.keywords) ||
      commander.keywords.length > 100 ||
      commander.keywords.some((keyword) => typeof keyword !== 'string')
    ) {
      throw new InvalidEventInputError('Commander keywords must be a list of strings.');
    }
    return {
      oracleId,
      cardId,
      name,
      artCropUri,
      typeLine,
      oracleText,
      keywords: commander.keywords.map((keyword) =>
        boundedString(keyword, 'keyword', 200),
      ),
    };
  });
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  const normalized = boundedString(value, field, maxLength).trim();
  if (normalized.length === 0) {
    throw new InvalidEventInputError(`Commander ${field} is required.`);
  }
  return normalized;
}

function boundedString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new InvalidEventInputError(
      `Commander ${field} must be a string of at most ${maxLength} characters.`,
    );
  }
  return value;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export class InvalidEventInputError extends Error {
  readonly code = 'INVALID_EVENT_INPUT';

  constructor(message: string) {
    super(message);
    this.name = 'InvalidEventInputError';
  }
}
