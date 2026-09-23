import { describe, it, expect, vi } from 'vitest';
import { isConnectPhaseError, isSafeToRetry, isTransientDbError, withDbRetry } from '../src/lib/db/dbRetry.js';

// The two errors Neon produced in the dev logs after an idle spell.
const tlsReset = Object.assign(new Error('Client network socket disconnected before secure TLS connection was established'), { code: 'ECONNRESET' });
const terminated = new Error('Connection terminated unexpectedly');
const uniqueViolation = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

describe('dbRetry — which failures may be repeated', () => {
  it('classifies the Neon errors', () => {
    expect(isConnectPhaseError(tlsReset)).toBe(true);
    expect(isConnectPhaseError(terminated)).toBe(false);
    expect(isTransientDbError(terminated)).toBe(true);
    expect(isTransientDbError(uniqueViolation)).toBe(false);
    expect(isConnectPhaseError({ code: 'P1001', message: "Can't reach database server" })).toBe(true);
  });

  it('reads retry on any dropped connection; writes only when the request never reached Postgres', () => {
    expect(isSafeToRetry(terminated, 'findMany')).toBe(true);
    expect(isSafeToRetry(terminated, 'create')).toBe(false); // may already have committed
    expect(isSafeToRetry(tlsReset, 'create')).toBe(true);
    expect(isSafeToRetry(uniqueViolation, 'findFirst')).toBe(false);
  });

  it('withDbRetry repeats a read until it succeeds, then stops', async () => {
    const run = vi.fn().mockRejectedValueOnce(tlsReset).mockRejectedValueOnce(terminated).mockResolvedValue('ok');
    await expect(withDbRetry('findMany', run, [0, 0])).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('withDbRetry never repeats a write whose connection died mid-query', async () => {
    const run = vi.fn().mockRejectedValue(terminated);
    await expect(withDbRetry('create', run, [0, 0])).rejects.toBe(terminated);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('gives up after the last delay and rethrows the original error', async () => {
    const run = vi.fn().mockRejectedValue(tlsReset);
    await expect(withDbRetry('update', run, [0, 0])).rejects.toBe(tlsReset);
    expect(run).toHaveBeenCalledTimes(3);
  });
});

describe('DB unreachable → 503 DB_UNAVAILABLE (never a bare 500)', () => {
  it('a read that cannot reach Postgres marks the request; a write that died mid-query does not', async () => {
    const { requestContext, isDbDown } = await import('../src/lib/db/requestContext.js');
    const drop = new Error('Connection terminated unexpectedly');
    const refused = new Error('connect ECONNREFUSED 127.0.0.1:5432');
    const inCtx = async (fn: () => Promise<unknown>) => requestContext.run({ dbDown: false }, async () => { await fn().catch(() => {}); return isDbDown(); });
    expect(await inCtx(() => withDbRetry('findMany', () => Promise.reject(drop), []))).toBe(true);
    expect(await inCtx(() => withDbRetry('create', () => Promise.reject(refused), []))).toBe(true);
    // may have committed → not reported as "unreachable, try again"
    expect(await inCtx(() => withDbRetry('create', () => Promise.reject(drop), []))).toBe(false);
  });
});
