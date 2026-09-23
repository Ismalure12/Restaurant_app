import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { createApp } = await import('../src/app.js');
const app = createApp();

beforeEach(() => {
  Object.assign(db, createPrismaMock());
});

describe('authentication', () => {
  it('rejects a protected route with no cookie (401)', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('rejects a forged token (401)', async () => {
    const good = await tokenFor('admin');
    const forged = good.slice(0, -4) + 'AAAA';
    const res = await request(app).get('/api/users').set('Cookie', forged);
    expect(res.status).toBe(401);
  });

  it('rejects an expired token (401)', async () => {
    const res = await request(app).get('/api/users').set('Cookie', await tokenFor('admin', 1, { expired: true }));
    expect(res.status).toBe(401);
  });

  it('forbids a role outside the list (403) without touching the database', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Cookie', await tokenFor('waiter'))
      .send({ name: 'Drinks' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
    expect(db.category.create).not.toHaveBeenCalled();
  });

  it('falls back to a DB role lookup for old tokens without a role claim', async () => {
    db.adminUser.findUnique.mockResolvedValue({ role: 'manager' });
    db.adminUser.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/users').set('Cookie', await tokenFor(undefined, 7));
    expect(res.status).toBe(200);
    expect(db.adminUser.findUnique).toHaveBeenCalledWith({ where: { id: 7 }, select: { role: true } });
  });

  it('stops a manager from creating an admin (403)', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Cookie', await tokenFor('manager'))
      .send({ email: 'x@y.com', password: 'secret123', role: 'admin' });
    expect(res.status).toBe(403);
    expect(db.adminUser.create).not.toHaveBeenCalled();
  });
});

describe('login / logout', () => {
  it('sets an httpOnly, SameSite=Lax, 7-day auth cookie on success', async () => {
    db.adminUser.findUnique.mockResolvedValue({
      id: 3, email: 'a@b.com', role: 'cashier', passwordHash: await bcrypt.hash('pw', 4),
    });
    const res = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'pw' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/^auth-token=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=604800(;|$)/); // seconds — guards the Next→Express ms conversion
  });

  it('gives the same answer for unknown email and wrong password', async () => {
    db.adminUser.findUnique.mockResolvedValueOnce(null);
    const unknown = await request(app).post('/api/auth/login').send({ email: 'no@b.com', password: 'pw' });
    db.adminUser.findUnique.mockResolvedValueOnce({ id: 1, email: 'a@b.com', role: 'admin', passwordHash: await bcrypt.hash('right', 4) });
    const wrong = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'nope' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
  });

  it('logout clears the cookie', async () => {
    const res = await request(app).delete('/api/auth/login');
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie'][0]).toMatch(/^auth-token=;.*Max-Age=0/);
  });

  it('set-cookie refuses an admin token', async () => {
    const admin = (await tokenFor('admin')).replace('auth-token=', '');
    const res = await request(app).post('/api/auth/set-cookie').send({ token: admin });
    expect(res.status).toBe(400);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('request parsing and method handling (Next parity)', () => {
  it('malformed JSON lands in the route catch like request.json() did (500)', async () => {
    const res = await request(app)
      .post('/api/categories')
      .set('Cookie', await tokenFor('admin'))
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
  });

  it('invalid body → 400 with Zod details, no write', async () => {
    const res = await request(app).post('/api/categories').set('Cookie', await tokenFor('admin')).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid input');
    expect(res.body.details).toBeDefined();
    expect(db.category.create).not.toHaveBeenCalled();
  });

  it('strips non-<em> HTML from category headlines before saving', async () => {
    db.category.create.mockImplementation(async ({ data }: { data: unknown }) => data);
    const res = await request(app)
      .post('/api/categories')
      .set('Cookie', await tokenFor('admin'))
      .send({ name: 'Mains', headline: '<script>x</script><em>Hot</em><img src=x onerror=1>' });
    expect(res.status).toBe(201);
    expect(res.body.headline).toBe('x<em>Hot</em>');
  });

  it('unsupported method → 405 with Allow; OPTIONS → 204', async () => {
    const patch = await request(app).patch('/api/categories');
    expect(patch.status).toBe(405);
    expect(patch.headers.allow).toBe('GET, HEAD, OPTIONS, POST');
    const options = await request(app).options('/api/categories');
    expect(options.status).toBe(204);
  });

  it('unknown path → empty 404; no x-powered-by / etag', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.text).toBe('');
    db.category.findMany.mockResolvedValue([]);
    const list = await request(app).get('/api/categories');
    expect(list.headers['x-powered-by']).toBeUndefined();
    expect(list.headers.etag).toBeUndefined();
  });
});
