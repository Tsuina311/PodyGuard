import { createServer, type Server } from 'node:net';
import { describe, expect, it } from 'vitest';
// Vitest loads the script; tsc excludes this file (see tsconfig).
// @ts-expect-error JS script has no declaration file under apps/web rootDir
import { findFreeDevPort } from '../../../scripts/free-dev-port.mjs';

function holdPort(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen({ port, host: '127.0.0.1' }, () => {
      resolve(server);
    });
  });
}

describe('findFreeDevPort', () => {
  it('returns the preferred port when localhost is free', async () => {
    const preferred = await findFreeDevPort(43100);
    expect(await findFreeDevPort(preferred)).toBe(preferred);
  });

  it('advances past a port that already owns localhost', async () => {
    const preferred = await findFreeDevPort(43200);
    const held = await holdPort(preferred);
    try {
      expect(await findFreeDevPort(preferred)).toBe(preferred + 1);
    } finally {
      await new Promise<void>((resolve, reject) => {
        held.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
