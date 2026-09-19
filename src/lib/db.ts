import { PrismaClient } from '@/generated/prisma/client';
import { createAdapter } from './db-adapter';

/**
 * A single Prisma client per process. Next.js hot-reloads modules in dev, so
 * the instance is stashed on globalThis to avoid exhausting connections.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function build(): PrismaClient {
  return new PrismaClient({
    adapter: createAdapter(process.env.DATABASE_URL),
    log: process.env.LOG_LEVEL === 'debug' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? build();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/** Transaction client type, for functions that take an open transaction. */
export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
