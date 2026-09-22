import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../../config/env.js';
import { withDbRetry } from './dbRetry.js';

// One client (and one pg pool) per process — a long-running server must never
// construct a client per request. Use the pooled connection string.
//
// Pool: drop idle sockets before Neon/NAT silently kills them, give up on a
// connect that hangs (the pg default waits forever), keep TCP alive. Queries
// then go through withDbRetry, which absorbs the connection drops that follow
// a Neon compute suspend (see dbRetry.ts for which operations may retry).
function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });
  const client = new PrismaClient({ adapter }).$extends({
    query: {
      $allOperations({ operation, args, query }) {
        return withDbRetry(operation, () => query(args));
      },
    },
  });
  // A query-only extension leaves every model API unchanged; keep the plain
  // PrismaClient type so `tx` stays assignable to Prisma.TransactionClient.
  return client as unknown as PrismaClient;
}

const prisma = createPrismaClient();
export type Db = typeof prisma;
export default prisma;
