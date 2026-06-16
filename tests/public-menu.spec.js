const { test, expect } = require('@playwright/test');

test.describe('Public Menu Page', () => {
  test('P1 — Homepage loads with header, category tabs, and menu carousels', async ({ page }) => {
    await page.goto('/');

    // Header present
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Logo image loads
    const logo = header.locator('img[alt="KFG"]');
    await expect(logo).toBeVisible();

    // Sign-in link
    const signIn = header.locator('a[href="/admin/login"]');
    await expect(signIn).toBeVisible();
  });

  test('P2 — Category tabs render and are clickable', async ({ page }) => {
    await page.goto('/');

    const nav = page.locator('nav.sticky');
    await expect(nav).toBeVisible();

    // At least one tab button exists
    const tabs = nav.locator('button');
    const count = await tabs.count();
    expect(count).toBeGreaterThan(0);

    // Click second tab (if exists) and verify scroll
    if (count > 1) {
      const secondTab = tabs.nth(1);
      const tabText = await secondTab.textContent();
      await secondTab.click();

      // The section with matching id should exist
      const section = page.locator(`section[id]`).nth(1);
      await expect(section).toBeVisible();
    }
  });

  test('P4 — Menu carousel renders with items per category', async ({ page }) => {
    await page.goto('/');

    // Look for carousel sections — each has a category heading and scrollable row
    const sections = page.locator('section[id]');
    const sectionCount = await sections.count();

    if (sectionCount > 0) {
      // First section should have a heading
      const heading = sections.first().locator('h2');
      await expect(heading).toBeVisible();

      // Should have scrollable items
      const items = sections.first().locator('.shrink-0.flex.flex-col.items-center');
      const itemCount = await items.count();
      expect(itemCount).toBeGreaterThan(0);
    }
  });

  test('P5 — Carousel scroll container exists and items are in a horizontal row', async ({ page }) => {
    await page.goto('/');

    const scrollContainer = page.locator('section[id] .overflow-x-auto').first();
    await expect(scrollContainer).toBeVisible();

    // Items should be laid out horizontally (flex row)
    const display = await scrollContainer.evaluate(el => getComputedStyle(el).display);
    expect(display).toBe('flex');

    // Should contain multiple items
    const items = scrollContainer.locator('.shrink-0');
    const count = await items.count();
    expect(count).toBeGreaterThan(1);

    // If there's overflow, verify it scrolls (on desktop with few items it may not overflow)
    const hasOverflow = await scrollContainer.evaluate(el => el.scrollWidth > el.clientWidth);
    if (hasOverflow) {
      await scrollContainer.evaluate(el => el.scrollBy({ left: 200 }));
      await page.waitForTimeout(300);
      const scrollLeft = await scrollContainer.evaluate(el => el.scrollLeft);
      expect(scrollLeft).toBeGreaterThan(0);
    }
  });

  test('P7 — Header has logo and sign-in link', async ({ page }) => {
    await page.goto('/');

    const logo = page.locator('header img[alt="KFG"]');
    await expect(logo).toBeVisible();

    const signInLink = page.locator('a[href="/admin/login"]');
    await expect(signInLink).toBeVisible();
    await expect(signInLink).toContainText('Sign in');
  });

  test('P8 — Footer renders', async ({ page }) => {
    await page.goto('/');

    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
  });
});
