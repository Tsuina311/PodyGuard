import { describe, expect, it } from 'vitest';
import { EventStatus } from '@podin/shared';

describe('web foundation', () => {
  it('imports shared package enums', () => {
    expect(EventStatus.Open).toBe('open');
  });
});
