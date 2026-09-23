import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { createApp } = await import('../src/app.js');
const app = createApp();

beforeEach(() => {
  Object.assign(db, createPrismaMock());
  db.socialLink.findUnique.mockResolvedValue(null);
  db.socialLink.create.mockResolvedValue({ id: 1, platform: 'whatsapp', value: '+252610000000' });
});

// Social links are edited on Settings, a manager page — so a manager (not only
// the legacy 'admin' role) must be able to save them.
describe('POST /api/social-links', () => {
  const body = { platform: 'whatsapp', value: '+252610000000' };

  it('a manager can add a link', async () => {
    const res = await request(app).post('/api/social-links').set('Cookie', await tokenFor('manager')).send(body);
    expect(res.status).toBe(201);
    expect(db.socialLink.create).toHaveBeenCalled();
  });

  it('cashier and waiter are refused before any write', async () => {
    for (const role of ['cashier', 'waiter']) {
      expect((await request(app).post('/api/social-links').set('Cookie', await tokenFor(role)).send(body)).status).toBe(403);
    }
    expect(db.socialLink.create).not.toHaveBeenCalled();
  });
});
