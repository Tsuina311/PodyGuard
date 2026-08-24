import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Schema/migration generation does not need a live DB connection.
 * Applying migrations (yarn db:migrate) requires DATABASE_URL.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://127.0.0.1/podyguard_schema_placeholder',
  },
});
