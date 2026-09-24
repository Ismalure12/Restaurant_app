import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../lib/db/prisma.js';
import { priceCart, toCents, type CartLineInput } from '../lib/orders/cartPricing.js';
import { readJson } from '../utils/body.js';
import { orderingOffBody, readOnlineOrdering } from '../lib/orders/onlineOrdering.js';

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

export async function createCheckout(req: Request, res: Response) {
  // Outside the try, as in the original: a bad/empty body throws → empty 500.
  const body = readJson(req);
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }

  const { name, phone, orderType, address, tableNumber, cart, total } = parsed.data;
  const cleanPhone = phone.replace(/\D/g, '');
  const reference = 'ord-' + crypto.randomUUID();

  try {
    // The manager switched online ordering off — nothing is created.
    const ordering = await readOnlineOrdering(prisma);
    if (!ordering.enabled) return res.status(409).json(orderingOffBody(ordering.message));

    // Never trust the client's cart prices or total — recompute both from
    // the database before persisting anything.
    // (Type-only cast: itemId is optional here; priceCart rejects a missing one at runtime.)
    const priced = await priceCart(prisma, cart as CartLineInput[]);
    if (priced.error) {
      return res.status(400).json({ error: priced.error });
    }
    if (toCents(total) !== priced.totalCents) {
      return res.status(409).json({ error: 'Prices have changed — please refresh your cart and try again.' });
    }

    await prisma.paymentSession.create({
      data: {
        reference,
        phone: cleanPhone,
        name,
        address: orderType === 'delivery' ? address : null,
        orderType,
        tableNumber: orderType === 'dine_in' ? tableNumber : null,
        cartJson: priced.lines as unknown as Prisma.InputJsonValue,
        amount: priced.totalCents / 100,
      },
    });

    return res.json({ reference });
  } catch (err) {
    console.error('POST /api/checkout:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
