import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requirePos, requireRole } from '@/lib/auth';

const EDIT_ROLES = ['admin', 'manager'];

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
};
const ALL_KEYS = ['delivery_fee', ...Object.values(TEXT_KEYS)];

async function readSettings() {
  const rows = await prisma.setting.findMany({ where: { key: { in: ALL_KEYS } } });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out = { deliveryFee: map.delivery_fee != null ? Number(map.delivery_fee) : 0 };
  for (const [field, key] of Object.entries(TEXT_KEYS)) out[field] = map[key] ?? '';
  return out;
}

export async function GET() {
  const auth = await requirePos(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    return NextResponse.json(await readSettings());
  } catch (err) {
    console.error('GET /api/admin/settings:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const text = (max, label) => z.string().trim().max(max, `${label} is too long (max ${max} characters)`);
const settingsSchema = z.object({
  deliveryFee: z.number().min(0, 'Delivery fee cannot be negative'),
  businessName: text(120, 'Business name'),
  businessPhone: text(60, 'Phone'),
  businessAddress: text(300, 'Address'),
  taxId: text(60, 'Tax ID'),
  receiptFooter: text(300, 'Receipt message'),
  invoiceTerms: text(600, 'Payment terms'),
  evcAccount: text(40, 'EVC number'),
}).partial();

export async function PUT(request) {
  const auth = await requireRole(prisma, EDIT_ROLES);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await request.json().catch(() => null);
    const parsed = settingsSchema.safeParse(body ?? {});
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' }, { status: 400 });

    const writes = [];
    const upsert = (key, value) => writes.push(prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } }));
    if (parsed.data.deliveryFee != null) upsert('delivery_fee', parsed.data.deliveryFee.toFixed(2));
    for (const [field, key] of Object.entries(TEXT_KEYS)) {
      if (parsed.data[field] !== undefined) upsert(key, parsed.data[field]);
    }
    // One batched transaction — all settings in a save land together.
    if (writes.length) await prisma.$transaction(writes);

    return NextResponse.json(await readSettings());
  } catch (err) {
    console.error('PUT /api/admin/settings:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
