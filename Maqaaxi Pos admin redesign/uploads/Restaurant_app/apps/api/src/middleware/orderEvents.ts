import type { RequestHandler } from 'express';
import { publishOrdersChanged } from '../lib/orders/orderEvents.js';

// Live admin screens: a successful write to the Register or Orders nudges
// every open Orders/Tables page to refetch (SSE, lib/orders/orderEvents.ts).
// Online payments publish from finalizePayment itself.
export const nudgeOrdersOnWrite: RequestHandler = (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.on('finish', () => { if (res.statusCode < 400) publishOrdersChanged(); });
  }
  next();
};
