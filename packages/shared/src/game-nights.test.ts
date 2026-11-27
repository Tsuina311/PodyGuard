import { describe, expect, it } from 'vitest';
import {
  gameNightCalendar,
  gameNightEventType,
  parsePregameAgreement,
  type GameNight,
} from './game-nights';
import { defaultLimitedEventModeConfig } from './limited';
const night: GameNight = {
  id: 'night',
  playgroupId: 'group',
  name: 'Friends; Commander, night\nBEGIN:VEVENT',
  location: 'Café',
  startsAt: '2026-12-01T19:00:00+01:00',
  createdAt: '2026-11-13T12:00:00Z',
  timeZone: 'Europe/Paris',
  seatTarget: 4,
  agreement: {},
  cancelled: false,
  eventJoinCode: null,
};
describe('game night calendar', () => {
  it('describes planned formats and includes invited names in the calendar safely', () => {
    expect(gameNightEventType({})).toBe('Commander · Multiplayer');
    for (const [gameMode, rulesFormat, expected] of [
      ['duel', 'normal', 'Classic · Duel'],
      ['duel-commander', undefined, 'Commander · Duel'],
      ['commander', 'commander', 'Commander · Multiplayer'],
      ['multiplayer', 'normal', 'Classic · Multiplayer'],
      ['brawl', undefined, 'Commander · Brawl'],
      ['archenemy-commander', undefined, 'Commander · Archenemy'],
      ['two-headed-giant', 'normal', 'Classic · Two Headed Giant'],
    ] as const) {
      expect(gameNightEventType({ eventSetup: { tableCount: 2, gameMode, rulesFormat } })).toBe(expected);
    }
    const configs = ['BOOSTER_DRAFT', 'PICK_TWO_DRAFT', 'SEALED'].map(mode => ({
      ...defaultLimitedEventModeConfig(mode as 'BOOSTER_DRAFT' | 'PICK_TWO_DRAFT' | 'SEALED'), enabled: true,
    }));
    expect(gameNightEventType({ eventSetup: { tableCount: 2, limitedModeConfigs: configs } }))
      .toBe('Booster Draft + Pick-Two Draft + Sealed');
    expect(gameNightEventType({ eventSetup: { tableCount: 1, limitedModeConfigs: configs.map(config => ({ ...config, enabled: false })) } }))
      .toBe('Commander · Multiplayer');
    const calendar = gameNightCalendar({ ...night, eventSetup: { tableCount: 1, gameMode: 'duel', rulesFormat: 'normal' },
      invitees: [{ guestProfileId: 'guest', displayName: 'Gwen, the great\nBEGIN:VEVENT' }] }).replace(/\r\n /g, '');
    expect(calendar).toContain('DESCRIPTION:Classic · Duel (Europe/Paris)');
    expect(calendar).toContain('Invited: Gwen\\, the great\\nBEGIN:VEVENT.');
    expect(calendar.match(/\r\nBEGIN:VEVENT/g)).toHaveLength(1);
  });
  it('exports an absolute instant, escaped user text and CRLF lines', () => {
    const ics = gameNightCalendar(night);
    expect(ics).toContain('DTSTART:20261201T180000Z\r\n');
    expect(ics).toContain(
      'SUMMARY:Friends\\; Commander\\, night\\nBEGIN:VEVENT',
    );
    expect(ics.match(/\r\nBEGIN:VEVENT/g)).toHaveLength(1);
  });
  it('folds unicode by UTF-8 octets and preserves cancellation', () => {
    const ics = gameNightCalendar({
      ...night,
      name: '🎲'.repeat(80),
      cancelled: true,
    });
    for (const line of ics.split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics).toContain('STATUS:CANCELLED');
  });
  it('handles daylight-saving offsets without changing the chosen instant', () => {
    expect(
      gameNightCalendar({ ...night, startsAt: '2026-07-01T19:00:00+02:00' }),
    ).toContain('DTSTART:20260701T170000Z');
  });
});
it('keeps agreements optional and strips unknown fields', () => {
  expect(parsePregameAgreement(undefined)).toEqual({});
  expect(
    parsePregameAgreement({ notes: ' hello ', secret: 'private' }),
  ).toEqual({ notes: 'hello' });
});
it.each([
  { pace: 'fast' },
  { durationMinutes: 0 },
  { durationMinutes: 20.5 },
  { notes: 'a'.repeat(501) },
  [],
])('rejects malformed agreements %j', (input) => {
  expect(() => parsePregameAgreement(input)).toThrow();
});
