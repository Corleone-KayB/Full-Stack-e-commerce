import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Two kinds of test live side by side.
 *
 *   tests/unit/*         pure functions — money, pricing, RBAC, signatures.
 *                        No database, no network, milliseconds.
 *   tests/integration/*  the real services against a real SQLite database.
 *                        `tests/setup.ts` gives each worker a throwaway copy
 *                        of dev.db, so a test may write freely and nothing it
 *                        does can reach the development data.
 *
 * `server-only` is aliased to an empty module: it exists to make Next fail a
 * build when a server module is imported from the browser, and under Node it
 * throws on sight. The rule it enforces is a bundler concern, not a runtime
 * one, so the tests stub it rather than work around it.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    // Integration tests share one SQLite file per worker and mutate stock, so
    // they must not interleave inside a file.
    sequence: { concurrent: false },
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
