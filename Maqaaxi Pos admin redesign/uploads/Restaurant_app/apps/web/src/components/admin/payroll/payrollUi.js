import { money } from '@/lib/money';
// Small shared helpers for the Payroll tab and its dialogs.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export { money };
export const monthLabel = (m) => (m ? `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : '');
export const shiftMonth = (m, n) => {
  const [y, mm] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
export const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const initials = (s) => (s || '').trim().split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '·';
export const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', cashier: 'Cashier', waiter: 'Waiter' };

