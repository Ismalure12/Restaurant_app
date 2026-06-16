const { chromium } = require('playwright');

const VIEWPORTS = [
  { name: 'iphone-se', width: 320, height: 568 },
  { name: 'mobile-375', width: 375, height: 667 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 900 },
];

async function setup(page) {
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('.greeting h1', { timeout: 20000 });
  await page.waitForTimeout(1200);
}

(async () => {
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();

    try {
      await setup(page);

      // 1) Home top
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await page.screenshot({ path: `test-results/final-${vp.name}-1-home-top.png` });

      // 2) Show-more button area (open full menu)
      await page.evaluate(() => {
        const el = document.querySelector('.show-more');
        if (el) el.scrollIntoView({ block: 'center' });
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `test-results/final-${vp.name}-2-show-more.png` });

      // 3) Add to cart to make FAB visible, scroll to top
      await page.evaluate(() => {
        const el = document.querySelector('.item.featured .add');
        if (el) { el.scrollIntoView({ block: 'center' }); el.click(); }
      });
      await page.waitForTimeout(700);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `test-results/final-${vp.name}-3-cart-fab.png` });

      // 4) Open detail
      await page.evaluate(() => {
        const el = document.querySelector('.item.featured .thumb');
        if (el) { el.scrollIntoView({ block: 'center' }); el.click(); }
      });
      await page.waitForTimeout(900);
      await page.screenshot({ path: `test-results/final-${vp.name}-4-detail.png` });
      // Close detail
      await page.keyboard.press('Escape');
      await page.waitForTimeout(700);

      // 5) Open cart
      await page.evaluate(() => {
        const el = document.querySelector('.cart-fab');
        if (el) el.click();
      });
      await page.waitForTimeout(900);
      await page.screenshot({ path: `test-results/final-${vp.name}-5-cart.png` });
      // Close cart
      await page.keyboard.press('Escape');
      await page.waitForTimeout(700);

      // 6) Category open
      await page.evaluate(() => {
        const el = document.querySelector('.show-more');
        if (el) { el.scrollIntoView({ block: 'center' }); el.click(); }
      });
      await page.waitForTimeout(900);
      await page.screenshot({ path: `test-results/final-${vp.name}-6-category.png` });

      console.log(`${vp.name} (${vp.width}x${vp.height}) done`);
    } catch (e) {
      console.log(`${vp.name}: FAILED — ${e.message}`);
    }

    await ctx.close();
  }

  await browser.close();
})();
