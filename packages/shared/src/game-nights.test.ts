import { describe, expect, it } from 'vitest';
import {
  gameNightCalendar,
  parsePregameAgreement,
  type GameNight,
} from './game-nights';
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
