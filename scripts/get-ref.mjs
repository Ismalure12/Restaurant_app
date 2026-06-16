import { chromium } from 'playwright';
const BASE = 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@restaurant.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin/login`);
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/);
  const refs = await page.evaluate(async () => {
    const r = await fetch('/api/admin/orders');
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j) ? j.slice(0, 3).map((o) => o.reference) : [];
  });
  console.log(refs);
  await browser.close();
})();
