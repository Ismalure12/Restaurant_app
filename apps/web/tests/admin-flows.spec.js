const { test, expect } = require('@playwright/test');
const { D, signIn, requireWrites, watchErrors, settle } = require('./helpers');

// Journeys that write. Scratch database only (E2E_ALLOW_WRITES=1).
test.describe('Admin journeys (writes)', () => {
  test.beforeEach(() => { requireWrites(); });

  test('F1 — manager creates a category, then deletes it', async ({ page }) => {
    await signIn(page, 'manager');
    const errors = watchErrors(page);
    await page.goto(`${D}/categories`);
    await settle(page);

    const name = `E2E Category ${Date.now()}`;
    await page.getByRole('button', { name: 'New category' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Category name').fill(name);
    await dialog.getByRole('button', { name: 'Add category' }).click();
    await expect(dialog).toBeHidden();
    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row).toBeVisible();

    // Open it again and delete (empty category → confirm dialog).
    await row.getByText(name).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete category' }).click();
    await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('F2 — Register: dine-in Pay later → Orders: take payment → Sales history', async ({ page }) => {
    await signIn(page, 'manager');
    const errors = watchErrors(page);
    await page.goto(`${D}/pos`);
    await settle(page);

    // First item on the grid; every demo item has options, so the customizer opens.
    await page.locator('section[aria-label="Menu"] button[title^="Add "]').first().click();
    const custom = page.getByRole('dialog');
    const addBtn = custom.getByRole('button', { name: /^Add · / });
    const price = (await addBtn.innerText()).match(/\$[\d,.]+/)[0];
    await addBtn.click();
    await expect(custom).toBeHidden();

    const ticket = page.locator('[aria-label="Ticket"]');
    const waiter = ticket.getByLabel('Served by');
    if (await waiter.count()) await waiter.selectOption({ index: 1 });
    const table = ticket.getByLabel('Table');
    if (await table.count() && await table.evaluate((el) => el.tagName === 'INPUT')) await table.fill('E2E');

    // Dine-in defaults to Pay later.
    const placed = page.waitForResponse((r) => r.url().endsWith('/api/admin/pos/orders') && r.request().method() === 'POST');
    await ticket.getByRole('button', { name: 'Send to kitchen' }).click();
    const res = await placed;
    expect(res.status()).toBe(201);
    const order = await res.json();
    expect(order.status).toBe('open');
    await expect(ticket.getByText(/Sent to kitchen/)).toBeVisible();

    // Orders › the unpaid order › Take payment (defaults: full amount, first till account).
    await page.goto(`${D}/orders/${order.id}`);
    await settle(page);
    await page.getByRole('button', { name: /^Take payment · / }).click();
    const payDialog = page.getByRole('dialog');
    const paid = page.waitForResponse((r) => r.url().includes(`/api/admin/orders/${order.id}/pay`));
    await payDialog.getByRole('button', { name: /^Paid \$[\d,.]+ · print receipt$/ }).click();
    expect((await paid).status()).toBe(200);
    await expect(payDialog).toBeHidden();

    // It is now a closed sale with a receipt number, for the amount on the card.
    const sales = await (await page.request.get(`/api/admin/sales?q=${encodeURIComponent(order.code)}`)).json();
    const sale = sales.rows.find((r) => r.id === order.id);
    expect(sale).toBeTruthy();
    expect(sale.receiptNo).toMatch(/^\d+$/);
    expect(`$${Number(sale.total).toFixed(2)}`).toBe(price);

    await page.goto(`${D}/sales?q=${encodeURIComponent(order.code)}`);
    await settle(page);
    await expect(page.getByText(order.code, { exact: true }).locator('visible=true').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
