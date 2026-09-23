import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createPrismaMock, tokenFor, type PrismaMock } from './helpers.js';
import { applyPatch, defaultMatrix, diffFromDefaults, parseMatrix } from '../src/lib/auth/permissions.js';

const db: PrismaMock = vi.hoisted(() => ({}) as PrismaMock);
vi.mock('../src/lib/db/prisma.js', () => ({ default: db }));

const { createApp } = await import('../src/app.js');
const app = createApp();
const as = async (role: string, id = 1) => ({ Cookie: await tokenFor(role, id) });

// The stored role_permissions row (null = never edited → defaults).
let stored: string | null;
beforeEach(() => {
  Object.assign(db, createPrismaMock());
  stored = null;
  db.setting.findUnique.mockImplementation(async ({ where }: { where: { key: string } }) =>
    where.key === 'role_permissions' && stored != null ? { key: where.key, value: stored } : null);
  db.setting.upsert.mockImplementation(async ({ update }: { update: { value: string } }) => { stored = update.value; return {}; });
  db.diningTable.create.mockResolvedValue({ id: 9, name: 'T9', sortOrder: 0, isActive: true });
  db.diningTable.findFirst.mockResolvedValue(null);
  db.adminUser.findUnique.mockResolvedValue({ name: 'Someone', role: 'manager' });
});

describe('permission matrix (pure)', () => {
  it('defaults reproduce the old role lists', () => {
    const m = defaultMatrix();
    expect(m.cashier.reports).toBe('none');
    expect(m.cashier.orders).toBe('act');
    expect(m.cashier.inventory).toBe('view');
    expect(m.waiter.pos).toBe('act');
    expect(m.waiter.orders).toBe('none');
    expect(m.manager.settings).toBe('act');
  });

  it('a stored matrix overrides only what it names; bad JSON or unknown pages fall back to defaults', () => {
    expect(parseMatrix(JSON.stringify({ cashier: { reports: 'view' } })).cashier).toMatchObject({ reports: 'view', orders: 'act' });
    expect(parseMatrix('{not json')).toEqual(defaultMatrix());
    expect(parseMatrix(JSON.stringify({ cashier: { nope: 'act' } }))).toEqual(defaultMatrix());
  });

  it('a read-only page is capped at view', () => {
    expect(parseMatrix(JSON.stringify({ cashier: { sales: 'act' } })).cashier.sales).toBe('view');
  });

  it('only differences from the defaults are stored', () => {
    const m = defaultMatrix();
    m.cashier.reports = 'view';
    expect(diffFromDefaults(m)).toEqual({ cashier: { reports: 'view' } });
  });

  it('a manager cannot touch the manager row or give more than they have', () => {
    const m = defaultMatrix();
    expect(applyPatch(m, { manager: { reports: 'none' } }, 'manager').error).toMatch(/manager/);
    m.manager.cash = 'view';
    expect(applyPatch(m, { cashier: { cash: 'act' } }, 'manager').error).toMatch(/more access/);
    expect(applyPatch(m, { cashier: { cash: 'view' } }, 'manager').matrix?.cashier.cash).toBe('view');
    expect(applyPatch(m, { manager: { cash: 'act' } }, 'admin').matrix?.manager.cash).toBe('act');
    expect(applyPatch(m, { cashier: { cash: 'view' } }, 'cashier').error).toBeTruthy();
  });
});

