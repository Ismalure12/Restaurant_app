const { test, expect } = require('@playwright/test');
const { D, account } = require('./helpers');

test.describe('Admin authentication', () => {
  test('A1 — login page renders email, password and sign-in button', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('A2 — wrong credentials show an error and stay on the login page', async ({ page }) => {
    await page.goto('/admin/login');
    await page.fill('input[type="email"]', 'nobody@example.com');
    await page.fill('input[type="password"]', 'wrong-password');
    const res = page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST');
    await page.click('button[type="submit"]');
    expect((await res).status()).toBe(401);
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByText(/invalid|incorrect|wrong/i).first()).toBeVisible();
  });

  test('A3 — signed-out visitors are sent to the login page', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto(`${D}/orders`);
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('A4 — the API refuses admin data without a session', async ({ request }) => {
    for (const path of ['/api/auth/me', '/api/admin/orders', '/api/admin/sales', '/api/users', '/api/admin/settings']) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(401);
    }
  });

  test('A5 — valid login lands on the dashboard; sign out ends the session', async ({ page }) => {
    const acc = account('admin');
    test.skip(!acc, 'no admin account');

    await page.goto('/admin/login');
    await page.fill('input[type="email"]', acc.email);
    await page.fill('input[type="password"]', acc.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(`**${D}**`, { timeout: 15000 });

    // Sign out sits in the expanded sidebar; on a narrow screen open it first.
    const signOut = page.getByRole('button', { name: 'Sign out' });
    if (!(await signOut.isVisible())) {
      const opener = page.getByRole('button', { name: /^(Menu|Expand navigation)$/ }).first();
      await opener.click();
    }
    await signOut.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/admin/login**', { timeout: 10000 });

    expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  });
});
