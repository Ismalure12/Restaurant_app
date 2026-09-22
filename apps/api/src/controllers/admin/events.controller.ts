import type { Request, Response } from 'express';
import prisma from '../../lib/db/prisma.js';
import { requireStaff } from '../../lib/auth/auth.js';
import { subscribe, unsubscribe } from '../../lib/orders/orderEvents.js';

// GET /api/admin/events — Server-Sent Events stream for back-office staff.
// Sends `event: orders` whenever orders change (new online order, Register
// sale, payment, accept/decline, online-payment dismissed); the page refetches.
// The event carries no data, so a stream can never leak anything the viewer
// couldn't already fetch. See lib/orders/orderEvents.ts.
//
// nginx must not buffer it: `X-Accel-Buffering: no` (sent below) or
// `proxy_buffering off` on this location (apps/api/README.md).
// Streams end after this; EventSource reconnects on its own, and the
// reconnect re-checks the login (a revoked account stops getting nudges).
const MAX_STREAM_MS = 30 * 60_000;

export async function streamEvents(req: Request, res: Response) {
  const auth = await requireStaff(prisma, req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  if (!subscribe(res)) {
    // Too many open screens — this one falls back to polling.
    return res.status(503).json({ error: 'Live updates are busy — the page will refresh on its own' });
  }

  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  // Reconnect after 5 s if the connection drops.
  res.write('retry: 5000\n\n');

  const done = () => { clearTimeout(expire); unsubscribe(res); };
  const expire = setTimeout(() => { done(); res.end(); }, MAX_STREAM_MS);
  expire.unref();
  req.on('close', done);
}
