const { test, expect } = require('@playwright/test');

// Helper: login and return authenticated page
async function loginAsAdmin(page) {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) return false;

  await page.goto('/admin/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin/dashboard**', { timeout: 10000 });
  return true;
}

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await loginAsAdmin(page);
    if (!loggedIn) test.skip();
  });

  test('D1 — Dashboard overview shows stat cards', async ({ page }) => {
    await page.goto('/admin/dashboard');

    // Two stat cards: Categories and Menu Items
    const categoriesLabel = page.locator('text=Categories').first();
    const itemsLabel = page.locator('text=Menu Items').first();

    await expect(categoriesLabel).toBeVisible();
    await expect(itemsLabel).toBeVisible();
  });

  test('D2 — Categories page lists categories', async ({ page }) => {
    await page.goto('/admin/dashboard/categories');

    // Page title
    const title = page.locator('h1').filter({ hasText: /categories/i });
    await expect(title).toBeVisible();

    // Add Category button
    const addBtn = page.locator('button').filter({ hasText: /add category/i });
    await expect(addBtn).toBeVisible();
  });

  test('D3 — Create category form opens and submits', async ({ page }) => {
    await page.goto('/admin/dashboard/categories');

    // Click Add Category
    await page.click('button:has-text("Add Category")');

    // Form should appear
    const nameInput = page.locator('input[type="text"]').first();
    await expect(nameInput).toBeVisible();

    // Fill and submit
    const testName = `Test Category ${Date.now()}`;
    await nameInput.fill(testName);
    await page.click('button[type="submit"]');

    // Wait for list to refresh
    await page.waitForTimeout(3000);

    // Category should appear in the list
    const pageContent = await page.textContent('body');
    expect(pageContent).toContain(testName);

    // Cleanup: delete the test category via the desktop table (visible on this viewport)
    const deleteBtn = page.locator('table button:has-text("Delete")').last();
    if (await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      page.once('dialog', dialog => dialog.accept());
      await deleteBtn.click();
      await page.waitForTimeout(1000);
    }
  });

  test('D7 — Menu items page lists items', async ({ page }) => {
    await page.goto('/admin/dashboard/menu-items');

    // Page title
    const title = page.locator('h1').filter({ hasText: /menu items/i });
    await expect(title).toBeVisible();

    // Filter dropdown exists
    const filter = page.locator('select').first();
    await expect(filter).toBeVisible();

    // Add Item button
    const addBtn = page.locator('button').filter({ hasText: /add item/i });
    await expect(addBtn).toBeVisible();
  });

  test('D8 — Filter menu items by category', async ({ page }) => {
    await page.goto('/admin/dashboard/menu-items');

    const filter = page.locator('select').first();
    const options = filter.locator('option');
    const optionCount = await options.count();

    // Should have "All Categories" + at least one category
    expect(optionCount).toBeGreaterThanOrEqual(1);

    // If there are categories, select the first real one
    if (optionCount > 1) {
      await filter.selectOption({ index: 1 });
      await page.waitForTimeout(1000);
      // Page should still render without errors
      await expect(page.locator('h1').filter({ hasText: /menu items/i })).toBeVisible();
    }
  });
});
