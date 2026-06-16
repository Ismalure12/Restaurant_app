import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@restaurant.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';
const OUT = join(process.cwd(), 'browser-test-output', 'final');
mkdirSync(OUT, { recursive: true });

// Single page = use scroll-based screenshots to get top-of-fold view only
async function shootTop(ctx, path, w, h, name, options = {}) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: w, height: h });
  // Use 'load' rather than 'networkidle' — the orders page keeps an SSE
  // connection open which never goes idle.
  await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 20000 }).catch(() => null);
  await page.waitForTimeout(2000);
  if (options.action) await options.action(page);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();

  // Login first
  const login = await ctx.newPage();
  await login.goto(`${BASE}/admin/login`);
  await login.fill('input[type="email"]', ADMIN_EMAIL);
  await login.fill('input[type="password"]', ADMIN_PASSWORD);
  await login.click('button[type="submit"]');
  await login.waitForURL(/dashboard/);
  await login.close();
  console.log('Logged in');

  const targets = [
    ['orders_desktop',     '/admin/dashboard/orders',        1440, 900],
    ['orders_tablet',      '/admin/dashboard/orders',        768,  900],
    ['orders_mobile',      '/admin/dashboard/orders',        380,  700],
    ['cats_desktop',       '/admin/dashboard/categories',    1440, 900],
    ['cats_mobile',        '/admin/dashboard/categories',    380,  900],
    ['items_desktop',      '/admin/dashboard/menu-items',    1440, 900],
    ['items_mobile',       '/admin/dashboard/menu-items',    380,  900],
    ['tags',               '/admin/dashboard/tags',          1440, 900],
    ['banners',            '/admin/dashboard/banners',       1440, 900],
    ['social_links',       '/admin/dashboard/social-links',  1440, 900],
    ['users',              '/admin/dashboard/users',         1440, 900],
    ['public_mobile',      '/',                              380,  900],
    ['public_tablet',      '/',                              768,  900],
    ['public_desktop',     '/',                              1440, 900],
    ['confirm_mobile',     '/order-confirmed?ref=PREVIEW',   380,  900],
    ['confirm_tablet',     '/order-confirmed?ref=PREVIEW',   768,  900],
    ['confirm_desktop',    '/order-confirmed?ref=PREVIEW',   1440, 900],
  ];
  for (const [name, path, w, h] of targets) {
    await shootTop(ctx, path, w, h, name);
    console.log(`  ${name} → ${w}×${h}`);
  }

  await browser.close();
  console.log('done');
})();
