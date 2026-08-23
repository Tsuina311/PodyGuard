import { config } from './config.js';
import { buildApp } from './app.js';
import { closeDatabase } from './db/client.js';
import { createIdentityBoundary } from './identity/index.js';

async function main(): Promise<void> {
  // Accessing config validates DATABASE_URL before listen.
  const app = await buildApp({
    identity: createIdentityBoundary({
      participantSessionSecret: config.participantSessionSecret,
    }),
  });

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down`);
    await app.close();
    await closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    `Poderate server listening on ${config.host}:${config.port} (database via DATABASE_URL)`,
  );
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
});
