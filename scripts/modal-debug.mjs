import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@restaurant.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));

  await page.goto(`${BASE}/admin/login`);
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin\/dashboard/);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/admin/dashboard/menu-items`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // What elements are on the page?
  const counts = await page.evaluate(() => ({
    admLinks: document.querySelectorAll('.adm-link').length,
    editButtons: Array.from(document.querySelectorAll('button')).filter((b) => b.textContent.trim() === 'Edit').length,
    rows: document.querySelectorAll('tbody tr').length,
    cards: document.querySelectorAll('.adm-card').length,
    tablesVisible: Array.from(document.querySelectorAll('.adm-table')).map((t) => t.offsetWidth > 0).filter(Boolean).length,
  }));
  console.log('counts:', counts);

  // Try clicking first Edit
  const firstEdit = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button.adm-link'));
    const edit = btns.find((b) => b.textContent.trim() === 'Edit');
    if (edit) {
      edit.click();
      return true;
    }
    return false;
  });
  console.log('clicked:', firstEdit);
  await page.waitForTimeout(1500);

  // Check modal
  const modalInfo = await page.evaluate(() => {
    const modal = document.querySelector('.adm-modal');
    const foot = document.querySelector('.adm-modal-foot');
    const submit = document.querySelector('.adm-modal-foot button[type="submit"]');
    const modalRect = modal?.getBoundingClientRect();
    const footRect = foot?.getBoundingClientRect();
    const submitRect = submit?.getBoundingClientRect();
    return {
      hasModal: !!modal,
      hasFoot: !!foot,
      hasSubmit: !!submit,
      modalRect: modalRect ? { top: modalRect.top, bottom: modalRect.bottom, height: modalRect.height } : null,
      footRect: footRect ? { top: footRect.top, bottom: footRect.bottom, height: footRect.height } : null,
      submitRect: submitRect ? { top: submitRect.top, bottom: submitRect.bottom, height: submitRect.height, width: submitRect.width } : null,
      viewportH: window.innerHeight,
      submitText: submit?.textContent,
    };
  });
  console.log('modalInfo:', JSON.stringify(modalInfo, null, 2));

  await page.screenshot({ path: 'browser-test-output/debug-modal.png', fullPage: false });

  await browser.close();
})();
