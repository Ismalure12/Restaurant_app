const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('console', (m) => console.log(`[${m.type()}]`, m.text()));
  page.on('pageerror', (e) => console.log(`[pageerror]`, e.message, e.stack));
  page.on('requestfailed', (r) => console.log(`[requestfailed]`, r.url(), r.failure().errorText));
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('.jpg') && !r.url().includes('.png') && !r.url().includes('.jpeg') && !r.url().includes('.webp')) {
      console.log(`[response.${r.status()}]`, r.url());
    }
  });

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const state = await page.evaluate(() => {
    return {
      hasReact: typeof window !== 'undefined' && !!window.React,
      // Check for fiber-attached node
      featuredFiber: (() => {
        const el = document.querySelector('.item.featured');
        if (!el) return 'no-element';
        return Object.keys(el).filter(k => k.startsWith('__react')).join(',') || 'none';
      })(),
      bodyFiber: (() => {
        const el = document.body;
        return Object.keys(el).filter(k => k.startsWith('__react')).join(',') || 'none';
      })(),
      rhRootFiber: (() => {
        const el = document.querySelector('.rh-root');
        return el ? (Object.keys(el).filter(k => k.startsWith('__react')).join(',') || 'none') : 'no-element';
      })(),
    };
  });
  console.log('State:', state);

  await browser.close();
})();
