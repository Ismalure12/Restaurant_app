// Retry for the connection drops Neon produces after its compute has been idle.
//
// After a few idle minutes Neon suspends the compute; the first queries after
// that can fail in the TLS handshake ("Client network socket disconnected
// before secure TLS connection was established", ECONNRESET) or on a pooled
// socket the server already closed ("Connection terminated unexpectedly").
// A retry a moment later succeeds, so the user never sees a 500.
//
// Safety rule, because a retried write must never run twice:
//   • reads retry on any connection error;
//   • writes retry ONLY on connect-phase errors (the request never reached
//     Postgres). A write whose connection died mid-query may already have
//     committed, so it is surfaced, not repeated.

import { markDbDown } from './requestContext.js';

const READ_OPS = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy',
]);

const CONNECT_PHASE = [
  /before secure TLS connection was established/i,
  /ECONNREFUSED/,
  /ENOTFOUND|EAI_AGAIN/,
  /timeout exceeded when trying to connect/i,
  /connection terminated due to connection timeout/i,
  /can't reach database server/i,
];
const MID_QUERY = [
  /ECONNRESET/,
  /connection terminated unexpectedly/i,
  /server closed the connection/i,
  /ETIMEDOUT|EPIPE/,
];
const CONNECT_CODES = new Set(['P1001']);
const MID_QUERY_CODES = new Set(['P1017', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE']);

function describe(err: unknown) {
  const e = err as { message?: unknown; code?: unknown; cause?: unknown } | null;
  const code = typeof e?.code === 'string' ? e.code : '';
  const cause = e?.cause as { message?: unknown; code?: unknown } | undefined;
  const text = [e?.message, cause?.message, cause?.code, code].filter((x) => typeof x === 'string').join(' ');
  return { code, text };
}

/** The request never reached Postgres — safe to repeat anything. */
export function isConnectPhaseError(err: unknown) {
  const { code, text } = describe(err);
  return CONNECT_CODES.has(code) || CONNECT_PHASE.some((re) => re.test(text));
}

/** Any dropped/refused connection (the query may or may not have run). */
export function isTransientDbError(err: unknown) {
  if (isConnectPhaseError(err)) return true;
  const { code, text } = describe(err);
  return MID_QUERY_CODES.has(code) || MID_QUERY.some((re) => re.test(text));
}

export function isSafeToRetry(err: unknown, operation: string) {
  return READ_OPS.has(operation) ? isTransientDbError(err) : isConnectPhaseError(err);
}

export const RETRY_DELAYS_MS = [150, 600];

export async function withDbRetry<T>(operation: string, run: () => Promise<T>, delays: number[] = RETRY_DELAYS_MS): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= delays.length || !isSafeToRetry(err, operation)) {
        // Still can't reach Postgres after retrying: the response becomes 503 DB_UNAVAILABLE.
        // Only when the outcome is certain: the request never reached Postgres, or it was a read.
        if (isConnectPhaseError(err) || (READ_OPS.has(operation) && isTransientDbError(err))) markDbDown();
        throw err;
      }
      console.warn(`DB ${operation}: connection dropped, retrying (${attempt + 1}/${delays.length})`);
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
}
