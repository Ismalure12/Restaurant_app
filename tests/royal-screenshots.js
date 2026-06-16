const { chromium } = require('playwright');

const VIEWPORTS = [
  { name: 'iphone-se', width: 320, height: 568 },
  { name: 'mobile-small', width: 375, height: 667 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
];

async function waitForContent(page) {
  // Wait for greeting H1 to be visible (post-load)
  await page.waitForSelector('.greeting h1', { timeout: 15000 });
  await page.waitForTimeout(800); // hero stagger animation settle
}

async function capture(ctx, vp, label, action) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  try {
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForContent(page);
    if (action) await action(page);
    const path = `test-results/royal-${vp.name}-${label}.png`;
    await page.screenshot({ path, fullPage: false });
    console.log(`${vp.name} ${label}: saved → ${path}`);
    if (errors.length) console.log(`  errors: ${errors.slice(0, 3).join(' | ')}`);
  } catch (e) {
    console.log(`${vp.name} ${label}: FAILED — ${e.message}`);
  }
  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });

    // 1. Home top
    await capture(ctx, vp, 'home-top', null);

    // 2. Home scrolled to first section
    await capture(ctx, vp, 'home-scrolled', async (page) => {
      await page.evaluate(() => window.scrollTo(0, 800));
      await page.waitForTimeout(500);
    });

    // 3. Category opened — click the show-more / open the full menu button
    await capture(ctx, vp, 'category', async (page) => {
      const btn = await page.$('.show-more');
      if (btn) {
        await btn.click();
        await page.waitForTimeout(800);
      }
    });

    // 4. Detail opened — click first item card
    await capture(ctx, vp, 'detail', async (page) => {
      const card = await page.$('.item.featured');
      if (card) {
        await card.click();
        await page.waitForTimeout(800);
      }
    });

    // 5. Cart opened (with item)
    await capture(ctx, vp, 'cart', async (page) => {
      // Add quick-add of featured
      const add = await page.$('.item.featured .add');
      if (add) {
        await add.click();
        await page.waitForTimeout(400);
      }
      // Open cart via FAB
      const fab = await page.$('.cart-fab');
      if (fab) {
        await fab.click();
        await page.waitForTimeout(700);
      }
    });

    await ctx.close();
  }
  await browser.close();
  console.log('Done');
})();
