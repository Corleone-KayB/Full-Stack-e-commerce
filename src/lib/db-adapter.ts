import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Driver adapter selection.
 *
 * One function decides how the application talks to its database, based only
 * on the shape of DATABASE_URL:
 *
 *   file:./dev.db                 → SQLite, via libSQL
 *   libsql://… (+ auth token)     → Turso / libSQL server
 *   postgres:// | postgresql://   → PostgreSQL, via node-postgres
 *
 * Moving to production is therefore: change DATABASE_URL, change `provider` in
 * prisma/schema.prisma to "postgresql", run `prisma migrate deploy`. No
 * application code changes.
 *
 * WHY libSQL RATHER THAN better-sqlite3
 * Both are supported by Prisma and either would work. libSQL is chosen
 * because it resolves its native module through per-platform npm packages
 * (rather than a build-directory search), which behaves predictably under a
 * bundler and in a containerised deployment — and because the same adapter
 * can later point at a hosted libSQL/Turso database by changing only the URL.
 * To use better-sqlite3 instead: `npm i @prisma/adapter-better-sqlite3` and
 * swap the constructor below; nothing else in the app changes.
 */

export type AnyAdapter = PrismaLibSql | PrismaPg;

export function isPostgres(url: string | undefined): boolean {
  return !!url && /^postgres(ql)?:\/\//i.test(url);
}

export function createAdapter(url: string | undefined): AnyAdapter {
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env — the default value runs on SQLite with no setup.',
    );
  }

  if (isPostgres(url)) {
    return new PrismaPg({
      connectionString: url,
      // Pool sizing that suits a serverless or containerised deployment.
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  return new PrismaLibSql({
    url,
    // Only used when pointing at a hosted libSQL/Turso database.
    ...(process.env.DATABASE_AUTH_TOKEN ? { authToken: process.env.DATABASE_AUTH_TOKEN } : {}),
  });
}
