// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { transferFromScan } from './links';
import { shareableTransferDestination } from '@podyguard/shared';

describe('untrusted screen QR contents', () => {
  const id = '11111111-1111-4111-8111-111111111111', token = 'a'.repeat(64);
  const route = `#/send-to-screen/${id}?send=${token}`;
  it('accepts only an exact app QR, without a receive credential or destination', () => {
    expect(transferFromScan(`https://example.com/PodyGuard/${route}`, 'https://example.com/PodyGuard/')).toEqual({ id, sendToken: token });
    for (const raw of [`https://evil.example/PodyGuard/${route}`, `https://example.com/other/${route}`,
      `https://example.com/PodyGuard/${route}&receive=${token}`, `https://example.com/PodyGuard/${route}&send=${token}`,
      `https://example.com/PodyGuard/#https://evil.example/send-to-screen/${id}?send=${token}`, 'javascript:alert(1)']) {
      expect(transferFromScan(raw, 'https://example.com/PodyGuard/'), raw).toBeNull();
    }
  });
  it('preserves allowed route queries/fragments and rejects device-only pages or credentials', () => {
    const destination = `/e/ABCD12?seat=${id}#deck`;
    expect(shareableTransferDestination(destination)).toBe(destination);
    expect(shareableTransferDestination('/host/ABCD12?tab=overview#round')).toBe('/host/ABCD12?tab=overview#round');
    for (const route of ['/match', '/limited', '/players', '/account', '/admin', '/e/ABCD12?token=login-secret']) {
      expect(shareableTransferDestination(route)).toBeNull();
    }
  });
});
