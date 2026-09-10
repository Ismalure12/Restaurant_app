import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { priceCart, toCents } from '@/lib/cartPricing';

const cartLineSchema = z.object({
  itemId: z.number().int().positive().optional(),
  name: z.string(),
  imageUrl: z.string().nullable().optional(),
  optionName: z.string().nullable().optional(),
  extras: z.array(z.object({ name: z.string(), priceAdd: z.number() })).optional().default([]),
  notes: z.string().max(500).optional().default(''),
  // Display-only — the server reprices every line from the database.
  unitPrice: z.number().nonnegative(),
  quantity: z.number().int().positive(),
});

const checkoutSchema = z
  .object({
    name: z.string().min(1).max(200),
    phone: z.string().min(1).max(50),
    orderType: z.enum(['dine_in', 'delivery']),
    address: z.string().min(1).max(500).optional().nullable(),
    tableNumber: z.string().min(1).max(20).optional().nullable(),
    cart: z.array(cartLineSchema).min(1),
    total: z.number().positive(),
  })
  .superRefine((val, ctx) => {
    if (val.orderType === 'dine_in' && !val.tableNumber) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tableNumber'], message: 'Table number is required for dine-in' });
    }
    if (val.orderType === 'delivery' && !val.address) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['address'], message: 'Address is required for delivery' });
    }
  });

export async function POST(request) {
  const body = await request.json();
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, phone, orderType, address, tableNumber, cart, total } = parsed.data;
  const cleanPhone = phone.replace(/\D/g, '');
  const reference = 'ord-' + crypto.randomUUID();

  try {
    // Never trust the client's cart prices or total — recompute both from
    // the database before persisting anything.
    const priced = await priceCart(prisma, cart);
    if (priced.error) {
      return NextResponse.json({ error: priced.error }, { status: 400 });
    }
    if (toCents(total) !== priced.totalCents) {
      return NextResponse.json({ error: 'Prices have changed — please refresh your cart and try again.' }, { status: 409 });
    }

    await prisma.paymentSession.create({
      data: {
        reference,
        phone: cleanPhone,
        name,
        address: orderType === 'delivery' ? address : null,
        orderType,
        tableNumber: orderType === 'dine_in' ? tableNumber : null,
        cartJson: priced.lines,
        amount: priced.totalCents / 100,
      },
    });

    return NextResponse.json({ reference });
  } catch (err) {
    console.error('POST /api/checkout:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
