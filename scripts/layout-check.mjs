import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 380, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const info = await page.evaluate(() => {
    const pages = Array.from(document.querySelectorAll('.page'));
    return {
      bodyScrollHeight: document.body.scrollHeight,
      bodyClientHeight: document.body.clientHeight,
      pageCount: pages.length,
      pages: pages.map((p) => {
        const cs = getComputedStyle(p);
        const r = p.getBoundingClientRect();
        return {
          classes: p.className,
          position: cs.position,
          transform: cs.transform,
          inset: `${cs.top} ${cs.right} ${cs.bottom} ${cs.left}`,
          rect: { x: r.x, y: r.y, w: r.width, h: r.height },
          visible: cs.display !== 'none' && cs.visibility !== 'hidden',
        };
      }),
    };
  });
  console.log(JSON.stringify(info, null, 2));

  await browser.close();
})();
