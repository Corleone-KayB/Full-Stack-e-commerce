import fs from 'node:fs';
import path from 'node:path';

/**
 * Test environment.
 *
 * Integration tests run against a *copy* of the seeded development database,
 * made fresh for each vitest worker. Copying rather than migrating means:
 *   - `npm test` needs no network and no Prisma engine download,
 *   - the tests exercise the real seed data (real products, real prices),
 *   - and nothing a test writes can reach dev.db.
 *
 * If dev.db does not exist yet, DATABASE_URL is left alone and the integration
 * suites skip themselves with a message telling you to run `npm run setup`.
 */

const root = process.cwd();
const source = path.join(root, 'dev.db');
const scratch = path.join(root, 'tests', '.tmp');

// `NODE_ENV` is typed read-only by @types/node; the assignment is legitimate here.
(process.env as Record<string, string>).NODE_ENV = 'test';
process.env.AUTH_SECRET ??= 'test-secret-not-used-anywhere-real';
process.env.PAYMENTS_ENVIRONMENT = 'sandbox';
process.env.PAYMENTS_ENABLED = 'simulator,card,mtn_momo,airtel_money';
process.env.PAYMENT_EXPIRY_MINUTES ??= '15';
process.env.LOG_LEVEL = 'error';
process.env.MAIL_DRIVER = 'log';
process.env.SMS_DRIVER = 'log';

// vitest runs this file once per test file, but they share a worker process —
// and replacing the database out from under an open connection turns it
// read-only. So the copy happens exactly once per process.
const marker = '__aurumTestDbPath';
const scope = globalThis as unknown as Record<string, string | undefined>;

if (!fs.existsSync(source)) {
  process.env.AURUM_TEST_DB_READY = '';
} else if (scope[marker]) {
  process.env.DATABASE_URL = `file:${scope[marker]}`;
  process.env.AURUM_TEST_DB_READY = '1';
} else {
  fs.mkdirSync(scratch, { recursive: true });
  const target = path.join(scratch, `test-${process.env.VITEST_WORKER_ID ?? '1'}-${process.pid}.db`);
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(target + suffix)) fs.rmSync(target + suffix);
  }
  fs.copyFileSync(source, target);
  scope[marker] = target;
  process.env.DATABASE_URL = `file:${target}`;
  process.env.AURUM_TEST_DB_READY = '1';
}
