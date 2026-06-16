import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://localhost:3000';
const REF = 'rh-2f533fe1-7e5b-4b88-8680-a02f61fbaf57';
const OUT = join(process.cwd(), 'browser-test-output', 'final');
mkdirSync(OUT, { recursive: true });

const widths = [
  { name: 'confirm_real_mobile',  w: 380,  h: 900 },
  { name: 'confirm_real_tablet',  w: 768,  h: 900 },
  { name: 'confirm_real_desktop', w: 1440, h: 900 },
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  for (const wi of widths) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: wi.w, height: wi.h });
    await page.goto(`${BASE}/order-confirmed?ref=${REF}`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: join(OUT, `${wi.name}.png`), fullPage: true });
    console.log(`  ${wi.name} done`);
    await page.close();
  }
  await browser.close();
})();
