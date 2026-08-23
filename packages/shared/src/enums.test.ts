import { describe, expect, it } from 'vitest';
import { EventStatus, ParticipantStatus } from './enums';

describe('shared enums', () => {
  it('exposes event statuses', () => {
    expect(EventStatus.Open).toBe('open');
    expect(EventStatus.Locked).toBe('locked');
    expect(EventStatus.Closed).toBe('closed');
  });

  it('exposes participant statuses', () => {
    expect(ParticipantStatus.Ready).toBe('ready');
    expect(ParticipantStatus.Playing).toBe('playing');
  });
});
