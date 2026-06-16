// Visual verification: render the design HTML (reference) and our admin pages,
// screenshot both at desktop + mobile, light + dark, into tmp/shots/.
// Usage: node scripts/verify-admin.mjs [pageName ...]   (default: all)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const DESIGN_DIR = 'C:/Users/hp/AppData/Local/Temp/root_design/jazeera-hotel/project';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = path.resolve('tmp/shots');
mkdirSync(OUT, { recursive: true });

// pageName -> { design html, our route }
const PAGES = {
  overview:   { design: 'overview-ledger.html', route: '/admin/dashboard' },
  pos:        { design: 'pos.html',             route: '/admin/dashboard/pos' },
  orders:     { design: 'orders.html',          route: '/admin/dashboard/orders' },
  insights:   { design: 'insights.html',        route: '/admin/dashboard/insights' },
  inventory:  { design: 'inventory.html',       route: '/admin/dashboard/inventory' },
  staff:      { design: 'staff.html',           route: '/admin/dashboard/users' },
  'menu-items': { design: 'menu-items.html',    route: '/admin/dashboard/menu-items' },
  categories: { design: 'categories.html',      route: '/admin/dashboard/categories' },
  settings:   { design: 'settings.html',        route: '/admin/dashboard/settings' },
};

const VIEWPORTS = [{ tag: 'd', width: 1440, height: 1000 }, { tag: 'm', width: 390, height: 844 }];
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PAGES);

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

async function shot(page, file, settle = 1200) {
  await page.waitForTimeout(settle);
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  console.log('  saved', file);
}

const browser = await chromium.launch({ channel: 'chrome' });
try {
  // ----- reference (design HTML) -----
  for (const name of wanted) {
    const p = PAGES[name]; if (!p) continue;
    const url = pathToFileURL(path.join(DESIGN_DIR, p.design)).href;
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForSelector('.app', { timeout: 5000 }).catch(() => {});
      console.log('REF', name, vp.tag);
      await shot(page, `${name}-ref-${vp.tag}.png`);
      await ctx.close();
    }
  }

  // ----- ours (live app, authenticated) -----
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, baseURL: BASE });
    // log in (shares cookie jar with the context's pages)
    const res = await ctx.request.post('/api/auth/login', { data: { email, password } });
    if (!res.ok()) { console.error('LOGIN FAILED', res.status(), await res.text()); await ctx.close(); continue; }
    await ctx.addInitScript((t) => { try { localStorage.setItem('hj_theme', t); } catch {} }, theme);
    for (const name of wanted) {
      const p = PAGES[name]; if (!p) continue;
      for (const vp of VIEWPORTS) {
        const page = await ctx.newPage();
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(p.route, { waitUntil: 'networkidle' }).catch(() => {});
        await page.waitForLoadState('networkidle').catch(() => {});
        console.log('OURS', name, theme, vp.tag);
        await shot(page, `${name}-ours-${theme}-${vp.tag}.png`, 3500);
        await page.close();
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log('done →', OUT);
