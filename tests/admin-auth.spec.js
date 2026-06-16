const { test, expect } = require('@playwright/test');

test.describe('Admin Authentication', () => {
  test('A1 — Login page renders with email and password fields', async ({ page }) => {
    await page.goto('/admin/login');

    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitButton = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();
  });

  test('A2 — Invalid credentials show error', async ({ page }) => {
    await page.goto('/admin/login');

    await page.fill('input[type="email"]', 'wrong@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Should show error or stay on login page
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('A4 — Unauthenticated access to dashboard redirects to login', async ({ page }) => {
    // Clear any auth cookies
    await page.context().clearCookies();

    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('A3 — Valid login redirects to dashboard', async ({ page }) => {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      test.skip();
      return;
    }

    await page.goto('/admin/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    await page.waitForURL('**/admin/dashboard**', { timeout: 10000 });
    await expect(page).toHaveURL(/\/admin\/dashboard/);
  });

  test('A5 — Logout clears session', async ({ page }) => {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      test.skip();
      return;
    }

    // Login first
    await page.goto('/admin/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/dashboard**', { timeout: 10000 });

    // Click logout
    const logoutBtn = page.locator('button').filter({ hasText: /logout/i });
    await logoutBtn.click();

    await page.waitForURL('**/admin/login**', { timeout: 10000 });
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
