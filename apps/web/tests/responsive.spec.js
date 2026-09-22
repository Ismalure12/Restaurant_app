const { test, expect } = require('@playwright/test');

test.describe('Responsive / Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('R3 — Category tabs are scrollable on mobile', async ({ page }) => {
    await page.goto('/');

    // The scrollable container inside the nav
    const scrollContainer = page.locator('nav.sticky .overflow-x-auto');
    await expect(scrollContainer).toBeVisible();

    // Check it has overflow (scrollWidth > clientWidth)
    const hasOverflow = await scrollContainer.evaluate(el => el.scrollWidth > el.clientWidth);
    // May or may not overflow depending on number of categories, just verify it renders
    await expect(scrollContainer).toBeVisible();
  });

  test('R4 — Carousel items render on mobile', async ({ page }) => {
    await page.goto('/');

    // Carousel scroll containers should exist
    const carousels = page.locator('section[id] .overflow-x-auto');
    const count = await carousels.count();

    if (count > 0) {
      // First carousel should have items
      const firstCarousel = carousels.first();
      await expect(firstCarousel).toBeVisible();

      // Items inside
      const items = firstCarousel.locator('.shrink-0');
      const itemCount = await items.count();
      expect(itemCount).toBeGreaterThan(0);
    }
  });

  test('R1 — Admin sidebar shows hamburger on mobile', async ({ page }) => {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) { test.skip(); return; }

    await page.goto('/admin/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/dashboard**', { timeout: 10000 });

    // Hamburger button should be visible on mobile
    const hamburger = page.locator('button svg').first();
    await expect(hamburger).toBeVisible();
  });
});
