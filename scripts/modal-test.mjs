/* Tightly-scoped test: log in, open the menu-items edit modal, scroll
   to confirm the Save button is visible regardless of body height. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@restaurant.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';
const OUT = join(process.cwd(), 'browser-test-output');
mkdirSync(OUT, { recursive: true });

const widths = [
  { name: '380', w: 380, h: 720 },
  { name: '600', w: 600, h: 800 },
  { name: '768', w: 768, h: 900 },
  { name: '1024', w: 1024, h: 800 },
  { name: '1440', w: 1440, h: 900 },
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const login = await ctx.newPage();
  await login.goto(`${BASE}/admin/login`);
  await login.waitForSelector('input[type="email"]');
  await login.fill('input[type="email"]', ADMIN_EMAIL);
  await login.fill('input[type="password"]', ADMIN_PASSWORD);
  await login.click('button[type="submit"]');
  await login.waitForURL(/\/admin\/dashboard/, { timeout: 10000 });
  console.log('Logged in');
  await login.close();

  for (const wInfo of widths) {
    const page = await ctx.newPage();
    await page.setViewportSize({ width: wInfo.w, height: wInfo.h });

    await page.goto(`${BASE}/admin/dashboard/menu-items`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Find and click the first Edit button (the rendered list switches between
    // <table> on desktop and <.adm-card> on mobile; either way the button text is "Edit")
    const clicked = await page.evaluate(() => {
      const visible = (el) => el.offsetParent !== null;
      const btns = Array.from(document.querySelectorAll('button.adm-link'));
      const edit = btns.find((b) => b.textContent.trim() === 'Edit' && visible(b));
      if (edit) { edit.click(); return true; }
      return false;
    });
    console.log(`@${wInfo.w}: edit clicked = ${clicked}`);
    if (!clicked) { await page.close(); continue; }
    await page.waitForSelector('.adm-modal', { timeout: 3000 });
    await page.waitForTimeout(500);

    // Initial screenshot — modal opened, body should be scrollable, foot pinned
    await page.screenshot({ path: join(OUT, `modal-open__${wInfo.name}.png`), fullPage: false });

    // Is Save changes button visible & in viewport?
    const saveBtn = page.locator('.adm-modal-foot button[type="submit"]');
    const saveVisible = await saveBtn.isVisible().catch(() => false);
    const box = saveVisible ? await saveBtn.boundingBox().catch(() => null) : null;
    console.log(`  Save visible: ${saveVisible}  box: ${box ? `x=${box.x.toFixed(0)} y=${box.y.toFixed(0)} ${box.width.toFixed(0)}x${box.height.toFixed(0)}` : '–'}  viewportH=${wInfo.h}`);

    // Scroll modal body to bottom and re-check (foot should stay sticky)
    await page.evaluate(() => {
      const body = document.querySelector('.adm-modal-body');
      if (body) body.scrollTop = body.scrollHeight;
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, `modal-scrolled__${wInfo.name}.png`), fullPage: false });

    const stillVisible = await saveBtn.isVisible().catch(() => false);
    const box2 = stillVisible ? await saveBtn.boundingBox().catch(() => null) : null;
    console.log(`  After scroll → Save visible: ${stillVisible}  box: ${box2 ? `x=${box2.x.toFixed(0)} y=${box2.y.toFixed(0)} ${box2.width.toFixed(0)}x${box2.height.toFixed(0)}` : '–'}`);

    await page.close();
  }

  await browser.close();
  console.log('done');
})().catch((e) => { console.error(e); process.exit(1); });
