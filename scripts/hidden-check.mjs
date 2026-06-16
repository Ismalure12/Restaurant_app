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
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/admin/dashboard/categories`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    const allMobile = Array.from(document.querySelectorAll('.md\\:hidden'));
    const allDesktop = Array.from(document.querySelectorAll('.md\\:block'));
    return {
      vp: window.innerWidth,
      mobile: allMobile.map((el) => ({ classes: el.className, display: getComputedStyle(el).display })),
      desktop: allDesktop.map((el) => ({ classes: el.className, display: getComputedStyle(el).display })),
    };
  });
  console.log(JSON.stringify(info, null, 2));

  await browser.close();
})();
