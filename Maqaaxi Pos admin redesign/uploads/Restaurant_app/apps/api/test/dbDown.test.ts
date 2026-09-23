import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { createApp } = await import('../src/app.js');
const { markDbDown } = await import('../src/lib/db/requestContext.js');
const app = createApp();

beforeEach(() => { Object.assign(db, createPrismaMock()); });

describe('database unreachable', () => {
  it('a route that fails because Postgres is unreachable answers 503 DB_UNAVAILABLE with a friendly message', async () => {
    db.expense.findMany.mockImplementation(async () => { markDbDown(); throw new Error('connect ECONNREFUSED'); });
    const res = await request(app).get('/api/admin/expenses').set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('DB_UNAVAILABLE');
    expect(res.body.error).not.toMatch(/internal server error/i);
  });

  it('an ordinary bug is still a 500 with the generic message', async () => {
    db.expense.findMany.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/api/admin/expenses').set('Cookie', await tokenFor('manager'));
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });
});
