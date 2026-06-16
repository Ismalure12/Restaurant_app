const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('console', (m) => console.log(`[console.${m.type()}]`, m.text()));
  page.on('pageerror', (e) => console.log(`[pageerror]`, e.message));

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Check React fibers / hydration
  const hydration = await page.evaluate(() => {
    const root = document.querySelector('.rh-root');
    if (!root) return 'no-root';
    // Check for React fiber attached
    const keys = Object.keys(root);
    const fiberKey = keys.find((k) => k.startsWith('__reactFiber'));
    const propsKey = keys.find((k) => k.startsWith('__reactProps'));
    return {
      hasFiber: !!fiberKey,
      hasProps: !!propsKey,
    };
  });
  console.log('Hydration state:', hydration);

  // Check what happens when we click featured
  await page.evaluate(() => {
    const el = document.querySelector('.item.featured');
    if (!el) return null;
    const keys = Object.keys(el);
    const propsKey = keys.find((k) => k.startsWith('__reactProps'));
    if (propsKey) {
      const props = el[propsKey];
      console.log('Featured props keys:', Object.keys(props).join(','));
      console.log('Has onClick?:', typeof props.onClick);
    } else {
      console.log('No reactProps key on featured');
    }
  });

  // Try the cart-fab — visible cart-fab needs cartCount > 0
  // Try quickAdd via .add button instead
  await page.evaluate(() => {
    const el = document.querySelector('.item.featured .add');
    if (!el) return 'no-add';
    el.scrollIntoView({ block: 'center' });
    el.click();
    return 'clicked-add';
  });
  await page.waitForTimeout(900);

  const afterAdd = await page.evaluate(() => ({
    cartFabVisible: !!document.querySelector('.cart-fab.visible'),
    cartFabClasses: document.querySelector('.cart-fab')?.className,
  }));
  console.log('After clicking .add:', afterAdd);

  await browser.close();
})();
