const { test, expect } = require('@playwright/test');
const { D, signIn, settle } = require('./helpers');

// The four widths the admin is checked at (desktop, laptop/landscape tablet,
// portrait tablet, phone). No page may scroll sideways at any of them.
const WIDTHS = [1440, 1194, 834, 390];
const PAGES = ['', '/pos', '/orders', '/tables', '/sales', '/cash', '/customers', '/expenses', '/menu-items',
  '/categories', '/inventory', '/users', '/users?tab=payroll', '/reports/sales', '/reports/financial',
  '/reports/employees', '/settings/general', '/settings/money', '/settings/access', '/settings/audit'];

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('Responsive admin', () => {
  for (const w of WIDTHS) {
    test(`no sideways scroll at ${w}px`, async ({ page }) => {
      test.setTimeout(180000);
      await page.setViewportSize({ width: w, height: 900 });
      await signIn(page, 'manager');
      const bad = [];
      for (const p of PAGES) {
        await page.goto(D + p);
        await settle(page);
        const o = await overflow(page);
        if (o > 0) bad.push(`${p || '/'} +${o}px`);
      }
      expect(bad).toEqual([]);
    });
  }

  // The dish grid is a fixed-height scroll area on tablet/desktop. Its rows
  // must size to the cards (photo + name + price), never squeeze to fit.
  for (const w of [1440, 1194, 834]) {
    test(`Register dish cards keep their full height at ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await signIn(page, 'manager');
      await page.goto(`${D}/pos`);
      const cards = page.locator('section[aria-label="Menu"] button[title^="Add "]');
      await expect(cards.first()).toBeVisible();
      const heights = await cards.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
      expect(Math.min(...heights)).toBeGreaterThan(170);
      // Name and price are inside the card, not clipped away.
      const first = cards.first();
      const box = await first.boundingBox();
      const price = await first.locator('.font-mq-mono').first().boundingBox();
      expect(price.y + price.height).toBeLessThanOrEqual(box.y + box.height);
    });
  }

  // Laptop (1366×657 inside the browser): two lines and the whole payment
  // (pay later, discount, method, total, button) visible without scrolling.
  test('Register ticket fits a laptop: 2 lines + full payment, method is a dropdown, no Collected by / Split', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 657 });
    await signIn(page, 'manager');
    await page.goto(`${D}/pos`);
    const cards = page.locator('section[aria-label="Menu"] button[title^="Add "]');
    for (let i = 0; i < 2; i += 1) {
      await cards.nth(i).click();
      await page.getByRole('dialog').getByRole('button', { name: /^Add · / }).click();
    }
    const ticket = page.locator('[aria-label="Ticket"]');
    const payLater = ticket.getByRole('switch', { name: 'Pay later' });
    if (await payLater.isChecked()) await payLater.click();

    const method = ticket.getByLabel('Paid with');
    await expect(method).toBeVisible();
    const labels = await method.locator('option').allTextContents();
    expect(labels.some((l) => l.startsWith('Cash'))).toBe(true);
    expect(labels.some((l) => /split/i.test(l))).toBe(false);
    await expect(ticket.getByText('Collected by')).toHaveCount(0);

    const take = ticket.getByRole('button', { name: /^Take \$/ });
    const box = await take.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(657);
    const fits = await ticket.evaluate((tk) => {
      const pay = [...tk.children].find((e) => e.className.includes('border-t') && e.className.includes('bg-mq-cream'));
      const top = pay.getBoundingClientRect().top;
      const lines = [...tk.querySelectorAll('button[aria-label^="Increase"]')].filter((b) => b.getBoundingClientRect().bottom <= top).length;
      return { scrolls: pay.scrollHeight > pay.clientHeight + 1, lines };
    });
    expect(fits).toEqual({ scrolls: false, lines: 2 });

    // The handle gives the lines more room (keyboard: down = smaller payment).
    const handle = ticket.getByRole('separator', { name: /Resize the payment area/ });
    await handle.focus();
    await page.keyboard.press('ArrowDown');
    const shrunk = Number(await handle.getAttribute('aria-valuenow'));
    expect(shrunk).toBeGreaterThan(0);
    await page.keyboard.press('ArrowUp');
    expect(Number(await handle.getAttribute('aria-valuenow'))).toBe(shrunk + 16);
    await handle.dblclick(); // back to auto
    await expect(handle).not.toHaveAttribute('aria-valuenow', /.*/);
  });

  test('phone: sidebar is a drawer behind the Menu button', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, 'manager');
    await page.goto(`${D}/orders`);
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });

  test('portrait tablet: 60px icon rail with a link per page', async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1112 });
    await signIn(page, 'manager');
    await page.goto(`${D}/orders`);
    await expect(page.getByRole('link', { name: 'Orders', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
  });

  test('public menu fits a 375px phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.locator('.cat-tile').first()).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // iOS zooms into inputs under 16px.
    const size = await page.locator('.search input').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  });
});
