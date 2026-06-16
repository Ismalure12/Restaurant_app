/* Manual browser sweep for v3 desktop layout + cover image rendering.
   Run: node tests/v3-verify.js
   Writes screenshots to tests/v3-screens/ */
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'v3-screens');
fs.mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:3000';

const sizes = [
  { name: 'phone-375', viewport: { width: 375, height: 800 } },
  { name: 'phone-414', viewport: { width: 414, height: 900 } },
  { name: 'tablet-820', viewport: { width: 820, height: 1180 } },
  { name: 'desktop-1280', viewport: { width: 1280, height: 900 } },
  { name: 'desktop-1600', viewport: { width: 1600, height: 1000 } },
];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const summary = [];
  for (const s of sizes) {
    const ctx = await browser.newContext({ viewport: s.viewport });
    const page = await ctx.newPage();
    const failedImgs = [];
    page.on('requestfailed', (req) => {
      if (req.resourceType() === 'image') failedImgs.push(req.url());
    });

    // Home
    await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, `${s.name}-home.png`), fullPage: false });

    // Click first category
    const firstCat = page.locator('.catnav .cat').nth(1);
    if (await firstCat.count()) {
      await firstCat.click({ trial: false }).catch(() => {});
      await page.waitForTimeout(600);
      // Check cat-hero src
      const heroInfo = await page.evaluate(() => {
        const el = document.querySelector('.cat-hero img');
        if (!el) return { found: false };
        return {
          found: true,
          src: el.src,
          naturalWidth: el.naturalWidth,
          naturalHeight: el.naturalHeight,
          complete: el.complete,
        };
      });
      await page.screenshot({ path: path.join(OUT, `${s.name}-category.png`), fullPage: false });

      // Cart fab
      const cartFab = page.locator('.cart-fab');
      // Try opening detail
      await page.locator('.mini-card, .item.featured').first().click({ trial: false }).catch(() => {});
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${s.name}-detail.png`), fullPage: false });
      // close detail
      await page.locator('.detail-top .icon-btn').first().click().catch(() => {});
      await page.waitForTimeout(300);

      summary.push({ size: s.name, heroInfo, failedImgs });
    } else {
      summary.push({ size: s.name, heroInfo: { found: false }, failedImgs });
    }

    await ctx.close();
  }

  await browser.close();
  console.log(JSON.stringify(summary, null, 2));
})().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
