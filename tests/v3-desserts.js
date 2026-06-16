const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const OUT = path.join(__dirname, 'v3-screens');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  // Click the Desserts tab in catnav by text
  const dessertsTab = page.locator('.catnav .cat', { hasText: 'Desserts' });
  await dessertsTab.click().catch(() => {});
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => {
    const img = document.querySelector('.cat-hero img');
    if (!img) return { found: false };
    return {
      found: true,
      src: img.src,
      naturalWidth: img.naturalWidth,
      complete: img.complete,
      isPlaceholder: img.src.startsWith('data:image/svg+xml'),
    };
  });
  await page.screenshot({ path: path.join(OUT, 'desktop-1280-desserts.png'), fullPage: false });

  // Also check Dinner (mains), Drinks, every category for placeholder
  const slugs = ['breakfast', 'lunch', 'starters', 'mains', 'pasta', 'desserts', 'drinks'];
  const result = { dessertsHero: info, perCategory: [] };
  for (const slug of slugs) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const tab = page.locator(`.catnav .cat[data-cat="${slug}"]`).first();
    if (!await tab.count()) continue;
    await tab.click();
    await page.waitForTimeout(900);
    const i = await page.evaluate(() => {
      const img = document.querySelector('.cat-hero img');
      if (!img) return null;
      return { src: img.src, complete: img.complete, isPlaceholder: img.src.startsWith('data:image/svg+xml') };
    });
    result.perCategory.push({ slug, ...i });
  }

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
