/* Manual browser test — uses Playwright to walk every page at multiple
   widths and capture screenshots so we can spot regressions. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@royalhotel.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const OUT = join(process.cwd(), 'browser-test-output');
mkdirSync(OUT, { recursive: true });

const widths = [
  { name: '340', w: 340, h: 720 },
  { name: '380', w: 380, h: 720 },
  { name: '600', w: 600, h: 800 },
  { name: '768', w: 768, h: 900 },
  { name: '1024', w: 1024, h: 800 },
  { name: '1440', w: 1440, h: 900 },
];

const adminPages = [
  '/admin/dashboard',
  '/admin/dashboard/orders',
  '/admin/dashboard/menu-items',
  '/admin/dashboard/categories',
  '/admin/dashboard/tags',
  '/admin/dashboard/banners',
  '/admin/dashboard/social-links',
  '/admin/dashboard/users',
];

async function tryLogin(ctx) {
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('  [console error]', m.text()); });
  page.on('pageerror', (e) => console.error('  [pageerror]', e.message));
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 5000 });
    await page.fill('input[type="email"], input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"], input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin\/dashboard/, { timeout: 8000 });
    console.log('  ✓ Logged in');
    await page.close();
    return true;
  } catch (e) {
    console.log('  ✗ Could not log in:', e.message);
    await page.close();
    return false;
  }
}

async function shootPath(ctx, path, widthInfo) {
  const page = await ctx.newPage();
  let consoleErrs = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  page.on('pageerror', (e) => consoleErrs.push(`pageerror: ${e.message}`));
  await page.setViewportSize({ width: widthInfo.w, height: widthInfo.h });
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 15000 });
  } catch {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  }
  await page.waitForTimeout(800);
  const safePath = path.replace(/\W+/g, '_') || 'root';
  const file = join(OUT, `${safePath}__${widthInfo.name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => null);
  console.log(`  ${path} @${widthInfo.w} → ${file}`);
  if (consoleErrs.length) {
    console.log(`    console errors (${consoleErrs.length}):`);
    consoleErrs.slice(0, 5).forEach((e) => console.log(`      • ${e.slice(0, 200)}`));
  }
  await page.close();
}

async function shootMenuItemEditModal(ctx) {
  // Open the menu items page, click Edit on the first row, screenshot the modal at
  // multiple widths so we can confirm the Save button is visible.
  console.log('\n→ menu-items edit modal (Save button visibility)');
  for (const widthInfo of widths.filter(({ w }) => w >= 380)) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: widthInfo.w, height: widthInfo.h });
    try {
      await page.goto(`${BASE}/admin/dashboard/menu-items`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      // Open mobile sidebar if needed — irrelevant; we just need Edit buttons.
      const editBtns = await page.locator('text=/Edit/').all();
      if (editBtns.length === 0) {
        console.log(`    no edit button found at ${widthInfo.w}`);
        await page.close();
        continue;
      }
      await editBtns[0].click().catch(() => null);
      await page.waitForTimeout(800);
      const file = join(OUT, `menuitem_modal__${widthInfo.name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      // Check if "Save changes" button is in viewport
      const save = page.locator('button:has-text("Save changes")');
      const visible = await save.first().isVisible().catch(() => false);
      const box = visible ? await save.first().boundingBox().catch(() => null) : null;
      console.log(`    @${widthInfo.w}  visible=${visible}  box=${box ? `${box.x.toFixed(0)},${box.y.toFixed(0)} ${box.width.toFixed(0)}x${box.height.toFixed(0)}` : 'n/a'}`);
    } catch (e) {
      console.log(`    error: ${e.message}`);
    }
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  console.log(`Base: ${BASE}\nOutput dir: ${OUT}\n`);

  console.log('→ Public pages');
  for (const widthInfo of widths) {
    await shootPath(ctx, '/', widthInfo);
  }

  console.log('\n→ Login');
  const ok = await tryLogin(ctx);

  if (ok) {
    for (const p of adminPages) {
      console.log(`\n→ ${p}`);
      for (const widthInfo of widths) {
        await shootPath(ctx, p, widthInfo);
      }
    }
    await shootMenuItemEditModal(ctx);
  }

  console.log('\n→ Order confirmation');
  // Fake ref — page should still render the loading/error state responsively.
  for (const widthInfo of widths) {
    await shootPath(ctx, '/order-confirmed?ref=PREVIEW', widthInfo);
  }

  await browser.close();
  console.log('\nDone.');
})().catch((e) => { console.error(e); process.exit(1); });
