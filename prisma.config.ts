import { existsSync } from 'node:fs';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma CLI configuration.
 *
 * Prisma 7 talks to the database through a driver adapter rather than a
 * bundled query engine, which is what lets one schema serve SQLite in
 * development and PostgreSQL in production with no code change. The adapter
 * itself is constructed where the client is built (src/lib/db.ts, via
 * src/lib/db-adapter.ts); the CLI only needs the connection URL for migrate
 * and introspect.
 */

// The Prisma CLI does not load .env automatically.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: env('DATABASE_URL') },
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
});
