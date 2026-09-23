const { test, expect } = require('@playwright/test');
const { D, signIn, watchErrors, settle } = require('./helpers');

// Every admin page per role, with the default Staff access matrix
// (apps/api/src/lib/auth/permissions.ts DEFAULTS). Each allowed page must load
// with its topbar title and no runtime error; each blocked page must bounce to
// the role's first allowed page.
const PAGES = {
  overview: ['', 'Overview'],
  performance: ['/performance', 'My Performance'],
  pos: ['/pos', 'Register'],
  orders: ['/orders', 'Orders'],
  tables: ['/tables', 'Tables'],
  sales: ['/sales', 'Sales history'],
  salesItems: ['/sales?view=items', 'Sales history'],
  cash: ['/cash', 'Cash & accounts'],
  customers: ['/customers', 'Customers & invoices'],
  expenses: ['/expenses', 'Expenses & suppliers'],
  menu: ['/menu-items', 'Menu items'],
  categories: ['/categories', 'Categories & tags'],
  inventory: ['/inventory', 'Inventory'],
  staff: ['/users', 'Staff & payroll'],
  payroll: ['/users?tab=payroll', 'Staff & payroll'],
  reportSales: ['/reports/sales', 'Reports'],
  reportInventory: ['/reports/inventory', 'Reports'],
  reportFinancial: ['/reports/financial', 'Reports'],
  reportEmployees: ['/reports/employees', 'Reports'],
  reportStatements: ['/reports/statements', 'Reports'],
  reportDayCloses: ['/reports/day-closes', 'Reports'],
  settingsGeneral: ['/settings/general', 'Settings'],
  settingsMoney: ['/settings/money', 'Settings'],
  settingsAccess: ['/settings/access', 'Settings'],
  settingsAudit: ['/settings/audit', 'Settings'],
};

const ALL_BACK_OFFICE = Object.keys(PAGES).filter((k) => k !== 'performance');
const ROLES = {
  manager: { allowed: ALL_BACK_OFFICE, blocked: ['performance'], home: '' },
  cashier: {
    allowed: ['performance', 'pos', 'orders', 'sales', 'salesItems', 'customers', 'menu', 'categories', 'inventory'],
    blocked: ['overview', 'tables', 'cash', 'expenses', 'staff', 'reportSales', 'settingsGeneral', 'settingsAudit'],
    home: '/pos',
  },
  waiter: {
    allowed: ['performance', 'pos', 'sales', 'salesItems'],
    blocked: ['overview', 'orders', 'customers', 'menu', 'inventory', 'reportSales', 'settingsGeneral'],
    home: '/pos',
  },
};

const topbarTitle = (page) => page.locator('header[data-admin-chrome] .text-lg').first();

for (const [role, { allowed, blocked, home }] of Object.entries(ROLES)) {
  test.describe(`${role} pages`, () => {
    test.beforeEach(async ({ page }) => { await signIn(page, role); });

    for (const key of allowed) {
      const [path, title] = PAGES[key];
      test(`${role} opens ${path || '/'}`, async ({ page }) => {
        const errors = watchErrors(page);
        await page.goto(D + path);
        await settle(page);
        await expect(page).toHaveURL(new RegExp(`${D}${path.split('?')[0].replace(/\//g, '\\/')}(\\?|$|#)`));
        await expect(topbarTitle(page)).toHaveText(title);
        await expect(page.getByRole('main')).not.toContainText(/Something went wrong|Application error|is not a function|is not defined/);
        expect(errors).toEqual([]);
      });
    }

    for (const key of blocked) {
      const [path] = PAGES[key];
      test(`${role} is kept out of ${path || '/'}`, async ({ page }) => {
        await page.goto(D + path);
        await page.waitForURL((u) => u.pathname === `${D}${home}`, { timeout: 15000 });
      });
    }
  });
}

test.describe('write buttons follow the access level', () => {
  test('cashier (Inventory: view) sees no New item / Record movement', async ({ page }) => {
    await signIn(page, 'cashier');
    await page.goto(`${D}/inventory`);
    await settle(page);
    await expect(page.getByRole('button', { name: 'New item' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Record movement' })).toHaveCount(0);
  });

  test('manager (Inventory: act) sees New item and Record movement', async ({ page }) => {
    await signIn(page, 'manager');
    await page.goto(`${D}/inventory`);
    await settle(page);
    await expect(page.getByRole('button', { name: 'New item' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record movement' })).toBeVisible();
  });

  test('the API enforces the same rule: cashier cannot create stock items', async ({ page }) => {
    await signIn(page, 'cashier');
    const res = await page.request.post('/api/admin/inventory', { data: { name: 'E2E should fail', unit: 'kg' } });
    expect(res.status()).toBe(403);
  });
});
