const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const OUT = path.join(__dirname, 'v3-screens'); fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const failedImgs = [];
  page.on('requestfailed', (req) => { if (req.resourceType() === 'image') failedImgs.push(req.url()); });

  const out = [];
  for (const slug of ['breakfast','lunch','starters','mains','pasta','desserts','drinks']) {
    await page.goto('http://localhost:3000?_=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(2500);
    // click the matching .catnav .cat by its data-cat
    await page.evaluate((s) => {
      const btns = document.querySelectorAll('.catnav .cat');
      for (const b of btns) {
        const c = b.querySelector('.count'); // just to be sure
        if (b.dataset && b.dataset.cat === s) { b.click(); return; }
      }
    }, slug);
    await page.waitForTimeout(1800);
    const info = await page.evaluate(() => {
      const img = document.querySelector('.cat-hero img');
      const title = document.querySelector('.cat-hero h1')?.textContent;
      if (!img) return { found: false, title };
      return {
        found: true,
        title,
        src: img.src,
        complete: img.complete,
        nat: img.naturalWidth + 'x' + img.naturalHeight,
        isPlaceholder: img.src.startsWith('data:image/svg+xml'),
      };
    });
    await page.screenshot({ path: path.join(OUT, `cat-${slug}.png`), fullPage: false });
    out.push({ slug, ...info });
  }
  console.log(JSON.stringify(out, null, 2));
  console.log('Image request failures:', failedImgs.length, failedImgs);
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
