export type PregameAgreement = {
  pace?: 'relaxed' | 'focused';
  durationMinutes?: number;
  notes?: string;
};
export type GameNight = {
  eventSetup?: InvitationEventSetup;
  invitees?: NightInvitee[];
  id: string;
  playgroupId: string;
  name: string;
  startsAt: string;
  timeZone: string;
  location: string;
  seatTarget: number;
  agreement: PregameAgreement;
  cancelled: boolean;
  eventJoinCode: string | null;
  createdAt: string;
};
export type GameNightInput = Pick<
  GameNight,
  'name' | 'startsAt' | 'timeZone' | 'location' | 'seatTarget' | 'agreement'
> & { eventSetup?: InvitationEventSetup; invitedGuestIds?: string[] };
export type NightRsvp = {
  guestProfileId?: string;
  displayName: string;
  response: 'yes' | 'maybe' | 'no';
};
export type NightView = { night: GameNight; responses: NightRsvp[] };

export function gameNightEventType(night: Pick<GameNight, 'eventSetup'>): string {
  const setup = night.eventSetup;
  const limited = setup?.limitedModeConfigs?.filter(config => config.enabled);
  if (limited?.length) return limited.map(config => ({ BOOSTER_DRAFT: 'Booster Draft', PICK_TWO_DRAFT: 'Pick-Two Draft', SEALED: 'Sealed' })[config.mode]).join(' + ');
  const mode = setup?.gameMode ?? 'commander';
  const commander = setup?.rulesFormat === 'commander' || (!setup?.rulesFormat && ['commander', 'duel-commander', 'brawl', 'archenemy-commander'].includes(mode));
  const label = ['duel', 'duel-commander'].includes(mode) ? 'Duel'
    : ['commander', 'multiplayer'].includes(mode) ? 'Multiplayer'
      : mode === 'archenemy-commander' ? 'Archenemy'
        : mode.split('-').map(word => word[0]!.toUpperCase() + word.slice(1)).join(' ');
  return `${commander ? 'Commander' : 'Classic'} · ${label}`;
}

export function parsePregameAgreement(value: unknown): PregameAgreement {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid pregame agreement.');
  const v = value as Record<string, unknown>;
  if (
    v.pace !== undefined &&
    v.pace !== '' &&
    v.pace !== 'relaxed' &&
    v.pace !== 'focused'
  )
    throw new Error('Choose a valid pace.');
  if (
    v.durationMinutes !== undefined &&
    (!Number.isInteger(v.durationMinutes) ||
      Number(v.durationMinutes) < 15 ||
      Number(v.durationMinutes) > 480)
  )
    throw new Error('Game length must be 15–480 minutes.');
  if (
    v.notes !== undefined &&
    (typeof v.notes !== 'string' || v.notes.length > 500)
  )
    throw new Error('Keep table preferences within 500 characters.');
  return {
    ...(v.pace ? { pace: v.pace as 'relaxed' | 'focused' } : {}),
    ...(v.durationMinutes !== undefined
      ? { durationMinutes: Number(v.durationMinutes) }
      : {}),
    ...(typeof v.notes === 'string' && v.notes.trim()
      ? { notes: v.notes.trim() }
      : {}),
  };
}

function icsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}
export function gameNightCalendar(night: GameNight): string {
  const stamp = (s: string) =>
    new Date(s)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PodyGuard//Game nights//EN',
    'BEGIN:VEVENT',
    `UID:${night.id}@podyguard`,
    `DTSTAMP:${stamp(night.createdAt)}`,
    `DTSTART:${stamp(night.startsAt)}`,
    `SUMMARY:${icsText(night.name)}`,
    `LOCATION:${icsText(night.location)}`,
    `DESCRIPTION:${icsText(`${gameNightEventType(night)} (${night.timeZone}). Attendance does not mark you ready to play.${night.invitees?.length ? ` Invited: ${night.invitees.map(person => person.displayName).join(', ')}.` : ''}`)}`,
    ...(night.cancelled ? ['STATUS:CANCELLED'] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  // RFC 5545 folds at 75 UTF-8 octets, without splitting a code point.
  return (
    lines
      .map((line) => {
        const parts: string[] = [];
        let part = '';
        let bytes = 0;
        for (const char of line) {
          const size = new TextEncoder().encode(char).length;
          if (bytes + size > 75) {
            parts.push(part);
            part = ' ';
            bytes = 1;
          }
          part += char;
          bytes += size;
        }
        parts.push(part);
        return parts.join('\r\n');
      })
      .join('\r\n') + '\r\n'
  );
}

export type MatchPreview = {
  pods: Array<{
    tableLabel: string;
    poolId: string;
    playerNames: string[];
    repeatPairs: number;
    longestWaitSeconds: number;
  }>;
  waiting: Array<{
    displayName: string;
    reason: 'NO_FREE_TABLE' | 'NO_COMPATIBLE_POD';
  }>;
  readyCount: number;
  freeTableCount: number;
};
import type { GameMode, RulesFormat } from './treachery';
import type { TableLayout } from './table-layout';
import type { LimitedEventModeConfig } from './limited';
import type { EventOperationMode } from './rounds';
import type { TournamentFormat, TournamentOptions } from './tournament';

/** Non-secret setup, retained until the organizer starts the live event. */
export type InvitationEventSetup = {
  tableCount: number;
  tableLayouts?: TableLayout[];
  gameMode?: GameMode;
  rulesFormat?: RulesFormat;
  allowThreePods?: boolean;
  allowFivePods?: boolean;
  preferredPodSize?: number;
  lifetimeHours?: number;
  operationMode?: EventOperationMode;
  roundCount?: number | 'AUTO';
  tournamentFormat?: TournamentFormat;
  tournamentOptions?: TournamentOptions;
  limitedModeConfigs?: LimitedEventModeConfig[];
  showReturningPlayerSuggestions?: boolean;
};
export type NightInvitee = { guestProfileId: string; displayName: string };
