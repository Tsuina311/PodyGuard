import { createServer, request as httpRequest } from 'node:http';

/** A real origin outage, independent of browser-specific network emulation.
 * The upstream is the existing loopback memory server, never a deployed API. */
export async function createOutageOrigin(baseURL: string) {
  const upstream = new URL(baseURL);
  if (
    upstream.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(upstream.hostname)
  )
    throw new Error('Outage tests require a loopback memory server.');
  const server = createServer((incoming, outgoing) => {
    const request = httpRequest(
      new URL(incoming.url ?? '/', upstream),
      {
        method: incoming.method,
        headers: { ...incoming.headers, host: upstream.host },
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(outgoing);
      },
    );
    request.on('error', () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.on('aborted', () => request.destroy());
    incoming.pipe(request);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test origin port.');
  let closed = false;
  return {
    url: `http://127.0.0.1:${address.port}/`,
    async disconnect() {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}
