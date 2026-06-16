const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();

  // Mobile viewport
  const mobilePage = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await mobilePage.goto('http://localhost:3000/preview', { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(1500);
  await mobilePage.screenshot({ path: 'test-results/preview-mobile.png', fullPage: true });
  console.log('Mobile screenshot saved');

  // Desktop viewport
  const desktopPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desktopPage.goto('http://localhost:3000/preview', { waitUntil: 'networkidle' });
  await desktopPage.waitForTimeout(1500);
  await desktopPage.screenshot({ path: 'test-results/preview-desktop.png', fullPage: true });
  console.log('Desktop screenshot saved');

  await browser.close();
})();
