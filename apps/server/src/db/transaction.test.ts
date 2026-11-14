import { describe, expect, it, vi } from 'vitest';
const { root, transactions } = vi.hoisted(() => {
  const transactions: object[] = [];
  const root = {
    transaction: async (work: (tx: object) => Promise<unknown>) => {
      const tx = { id: transactions.length };
      transactions.push(tx);
      return work(tx);
    },
  };
  return { root, transactions };
});
vi.mock('drizzle-orm/neon-serverless', () => ({ drizzle: () => root }));
import { getDb, withDbTransaction } from './client.js';
describe('request transaction boundaries', () => {
  it('reuses the request connection across awaits without leaking into another request', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = withDbTransaction(async () => {
      const tx = getDb();
      expect(tx).not.toBe(root);
      await gate;
      expect(getDb()).toBe(tx);
      return tx;
    });
    const second = withDbTransaction(async () => {
      const tx = getDb();
      expect(tx).not.toBe(transactions[0]);
      release();
      await Promise.resolve();
      expect(getDb()).toBe(tx);
      return tx;
    });
    const [a, b] = await Promise.all([first, second]);
    expect(a).not.toBe(b);
    expect(getDb()).toBe(root);
  });
  it('restores the normal database after rollback', async () => {
    await expect(
      withDbTransaction(async () => {
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(getDb()).toBe(root);
  });
});
