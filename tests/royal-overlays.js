const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();

  // Mobile: open detail by clicking first FeaturedCard thumb explicitly
  for (const vp of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'desktop', width: 1280, height: 900 },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`  pageerror: ${e.message}`));
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('.greeting h1', { timeout: 15000 });
    await page.waitForTimeout(600);

    // Click first featured card's THUMB (avoid stopPropagation on .add)
    const thumb = await page.$('.item.featured .thumb');
    if (thumb) {
      await thumb.click();
      await page.waitForTimeout(800);
    }

    // Check if page.open exists
    const detailOpen = await page.evaluate(() => !!document.querySelector('.page.open'));
    const detailVisible = await page.evaluate(() => {
      const el = document.querySelector('.page.open');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return { top: r.top, left: r.left, width: r.width, height: r.height, transform: s.transform };
    });
    console.log(`${vp.name} detail.open: ${detailOpen}`, detailVisible);

    await page.screenshot({ path: `test-results/royal-${vp.name}-detail-v2.png` });

    // Close detail (Escape)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);

    // Quick-add via featured .add button
    const add = await page.$('.item.featured .add');
    if (add) {
      await add.click();
      await page.waitForTimeout(400);
    }

    // Open cart via FAB
    const fab = await page.$('.cart-fab');
    if (fab) {
      await fab.click();
      await page.waitForTimeout(800);
    }

    const cartOpen = await page.evaluate(() => {
      const pages = document.querySelectorAll('.page.open');
      const out = [];
      pages.forEach((el) => {
        const r = el.getBoundingClientRect();
        out.push({ top: r.top, left: r.left, width: r.width, height: r.height, hasCartHead: !!el.querySelector('.cart-head') });
      });
      return out;
    });
    console.log(`${vp.name} cart.open:`, cartOpen);

    await page.screenshot({ path: `test-results/royal-${vp.name}-cart-v2.png` });

    await ctx.close();
  }
  await browser.close();
  console.log('Done');
})();