describe('the API enforces the matrix', () => {
  it('defaults: a cashier cannot open reports or add tables; a waiter cannot list orders', async () => {
    expect((await request(app).get('/api/admin/reports/financial').set(await as('cashier'))).status).toBe(403);
    expect((await request(app).post('/api/admin/tables').set(await as('cashier')).send({ name: 'T9' })).status).toBe(403);
    expect((await request(app).get('/api/admin/orders').set(await as('waiter'))).status).toBe(403);
  });

  it('granting cashiers Tables › Act lets them add a table, at once (no re-login)', async () => {
    stored = JSON.stringify({ cashier: { tables: 'act' } });
    const res = await request(app).post('/api/admin/tables').set(await as('cashier')).send({ name: 'T9' });
    expect([401, 403]).not.toContain(res.status);
    expect(db.diningTable.create).toHaveBeenCalled();
  });

  it('View is not Act: cashiers with Tables › View still cannot add one', async () => {
    stored = JSON.stringify({ cashier: { tables: 'view' } });
    expect((await request(app).post('/api/admin/tables').set(await as('cashier')).send({ name: 'T9' })).status).toBe(403);
  });

  it('taking a page away from the manager blocks it for them, never for the admin', async () => {
    stored = JSON.stringify({ manager: { tables: 'none' } });
    expect((await request(app).post('/api/admin/tables').set(await as('manager')).send({ name: 'T9' })).status).toBe(403);
    expect((await request(app).post('/api/admin/tables').set(await as('admin')).send({ name: 'T9' })).status).not.toBe(403);
  });

  it('/auth/me hands the dashboard the caller’s own page levels', async () => {
    db.adminUser.findUnique.mockResolvedValue({ name: 'Cas', role: 'cashier' });
    stored = JSON.stringify({ cashier: { reports: 'view' } });
    const res = await request(app).get('/api/auth/me').set(await as('cashier'));
    expect(res.status).toBe(200);
    expect(res.body.permissions).toMatchObject({ reports: 'view', orders: 'act', cash: 'none' });
  });
});

