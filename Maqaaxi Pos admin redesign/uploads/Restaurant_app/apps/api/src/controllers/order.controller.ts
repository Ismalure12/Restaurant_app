import type { Request, Response } from 'express';
import prisma from '../lib/db/prisma.js';
import { searchParams as getSearchParams } from '../utils/query.js';

export async function getPublicOrder(req: Request, res: Response) {
  const searchParams = getSearchParams(req);
  const ref = searchParams.get('ref');
  if (!ref) return res.status(400).json({ error: 'ref required' });

  try {
    const order = await prisma.order.findUnique({
      where: { reference: ref },
      include: { customer: { select: { name: true, phone: true } } },
    });

    if (!order) return res.status(404).json({ error: 'Not found' });

    return res.json({
      reference: order.reference,
      items: order.items,
      total: order.total.toString(),
      address: order.address,
      orderType: order.orderType,
      tableNumber: order.tableNumber,
      status: order.status,
      createdAt: order.createdAt,
      customer: order.customer,
    });
  } catch (err) {
    console.error('GET /api/order:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
