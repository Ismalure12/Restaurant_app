import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../../lib/db/prisma.js';
import { requirePos } from '../../lib/auth/auth.js';
import { loadMatrix, levelIn } from '../../lib/auth/permissions.js';
import { searchParams } from '../../utils/query.js';
import { formatOrderCode, getOrderPrefix, parseOrderCode } from '../../lib/orders/orderCode.js';
import { formatReceiptNo } from '../../lib/orders/receiptNo.js';

// GET /api/admin/search?q= — the topbar search. One box for everything:
// order IDs (KFG-260919-0101 / 101), receipt numbers (0007 → the latest
// days' receipt 7s), customers, invoices (INV-00012), menu items, stock,
// staff and expenses. Each group is gated by the SAME page permission as the
// page it links to (Settings › Staff access), and returns at most 5 hits. Prisma `contains` only.
const TAKE = 5;
const querySchema = z.object({ q: z.string().trim().min(1, 'Type something to search').max(80, 'Search is too long') });
const ci = (q: string) => ({ contains: q, mode: 'insensitive' as const });
const money = (d: unknown) => `$${Number(d ?? 0).toFixed(2)}`;
const BASE = '/admin/dashboard';

type Hit = { id: string; title: string; sub: string; href: string };
type Group = { key: string; label: string; items: Hit[] };

