const { test, expect } = require('@playwright/test');
const { requireWrites, watchErrors } = require('./helpers');

const money = (n) => `$${Number(n).toFixed(2)}`;

// The first dish of the first category that has dishes, with the price the
// detail screen starts at: base + first option of each group (the default pick).
async function firstDish(request) {
  const menu = await (await request.get('/api/menu')).json();
  const cat = menu.categories.find((c) => c.items.length);
  const item = cat.items[0];
  const start = Number(item.price) + (item.optionGroups || []).reduce((s, g) => s + Number(g.options?.[0]?.priceAdd || 0), 0);
  return { menu, cat, item, start };
}

test.describe('Public menu', () => {
  test('P1 — home shows the menu rail and one section per category', async ({ page, request }) => {
    const errors = watchErrors(page);
    const { menu } = await firstDish(request);
    const withItems = menu.categories.filter((c) => c.items.length);

    await page.goto('/');
    await expect(page.locator('.home-topbar')).toBeVisible();
    await expect(page.locator('.cat-tile')).toHaveCount(withItems.length);
    await expect(page.locator('#homeSections > section.section')).toHaveCount(withItems.length);
    await expect(page.locator('.foot-info')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('P2 — search filters dishes and says when nothing matches', async ({ page, request }) => {
    const { item } = await firstDish(request);
    await page.goto('/');
    const search = page.getByPlaceholder(/Search dishes/);
    await search.fill(item.name);
    await expect(page.locator('.search-results')).toContainText(item.name);
    await search.fill('zzz-no-such-dish');
    await expect(page.locator('.search-results .none')).toContainText('No dishes match');
  });

  test('P3 — a category tile opens that category screen', async ({ page, request }) => {
    const { cat } = await firstDish(request);
    await page.goto('/');
    await page.locator('.cat-tile').filter({ hasText: cat.name }).click();
    await expect(page.locator('section.screen.active')).toContainText(cat.items[0].name);
  });

  test('P4 — dish detail → basket: the line total is base + option + extras, times quantity', async ({ page, request }) => {
    const errors = watchErrors(page);
    const { item, start } = await firstDish(request);
    await page.goto('/');
    await page.locator('.search input').fill(item.name);
    await page.locator('.search-results').getByText(item.name).first().click();

    const detail = page.locator('.page.open .detail');
    await expect(detail.locator('.detail-name')).toHaveText(item.name);
    await expect(page.locator('.detail-cta .total-mini .v')).toHaveText(money(start));

    // Tick the first extra (if any) and make it two.
    let unit = start;
    const extra = item.extras?.[0];
    if (extra) {
      await detail.locator('.extra').first().click();
      unit += Number(extra.priceAdd);
    }
    await detail.getByRole('button', { name: 'increase' }).click();
    await expect(page.locator('.detail-cta .total-mini .v')).toHaveText(money(unit * 2));

    await page.getByRole('button', { name: /Add to basket/ }).click();
    await expect(page.locator('.cart-fab.visible')).toBeVisible();
    await page.getByRole('button', { name: 'Open basket' }).click();

    const line = page.locator('.cart-item').first();
    await expect(line.locator('.ci-name')).toHaveText(item.name);
    await expect(line.locator('.ci-qty .val')).toHaveText('2');
    await expect(line.locator('.ci-price')).toHaveText(money(unit * 2));
    await expect(page.locator('.cart-summary .summary-row.total')).toContainText(money(unit * 2));

    // Minus → one left; Remove → empty basket.
    await line.getByRole('button', { name: '−' }).click();
    await expect(line.locator('.ci-price')).toHaveText(money(unit));
    await line.getByRole('button', { name: 'Remove' }).click();
    await expect(page.locator('.cart-empty')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('P5 — checkout form validates before sending anything', async ({ page, request }) => {
    const { item } = await firstDish(request);
    let checkoutCalls = 0;
    await page.route('**/api/checkout', (r) => { checkoutCalls += 1; return r.continue(); });

    await page.goto('/');
    await page.locator('.search input').fill(item.name);
    await page.locator('.search-results').getByRole('button', { name: 'Add', exact: true }).first().click();
    await page.getByRole('button', { name: 'Open basket' }).click();
    await page.getByRole('button', { name: /Proceed to checkout/ }).click();
    await expect(page.locator('.co-title')).toBeVisible();

    await page.locator('.place-order').click();
    await expect(page.getByText('Please enter your full name.')).toBeVisible();
    expect(checkoutCalls).toBe(0);
  });

  test('P6 — checkout reaches the API with a server-accepted total (payment stubbed)', async ({ page, request }) => {
    requireWrites(); // creates a PaymentSession row
    const { item } = await firstDish(request);
    // Never reach the real gateway: answer initiate ourselves with a failure.
    await page.route('**/api/payment/initiate', (r) => r.fulfill({ status: 502, contentType: 'application/json', body: '{"error":"stubbed"}' }));

    await page.goto('/');
    await page.locator('.search input').fill(item.name);
    await page.locator('.search-results').getByRole('button', { name: 'Add', exact: true }).first().click();
    await page.getByRole('button', { name: 'Open basket' }).click();
    await page.getByRole('button', { name: /Proceed to checkout/ }).click();

    await page.locator('#co-name').fill('E2E Guest');
    await page.getByPlaceholder('7454776').fill('7454776');
    await page.locator('#co-table').fill('7');
    const checkout = page.waitForResponse((r) => r.url().endsWith('/api/checkout'));
    await page.locator('.place-order').click();
    const res = await checkout;
    expect(res.status()).toBe(200);
    expect((await res.json()).reference).toMatch(/^ord-/);
    await expect(page.getByText('Payment could not be started. Please try again.')).toBeVisible();
  });
});
