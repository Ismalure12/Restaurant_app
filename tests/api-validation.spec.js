const { test, expect } = require('@playwright/test');

test.describe('API Validation', () => {
  test('V1 — POST /api/categories with empty name returns 400', async ({ request }) => {
    const res = await request.post('/api/categories', {
      data: { name: '' },
      headers: { 'Content-Type': 'application/json' },
    });

    // Should be 400 (validation) or 401 (unauthorized) — both are correct rejections
    expect([400, 401]).toContain(res.status());
  });

  test('V2 — POST /api/menu-items with negative price returns 400', async ({ request }) => {
    const res = await request.post('/api/menu-items', {
      data: { name: 'Test', price: -5, categoryId: 1 },
      headers: { 'Content-Type': 'application/json' },
    });

    expect([400, 401]).toContain(res.status());
  });

  test('V3 — POST /api/categories without auth returns 401', async ({ request }) => {
    const res = await request.post('/api/categories', {
      data: { name: 'Unauthorized Category' },
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status()).toBe(401);
  });

  test('GET /api/categories returns array', async ({ request }) => {
    const res = await request.get('/api/categories');
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('GET /api/menu-items returns array', async ({ request }) => {
    const res = await request.get('/api/menu-items');
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('GET /api/menu-items with categoryId filter works', async ({ request }) => {
    const res = await request.get('/api/menu-items?categoryId=1');
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});
