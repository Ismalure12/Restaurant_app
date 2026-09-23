const { test, expect } = require('@playwright/test');
const { signIn } = require('./helpers');

// API contract through the web app's /api proxy (same path production uses).
test.describe('API validation & authorization', () => {
  test('V1 — public menu: categories with their dishes', async ({ request }) => {
    const res = await request.get('/api/menu');
    expect(res.status()).toBe(200);
    const menu = await res.json();
    expect(Array.isArray(menu.categories)).toBe(true);
    const item = menu.categories.flatMap((c) => c.items)[0];
    expect(item).toMatchObject({ id: expect.any(Number), name: expect.any(String) });
  });

  test('V2 — catalog writes need a session', async ({ request }) => {
    expect((await request.post('/api/categories', { data: { name: 'Nope' } })).status()).toBe(401);
    expect((await request.post('/api/menu-items', { data: { name: 'Nope', price: 1, categoryId: 1 } })).status()).toBe(401);
  });

  test('V3 — a waiter may not edit the menu (403), a manager gets a 400 for bad input', async ({ page }) => {
    await signIn(page, 'waiter');
    expect((await page.request.post('/api/categories', { data: { name: 'Nope' } })).status()).toBe(403);
    await page.context().clearCookies();
    await signIn(page, 'manager');
    expect((await page.request.post('/api/categories', { data: { name: '' } })).status()).toBe(400);
    expect((await page.request.post('/api/menu-items', { data: { name: 'Bad', price: -5, categoryId: 1 } })).status()).toBe(400);
  });

  test('V4 — checkout rejects a malformed body', async ({ request }) => {
    const res = await request.post('/api/checkout', { data: { name: '', cart: [] } });
    expect(res.status()).toBe(400);
  });

  test('V5 — checkout reprices server-side: a tampered total is refused (409)', async ({ request }) => {
    const menu = await (await request.get('/api/menu')).json();
    const item = menu.categories.flatMap((c) => c.items).find((i) => !(i.optionGroups || []).some((g) => g.required)) || menu.categories[0].items[0];
    const res = await request.post('/api/checkout', {
      data: {
        name: 'E2E', phone: '252617000000', orderType: 'dine_in', tableNumber: '1',
        cart: [{ itemId: item.id, name: item.name, unitPrice: 0.01, quantity: 1, extras: [] }],
        total: 0.01,
      },
    });
    expect([400, 409]).toContain(res.status());
  });

  test('V6 — a guessed order reference reveals nothing', async ({ request }) => {
    const res = await request.get('/api/order?ref=ord-00000000-0000-0000-0000-000000000000');
    expect(res.status()).toBe(404);
  });

  test('V7 — waiters only see their own sales', async ({ page }) => {
    const me = await signIn(page, 'waiter');
    const who = await (await page.request.get('/api/auth/me')).json();
    const res = await page.request.get('/api/admin/sales');
    expect(res.status()).toBe(200);
    const { rows } = await res.json();
    for (const r of rows) expect([r.staffId, r.waiterId], `${me.email} sees sale ${r.id}`).toContain(who.userId);
  });
});
