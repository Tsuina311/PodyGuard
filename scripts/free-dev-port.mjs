/**
 * Pick the next free TCP port for local Vite, starting at `preferred`.
 *
 * Probes `127.0.0.1` specifically: another project can own localhost while
 * Vite still binds `*:5173`, and the browser then hits the wrong process.
 */
import { createServer } from 'node:net';

/**
 * @param {number} [preferred=5173]
 * @param {number} [maxAttempts=50]
 * @returns {Promise<number>}
 */
export function findFreeDevPort(preferred = 5173, maxAttempts = 50) {
  const start = Number.isFinite(preferred) && preferred > 0 ? preferred : 5173;
  return new Promise((resolve, reject) => {
    let port = start;

    const tryListen = () => {
      if (port >= start + maxAttempts) {
        reject(
          new Error(
            `No free localhost port in ${String(start)}–${String(start + maxAttempts - 1)}`,
          ),
        );
        return;
      }

      const server = createServer();
      server.unref();
      server.once('error', () => {
        port += 1;
        tryListen();
      });
      server.listen({ port, host: '127.0.0.1' }, () => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(port);
        });
      });
    };

    tryListen();
  });
}
