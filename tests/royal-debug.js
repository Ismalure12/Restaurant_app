const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('console', (m) => console.log(`[console.${m.type()}]`, m.text()));
  page.on('pageerror', (e) => console.log(`[pageerror]`, e.message));

  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.greeting h1', { timeout: 15000 });
  await page.waitForTimeout(1000);

  const counts = await page.evaluate(() => ({
    items_featured: document.querySelectorAll('.item.featured').length,
    mini_cards: document.querySelectorAll('.mini-card').length,
    wide_cards: document.querySelectorAll('.item.wide').length,
    show_more: document.querySelectorAll('.show-more').length,
    pages: document.querySelectorAll('.page').length,
    cart_fabs: document.querySelectorAll('.cart-fab').length,
    sections: document.querySelectorAll('.section').length,
    docHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
    bodyOverflow: getComputedStyle(document.body).overflow,
    shellOverflow: getComputedStyle(document.querySelector('.shell')).overflow,
  }));
  console.log('DOM counts:', counts);

  // Scroll to first featured card
  await page.evaluate(() => {
    const el = document.querySelector('.item.featured');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await page.waitForTimeout(600);

  // Check featured position
  const firstFeatured = await page.evaluate(() => {
    const el = document.querySelector('.item.featured');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, height: r.height, left: r.left, width: r.width };
  });
  console.log('First featured rect:', firstFeatured);

  // Click via JS
  const clickResult = await page.evaluate(() => {
    const el = document.querySelector('.item.featured');
    if (!el) return 'no-element';
    el.click();
    return 'clicked';
  });
  console.log('Click result:', clickResult);
  await page.waitForTimeout(900);

  const afterClick = await page.evaluate(() => ({
    pageOpen: !!document.querySelector('.page.open'),
    bodyOverflow: getComputedStyle(document.body).overflow,
    detailVisible: (() => {
      const el = document.querySelector('.page.open .detail');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return { top: r.top, height: r.height };
    })(),
  }));
  console.log('After click:', afterClick);

  await page.screenshot({ path: 'test-results/royal-debug-after-click.png', fullPage: false });

  await browser.close();
  console.log('Done');
})();
