// Shared E2E helpers.
//
// Accounts come from env, one pair per role:
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD, E2E_MANAGER_*, E2E_CASHIER_*, E2E_WAITER_*
// (ADMIN_EMAIL / ADMIN_PASSWORD are still accepted for the admin.)
// A test that needs a role with no account configured is skipped.
//
// Tests that WRITE (create a category, place and pay an order, start a
// checkout) only run with E2E_ALLOW_WRITES=1 — set it only when E2E_BASE_URL
// points at an app on a throwaway database, never the live one.
const { test } = require('@playwright/test');

const D = '/admin/dashboard';

function account(role) {
  const up = role.toUpperCase();
  const email = process.env[`E2E_${up}_EMAIL`] || (role === 'admin' ? process.env.ADMIN_EMAIL : undefined);
  const password = process.env[`E2E_${up}_PASSWORD`] || (role === 'admin' ? process.env.ADMIN_PASSWORD : undefined);
  return email && password ? { email, password } : null;
}

const writesAllowed = () => process.env.E2E_ALLOW_WRITES === '1';

function requireWrites() {
  test.skip(!writesAllowed(), 'writes disabled — set E2E_ALLOW_WRITES=1 against a scratch database');
}

// Signs in through the API (the cookie lands in the page's context). The UI
// sign-in itself is covered once, in admin-auth.spec.js.
async function signIn(page, role) {
  const acc = account(role);
  test.skip(!acc, `no ${role} account (set E2E_${role.toUpperCase()}_EMAIL/PASSWORD)`);
  const res = await page.request.post('/api/auth/login', { data: acc });
  if (!res.ok()) throw new Error(`${role} login failed: ${res.status()}`);
  return acc;
}

// Collects uncaught page errors and console errors so a test can assert none.
// Dev-only noise (HMR, React DevTools hint) is ignored, and so are failed loads
// from other origins (menu photos are data: a dead photo URL shows the
// placeholder, which is not an app error).
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Download the React DevTools|\[HMR\]|\[Fast Refresh\]/.test(t)) return;
    const src = m.location()?.url || '';
    if (/^Failed to load resource/.test(t) && src && !src.startsWith(new URL(page.url()).origin)) return;
    errors.push(`console: ${t.slice(0, 200)}${m.location()?.url ? ` @ ${m.location().url}` : ''}`);
  });
  return errors;
}

// Waits until the admin page has finished its first data load: no skeletons.
async function settle(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => !document.querySelector('.animate-pulse, [aria-busy="true"]'), null, { timeout: 15000 }).catch(() => {});
}

module.exports = { D, account, writesAllowed, requireWrites, signIn, watchErrors, settle };
