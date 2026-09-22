import type { Request, Response } from 'express';
import { jwtVerify } from 'jose';
import prisma from '../lib/db/prisma.js';
import { jwtSecret } from '../lib/auth/auth.js';

// GET /api/customer/me — checkout prefill for a returning online client.
// The customer_session cookie is set after a confirmed Sifalo payment and holds
// { clientId }. Cookies issued before online clients existed hold
// { customerId }; they keep working until they expire (30 days).
type Profile = { name: string; phone: string; address: string | null };

async function profileFor(payload: Record<string, unknown>): Promise<Profile | null> {
  if (typeof payload.clientId === 'number') {
    return prisma.onlineClient.findUnique({ where: { id: payload.clientId }, select: { name: true, phone: true, address: true } });
  }
  if (typeof payload.customerId === 'number') {
    return prisma.customer.findUnique({ where: { id: payload.customerId }, select: { name: true, phone: true, address: true } });
  }
  return null;
}

export async function getCustomerMe(req: Request, res: Response) {
  // Fall back to the legacy cookie name so existing sessions don't hard-break.
  const token: string | undefined = req.cookies?.['customer_session'] ?? req.cookies?.['kfg_auth'];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, jwtSecret()));
  } catch {
    // Expired or forged token — the client simply types their details again.
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (payload.type !== 'customer') return res.status(401).json({ error: 'Unauthorized' });

  try {
    const profile = await profileFor(payload);
    if (!profile) return res.status(404).json({ error: 'Not found' });
    return res.json({ name: profile.name, phone: profile.phone, address: profile.address });
  } catch (err) {
    console.error('GET /api/customer/me:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
