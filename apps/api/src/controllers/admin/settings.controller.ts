import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../lib/db/prisma.js';
import { requirePos, requirePage } from '../../lib/auth/auth.js';
import { readJson } from '../../utils/body.js';
import { activeAccounts } from '../../lib/money/cashBook.js';
import { FY_START_KEY, readCalendar } from '../../lib/money/moneyReads.js';
import { DAY_END_KEY, MAX_DAY_END_HOUR, setBusinessDayEnd } from '../../lib/time/businessTime.js';
import { ORDER_PREFIX_KEY, ORDER_PREFIX_RE, DEFAULT_ORDER_PREFIX } from '../../lib/orders/orderCode.js';
import { ONLINE_ORDERING_KEY, ONLINE_ORDERING_MESSAGE_KEY } from '../../lib/orders/onlineOrdering.js';

// API field → settings-table key for the business identity printed on
// receipts and invoices. None of it is secret, so the Register (any POS role)
// can read it along with the delivery fee.
const TEXT_KEYS = {
  businessName: 'business_name',
  businessPhone: 'business_phone',
  businessAddress: 'business_address',
  taxId: 'tax_id',
  receiptFooter: 'receipt_footer',
  invoiceTerms: 'invoice_terms',
  evcAccount: 'evc_account',
  // What customers are told while online ordering is off ('' = the default).
  onlineOrderingMessage: ONLINE_ORDERING_MESSAGE_KEY,
};
type TextField = keyof typeof TEXT_KEYS;
// Money accounts (Cash, the wallets A/C · E/d · My Cash…, the Mastercard)
// are MoneyAccount rows — managed through /api/admin/accounts, read here for
// the Register and receipts.
// Tax already INCLUDED in menu prices (%). Only the receipt shows the included
// portion — order totals never change (the "no VAT on top" rule stands).
const TAX_KEY = 'tax_rate';
const ALL_KEYS = ['delivery_fee', ONLINE_ORDERING_KEY, TAX_KEY, DAY_END_KEY, ORDER_PREFIX_KEY, ...Object.values(TEXT_KEYS)];

async function readSettings() {
  const [rows, accounts, calendar] = await Promise.all([
    prisma.setting.findMany({ where: { key: { in: ALL_KEYS } } }),
    activeAccounts(prisma),
    readCalendar(prisma),
  ]);
  const map: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out: Record<string, unknown> = {
    deliveryFee: map.delivery_fee != null ? Number(map.delivery_fee) : 0,
    // Missing row = on (see lib/orders/onlineOrdering.ts).
    onlineOrdering: map[ONLINE_ORDERING_KEY] !== 'off',
    taxRate: map[TAX_KEY] != null ? Number(map[TAX_KEY]) : 0,
    // Active business accounts — the Register's payment choices.
    moneyAccounts: accounts.map((a) => ({ id: a.id, kind: a.kind, label: a.label, number: a.number })),
    // The business's own wallet numbers, printed on receipts.
    paymentAccounts: accounts.filter((a) => a.kind === 'wallet' && a.number).map((a) => ({ label: a.label, number: a.number })),
    orderPrefix: map[ORDER_PREFIX_KEY] || DEFAULT_ORDER_PREFIX,
    businessDayEndHour: Number.isInteger(Number(map[DAY_END_KEY])) ? Number(map[DAY_END_KEY]) : 0,
    openingDate: calendar.openingDate,
    fiscalYearStartMonth: calendar.fiscalYearStartMonth,
  };
  for (const [field, key] of Object.entries(TEXT_KEYS)) out[field] = map[key] ?? '';
  return out;
}

export async function getSettings(req: Request, res: Response) {
  const auth = await requirePos(prisma, req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  try {
    return res.json(await readSettings());
  } catch (err) {
    console.error('GET /api/admin/settings:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

const text = (max: number, label: string) => z.string().trim().max(max, `${label} is too long (max ${max} characters)`);
const settingsSchema = z.object({
  deliveryFee: z.number().min(0, 'Delivery fee cannot be negative'),
  businessName: text(120, 'Business name'),
  businessPhone: text(60, 'Phone'),
  businessAddress: text(300, 'Address'),
  taxId: text(60, 'Tax ID'),
  receiptFooter: text(300, 'Receipt message'),
  invoiceTerms: text(600, 'Payment terms'),
  evcAccount: text(40, 'EVC number'),
  onlineOrdering: z.boolean(),
  onlineOrderingMessage: text(300, 'Online ordering message'),
  taxRate: z.number().min(0, 'Tax cannot be negative').max(50, 'Tax rate looks too high (max 50%)'),
  // Business calendar: the month the financial year starts (1 = January).
  fiscalYearStartMonth: z.number().int().min(1, 'Month must be 1–12').max(12, 'Month must be 1–12'),
  // Business calendar: the hour the business day ends (0 = midnight … 6 = 06:00).
  businessDayEndHour: z.number().int().min(0, 'Hour must be 0–6').max(MAX_DAY_END_HOUR, 'Hour must be 0–6'),
  // First part of every order ID (KFG-260919-0101).
  orderPrefix: z.string().trim().toUpperCase().regex(ORDER_PREFIX_RE, 'Order ID prefix: 1–8 letters or digits, no spaces'),
}).partial();

export async function updateSettings(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'settings', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  try {
    // Next: `await request.json().catch(() => null)`
    let body: unknown;
    try { body = readJson(req); } catch { body = null; }
    const parsed = settingsSchema.safeParse(body ?? {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });

    const writes: Prisma.PrismaPromise<unknown>[] = [];
    const upsert = (key: string, value: string) => writes.push(prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } }));
    if (parsed.data.deliveryFee != null) upsert('delivery_fee', parsed.data.deliveryFee.toFixed(2));
    if (parsed.data.onlineOrdering != null) upsert(ONLINE_ORDERING_KEY, parsed.data.onlineOrdering ? 'on' : 'off');
    if (parsed.data.taxRate != null) upsert(TAX_KEY, String(Math.round(parsed.data.taxRate * 100) / 100));
    if (parsed.data.fiscalYearStartMonth != null) {
      const current = (await readCalendar(prisma)).fiscalYearStartMonth;
      if (parsed.data.fiscalYearStartMonth !== current) {
        // Years already closed were cut on the old month — it can't move under them.
        const closedYears = await prisma.periodClose.count({ where: { kind: 'year', isClosed: true } });
        if (closedYears > 0) return res.status(409).json({ error: 'The financial year start cannot change once a year has been closed' });
      }
      upsert(FY_START_KEY, String(parsed.data.fiscalYearStartMonth));
    }
    if (parsed.data.businessDayEndHour != null) upsert(DAY_END_KEY, String(parsed.data.businessDayEndHour));
    if (parsed.data.orderPrefix) upsert(ORDER_PREFIX_KEY, parsed.data.orderPrefix);
    for (const [field, key] of Object.entries(TEXT_KEYS)) {
      const value = parsed.data[field as TextField];
      if (value !== undefined) upsert(key, value);
    }
    // One batched transaction — all settings in a save land together.
    if (writes.length) await prisma.$transaction([...writes, prisma.auditLog.create({ data: { actorId: auth.session.userId ?? null, action: 'settings.update', entity: 'Setting', meta: parsed.data } })]);

    if (parsed.data.businessDayEndHour != null) setBusinessDayEnd(parsed.data.businessDayEndHour);
    return res.json(await readSettings());
  } catch (err) {
    console.error('PUT /api/admin/settings:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