describe('Settings › Staff access (GET/PUT /api/admin/permissions)', () => {
  it('cashiers and waiters cannot read or change it', async () => {
    expect((await request(app).get('/api/admin/permissions').set(await as('cashier'))).status).toBe(403);
    expect((await request(app).put('/api/admin/permissions').set(await as('waiter')).send({ matrix: {} })).status).toBe(403);
    expect((await request(app).get('/api/admin/permissions')).status).toBe(401);
  });

  it('manager sees which rows they may edit', async () => {
    const res = await request(app).get('/api/admin/permissions').set(await as('manager'));
    expect(res.status).toBe(200);
    expect(res.body.editable).toEqual(['cashier', 'waiter']);
    expect(res.body.pages.find((p: { key: string }) => p.key === 'sales').readOnly).toBe(true);
  });

  it('manager grants cashiers Reports › View: stored, audited with before/after', async () => {
    const res = await request(app).put('/api/admin/permissions').set(await as('manager', 2)).send({ matrix: { cashier: { reports: 'view' } } });
    expect(res.status).toBe(200);
    expect(JSON.parse(stored!)).toEqual({ cashier: { reports: 'view' } });
    const a = db.auditLog.create.mock.calls[0][0].data;
    expect(a).toMatchObject({ actorId: 2, action: 'permissions.update', entity: 'Setting', entityId: 'role_permissions', meta: { cashier: { reports: { from: 'none', to: 'view' } } } });
  });

  it('manager editing the manager row → 403, nothing written', async () => {
    const res = await request(app).put('/api/admin/permissions').set(await as('manager')).send({ matrix: { manager: { reports: 'none' } } });
    expect(res.status).toBe(403);
    expect(db.setting.upsert).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it('manager cannot give above their own level → 403', async () => {
    stored = JSON.stringify({ manager: { cash: 'view' } });
    const res = await request(app).put('/api/admin/permissions').set(await as('manager')).send({ matrix: { cashier: { cash: 'act' } } });
    expect(res.status).toBe(403);
  });

  it('admin edits the manager row', async () => {
    const res = await request(app).put('/api/admin/permissions').set(await as('admin')).send({ matrix: { manager: { payroll: 'view' } } });
    expect(res.status).toBe(200);
    expect(res.body.matrix.manager.payroll).toBe('view');
  });

  it.each([
    [{ matrix: { cashier: { reports: 'maybe' } } }],
    [{ matrix: { cashier: { nope: 'view' } } }],
    [{ matrix: { owner: { reports: 'view' } } }],
    [{}],
  ])('rejects %j with 400', async (body) => {
    const res = await request(app).put('/api/admin/permissions').set(await as('admin')).send(body);
    expect(res.status).toBe(400);
    expect(db.setting.upsert).not.toHaveBeenCalled();
  });
});

describe('Settings › Audit log (GET /api/admin/audit-log)', () => {
  it('admin and manager only', async () => {
    expect((await request(app).get('/api/admin/audit-log').set(await as('cashier'))).status).toBe(403);
    expect((await request(app).get('/api/admin/audit-log')).status).toBe(401);
  });

  it('pages newest first with the actor’s name from one lookup', async () => {
    db.auditLog.findMany.mockResolvedValue([
      { id: 12, at: new Date(), action: 'order.void', entity: 'order', entityId: '5', meta: null, actorId: 2 },
      { id: 11, at: new Date(), action: 'settings.update', entity: 'settings', entityId: null, meta: null, actorId: 2 },
      { id: 10, at: new Date(), action: 'x', entity: 'x', entityId: null, meta: null, actorId: null },
    ]);
    db.auditLog.groupBy.mockResolvedValue([{ entity: 'order' }, { entity: 'settings' }]);
    db.adminUser.findMany.mockResolvedValue([{ id: 2, name: 'Mona', email: 'm@x', role: 'manager' }]);
    const res = await request(app).get('/api/admin/audit-log?take=2&entity=order').set(await as('manager'));
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(2);
    expect(res.body.rows[0].actor).toEqual({ id: 2, name: 'Mona', role: 'manager' });
    expect(res.body.nextCursor).toBe(11);
    expect(res.body.entities).toEqual(['order', 'settings']);
    expect(db.adminUser.findMany).toHaveBeenCalledTimes(1);
    const where = db.auditLog.findMany.mock.calls[0][0].where;
    expect(where.entity).toBe('order');
  });

  it.each(['take=500', 'cursor=abc', 'from=yesterday'])('rejects %s with 400', async (q) => {
    expect((await request(app).get(`/api/admin/audit-log?${q}`).set(await as('admin'))).status).toBe(400);
  });
});

describe('staff accounts: no one manages above their own role', () => {
  beforeEach(() => { stored = JSON.stringify({ cashier: { staff: 'act' } }); });

  it('a cashier given Staff › Act cannot create a manager', async () => {
    const res = await request(app).post('/api/users').set(await as('cashier')).send({ email: 'm@x.com', password: 'secret123', role: 'manager' });
    expect(res.status).toBe(403);
    expect(db.adminUser.create).not.toHaveBeenCalled();
  });

  it('a manager cannot edit or remove an admin', async () => {
    db.adminUser.findUnique.mockResolvedValue({ id: 1, email: 'a@x', role: 'admin', name: 'A', phone: null, isActive: true });
    expect((await request(app).put('/api/users/1').set(await as('manager', 2)).send({ name: 'x' })).status).toBe(403);
    expect((await request(app).delete('/api/users/1').set(await as('manager', 2))).status).toBe(403);
    expect(db.adminUser.update).not.toHaveBeenCalled();
    expect(db.adminUser.delete).not.toHaveBeenCalled();
  });

  it('a role change is audited with from/to', async () => {
    db.adminUser.findUnique.mockImplementation(async ({ where }: { where: { id?: number } }) =>
      where.id === 7 ? { id: 7, email: 'w@x', role: 'waiter', name: 'W', phone: null, isActive: true } : null);
    db.adminUser.update.mockResolvedValue({ id: 7, email: 'w@x', role: 'cashier', name: 'W', phone: null, isActive: true });
    const res = await request(app).put('/api/users/7').set(await as('manager', 2)).send({ role: 'cashier' });
    expect(res.status).toBe(200);
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ action: 'user.update', entityId: '7', meta: { role: { from: 'waiter', to: 'cashier' } } });
  });
});