export async function search(req: Request, res: Response) {
  const auth = await requirePos(prisma, req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const role = auth.session!.role as string;

  const parsed = querySchema.safeParse({ q: searchParams(req).get('q') ?? '' });
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid search' });
  const q = parsed.data.q;

  const matrix = await loadMatrix(prisma);
  const can = (page: string) => levelIn(matrix, role, page) !== 'none';
  const orderId = parseOrderCode(q);
  const digits = /^\d{1,5}$/.test(q) ? Number(q) : null;
  const invoiceId = /^inv-?0*(\d{1,9})$/i.exec(q)?.[1];

  try {
    const prefix = await getOrderPrefix(prisma);
    const jobs: Promise<Group | null>[] = [];

    // ── Orders ──
    if (can('orders')) jobs.push((async () => {
      const or: Prisma.OrderWhereInput[] = [
        { contactName: ci(q) }, { contactPhone: { contains: q } }, { tableNumber: { equals: q, mode: 'insensitive' } },
        { customer: { name: ci(q) } }, { client: { name: ci(q) } }, { client: { phone: { contains: q } } },
      ];
      if (orderId) or.push({ id: orderId });
      if (digits) or.push({ receiptNo: digits });
      const rows = await prisma.order.findMany({
        where: { OR: or },
        orderBy: [{ closedAt: { sort: 'desc', nulls: 'first' } }, { id: 'desc' }],
        take: TAKE,
        select: {
          id: true, createdAt: true, receiptNo: true, receiptDay: true, total: true, status: true,
          tableNumber: true, contactName: true, customer: { select: { name: true } }, client: { select: { name: true } },
        },
      });
      return {
        key: 'orders', label: 'Orders',
        items: rows.map((o) => ({
          id: `order-${o.id}`,
          title: formatOrderCode(o, prefix),
          sub: [
            o.status === 'open' ? 'Unpaid' : o.receiptNo ? `Receipt ${formatReceiptNo(o.receiptNo)} · ${o.receiptDay}` : o.status,
            o.tableNumber ? `Table ${o.tableNumber}` : o.customer?.name || o.client?.name || o.contactName,
            money(o.total),
          ].filter(Boolean).join(' · '),
          href: `${BASE}/orders/${o.id}`,
        })),
      };
    })());

    if (can('customers')) {
      jobs.push((async () => {
        const rows = await prisma.customer.findMany({
          where: { OR: [{ name: ci(q) }, { phone: { contains: q } }] }, orderBy: { name: 'asc' }, take: TAKE,
          select: { id: true, name: true, phone: true },
        });
        return { key: 'customers', label: 'Customers', items: rows.map((c) => ({ id: `customer-${c.id}`, title: c.name, sub: c.phone, href: `${BASE}/customers/${c.id}` })) };
      })());
      jobs.push((async () => {
        const or: Prisma.InvoiceWhereInput[] = [{ customer: { name: ci(q) } }];
        if (invoiceId) or.push({ id: Number(invoiceId) });
        const rows = await prisma.invoice.findMany({
          where: { OR: or }, orderBy: { id: 'desc' }, take: TAKE,
          select: { id: true, customerId: true, status: true, total: true, customer: { select: { name: true } } },
        });
        return {
          key: 'invoices', label: 'Invoices',
          items: rows.map((i) => ({
            id: `invoice-${i.id}`, title: `INV-${String(i.id).padStart(5, '0')}`,
            sub: `${i.customer.name} · ${i.status} · ${money(i.total)}`, href: `${BASE}/customers/${i.customerId}/invoices/${i.id}`,
          })),
        };
      })());
    }
    if (can('inventory')) {
      jobs.push((async () => {
        const rows = await prisma.inventoryItem.findMany({
          where: { OR: [{ name: ci(q) }, { supplier: ci(q) }] }, orderBy: { name: 'asc' }, take: TAKE,
          select: { id: true, name: true, unit: true, quantity: true, supplier: true },
        });
        return {
          key: 'stock', label: 'Stock',
          items: rows.map((s) => ({
            id: `stock-${s.id}`, title: s.name,
            sub: [`${Number(s.quantity)} ${s.unit} on hand`, s.supplier].filter(Boolean).join(' · '), href: `${BASE}/inventory?q=${encodeURIComponent(s.name)}`,
          })),
        };
      })());
    }

    // Menu items: everyone at the Register can look a dish up; only roles with
    // the Menu items page are sent to the editor.
    jobs.push((async () => {
      const rows = await prisma.menuItem.findMany({
        where: { name: ci(q) }, orderBy: { name: 'asc' }, take: TAKE,
        select: { id: true, name: true, price: true, isActive: true, category: { select: { name: true } } },
      });
      const canEdit = can('menu');
      return {
        key: 'menu', label: 'Menu items',
        items: rows.map((m) => ({
          id: `menu-${m.id}`, title: m.name,
          sub: [m.category?.name, money(m.price), m.isActive ? null : 'hidden'].filter(Boolean).join(' · '),
          href: canEdit ? `${BASE}/menu-items?q=${encodeURIComponent(m.name)}` : `${BASE}/pos`,
        })),
      };
    })());

    if (can('reports')) {
      jobs.push((async () => {
        const rows = await prisma.adminUser.findMany({
          where: { role: { in: ['admin', 'manager', 'cashier', 'waiter'] }, OR: [{ name: ci(q) }, { email: ci(q) }] },
          orderBy: { name: 'asc' }, take: TAKE, select: { id: true, name: true, email: true, role: true },
        });
        return {
          key: 'staff', label: 'Staff',
          items: rows.map((u) => ({ id: `staff-${u.id}`, title: u.name?.trim() || u.email, sub: u.role, href: `${BASE}/reports/employees/${u.id}` })),
        };
      })());
    }
    if (can('expenses')) {
      jobs.push((async () => {
        const rows = await prisma.expense.findMany({
          where: { OR: [{ note: ci(q) }, { category: ci(q) }] }, orderBy: { incurredAt: 'desc' }, take: TAKE,
          select: { id: true, category: true, amount: true, note: true, incurredAt: true },
        });
        return {
          key: 'expenses', label: 'Expenses',
          items: rows.map((e) => ({
            id: `expense-${e.id}`, title: `${e.category} · ${money(e.amount)}`,
            sub: [e.incurredAt.toISOString().slice(0, 10), e.note].filter(Boolean).join(' · '), href: `${BASE}/expenses?q=${encodeURIComponent(q)}`,
          })),
        };
      })());
    }

    const groups = (await Promise.all(jobs)).filter((g): g is Group => Boolean(g && g.items.length));
    return res.json({ q, groups });
  } catch (err) {
    console.error('GET /api/admin/search:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
