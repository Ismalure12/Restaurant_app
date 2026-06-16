const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('console', (m) => console.log(`[console.${m.type()}]`, m.text()));
  page.on('pageerror', (e) => console.log(`[pageerror]`, e.message));

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  // Scroll to first featured card
  await page.evaluate(() => {
    const el = document.querySelector('.item.featured');
    if (el) el.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(500);

  // Click via Playwright's click (not evaluate)
  await page.click('.item.featured .thumb', { force: true });
  await page.waitForTimeout(900);

  const state = await page.evaluate(() => ({
    pageOpenCount: document.querySelectorAll('.page.open').length,
    bodyOverflow: getComputedStyle(document.body).overflow,
    detail: (() => {
      const el = document.querySelector('.page.open');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return { top: r.top, left: r.left, width: r.width, height: r.height, transform: s.transform, position: s.position };
    })(),
  }));
  console.log('After Playwright click:', state);

  await page.screenshot({ path: 'test-results/royal-click-detail.png' });
  await browser.close();
})();
