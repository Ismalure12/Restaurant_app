const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
  const page = await ctx.newPage();
  // hard nav with cache-bust
  await page.goto('http://localhost:3000?_=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelectorAll('.catnav .cat').forEach((b) => { if (b.textContent.includes('Desserts')) b.click(); }));
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => {
    const img = document.querySelector('.cat-hero img');
    return img ? { src: img.src, complete: img.complete, isPlaceholder: img.src.startsWith('data:image/svg+xml') } : null;
  });
  console.log(JSON.stringify(info, null, 2));
  await page.screenshot({ path: path.join(__dirname, 'v3-screens', 'desktop-1280-desserts-v2.png'), fullPage: false });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
