import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { customerSchema, updateCustomerSchema } from '../../validations/customers.validation.js';
import { readJson } from '../../utils/body.js';
import { searchParams as getSearchParams, searchParams } from '../../utils/query.js';
import { errCode } from '../../utils/errors.js';
import { num, round2 } from '../../lib/reports/common.js';

type Balance = { owedBalance: number; invoiceCount: number };

// Owed balance = sum(total - amountPaid) across every non-void invoice,
// clamped at 0 (a payment can't make the balance negative)
// invoiceOutstandingAgg, just scoped per customer instead of platform-wide.
async function owedBalancesFor(customerIds: number[]): Promise<Record<number, Balance>> {
  if (!customerIds.length) return {};
  const rows = await prisma.invoice.groupBy({
    by: ['customerId'],
    where: { customerId: { in: customerIds }, status: { not: 'void' } },
    _sum: { total: true, amountPaid: true },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [
    r.customerId,
    {
      owedBalance: Math.max(0, Number(r._sum.total || 0) - Number(r._sum.amountPaid || 0)),
      invoiceCount: r._count._all,
    },
  ]));
}

export async function listCustomers(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'customers', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const searchParams = getSearchParams(req);
  const q = (searchParams.get('q') || '').trim();
  const take = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1), 100);
  const cursorParam = parseInt(searchParams.get('cursor') ?? '', 10);

  // ?owing=1 → only customers with an open (unpaid/partial) invoice.
  const owing = searchParams.get('owing') === '1';
  const where: Prisma.CustomerWhereInput = {
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {}),
    ...(owing ? { invoices: { some: { status: { in: ['unpaid', 'partial'] } } } } : {}),
  };

  try {
    const customers = await prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(Number.isFinite(cursorParam) ? { cursor: { id: cursorParam }, skip: 1 } : {}),
    });

    const hasMore = customers.length > take;
    const page = hasMore ? customers.slice(0, take) : customers;
    const balances = await owedBalancesFor(page.map((c) => c.id));

    const result: Record<string, unknown> = {
      customers: page.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        address: c.address,
        createdAt: c.createdAt,
        owedBalance: balances[c.id]?.owedBalance ?? 0,
        invoiceCount: balances[c.id]?.invoiceCount ?? 0,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };

    // Only compute the platform-wide summary on an unfiltered first page —
    // it doesn't change per search term/page and is wasted work otherwise.
    if (!q && !owing && !Number.isFinite(cursorParam)) {
      const [totalCustomers, overdue, allBalances] = await Promise.all([
        prisma.customer.count(),
        prisma.invoice.count({ where: { status: { in: ['unpaid', 'partial'] }, dueDate: { lt: new Date() } } }),
        prisma.invoice.groupBy({
          by: ['customerId'],
          where: { status: { not: 'void' } },
          _sum: { total: true, amountPaid: true },
        }),
      ]);
      let customersWithBalance = 0;
      let totalOutstanding = 0;
      for (const r of allBalances) {
        const balance = Math.max(0, Number(r._sum.total || 0) - Number(r._sum.amountPaid || 0));
        if (balance > 0) { customersWithBalance += 1; totalOutstanding += balance; }
      }
      result.summary = { totalCustomers, customersWithBalance, totalOutstanding, overdueInvoices: overdue };
    }

    return res.json(result);
  } catch (err) {
    console.error('GET /api/admin/customers:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createCustomer(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'customers', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  try {
    const body = readJson(req);
    const parsed = customerSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
    }
    const { name, phone, address } = parsed.data;

    const customer = await prisma.customer.create({
      data: { name, phone, address: address || null },
    });

    return res.status(201).json({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      createdAt: customer.createdAt,
      owedBalance: 0,
      invoiceCount: 0,
    });
  } catch (err) {
    if (errCode(err) === 'P2002') {
      return res.status(409).json({ error: 'A customer with this phone already exists' });
    }
    console.error('POST /api/admin/customers:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getCustomer(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'customers', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const { id: rawId } = req.params;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const customer = await prisma.customer.findFirst({ where: { id } });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const [balanceAgg, invoices, invoiceCount, openCount] = await Promise.all([
      prisma.invoice.aggregate({
        where: { customerId: id, status: { not: 'void' } },
        _sum: { total: true, amountPaid: true },
      }),
      prisma.invoice.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, total: true, amountPaid: true, status: true, dueDate: true, tableNumber: true, createdAt: true },
      }),
      // True counts — the history list above is capped at 50.
      prisma.invoice.count({ where: { customerId: id } }),
      prisma.invoice.count({ where: { customerId: id, status: { in: ['unpaid', 'partial'] } } }),
    ]);
    const owedBalance = Math.max(0, Number(balanceAgg._sum.total || 0) - Number(balanceAgg._sum.amountPaid || 0));

    return res.json({
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        createdAt: customer.createdAt,
      },
      owedBalance,
      invoiceCount,
      openCount,
      invoices: invoices.map((inv) => {
        const total = Number(inv.total);
        const amountPaid = Number(inv.amountPaid);
        return {
          id: inv.id,
          total: total.toFixed(2),
          amountPaid: amountPaid.toFixed(2),
          balance: Math.max(0, total - amountPaid).toFixed(2),
          status: inv.status,
          dueDate: inv.dueDate,
          tableNumber: inv.tableNumber,
          createdAt: inv.createdAt,
        };
      }),
    });
  } catch (err) {
    console.error('GET /api/admin/customers/[id]:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateCustomer(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'customers', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const { id: rawId } = req.params;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const existing = await prisma.customer.findFirst({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Customer not found' });

    const body = readJson(req);
    const parsed = updateCustomerSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
    }

    const data: { name?: string; phone?: string; address?: string | null } = { ...parsed.data };
    if (data.address !== undefined) data.address = data.address || null;

    const customer = await prisma.customer.update({ where: { id }, data });
    return res.json({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      createdAt: customer.createdAt,
    });
  } catch (err) {
    if (errCode(err) === 'P2002') {
      return res.status(409).json({ error: 'A customer with this phone already exists' });
    }
    console.error('PATCH /api/admin/customers/[id]:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/customers/:id/statement?status=open|all — everything to print
// one customer's invoices at once: the non-void invoices (open = still owing,
// all = every one) with their lines and payments, and the totals. Staff.
// Lists the newest 300 invoices (oldest first); totals cover all; `truncated` says when more exist.
const CAP = 300;

export async function getCustomerStatement(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'customers', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
  const status = searchParams(req).get('status') === 'open' ? 'open' : 'all';

  try {
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const where = { customerId: id, status: status === 'open' ? { in: ['unpaid', 'partial'] } : { not: 'void' } };
    // Newest CAP invoices (printed oldest first); totals always cover every invoice.
    const [rows, agg, count] = await Promise.all([prisma.invoice.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: CAP + 1,
      select: {
        id: true, createdAt: true, dueDate: true, status: true, tableNumber: true, items: true,
        subtotal: true, discount: true, total: true, amountPaid: true,
        payments: { orderBy: { paidAt: 'asc' }, select: { amount: true, paidAt: true, method: true, account: true } },
      },
    }), prisma.invoice.aggregate({ where, _sum: { total: true, amountPaid: true } }), prisma.invoice.count({ where })]);
    const truncated = rows.length > CAP;
    const invoices = rows.slice(0, CAP).reverse().map((inv) => {
      const total = round2(num(inv.total));
      const amountPaid = round2(num(inv.amountPaid));
      const items = Array.isArray(inv.items) ? (inv.items as { name?: string; description?: string; quantity?: number; unitPrice?: number }[]) : [];
      return {
        id: inv.id, createdAt: inv.createdAt, dueDate: inv.dueDate, status: inv.status, tableNumber: inv.tableNumber,
        items: items.map((l) => ({ name: l.name || l.description || 'Item', quantity: Number(l.quantity) || 1, unitPrice: Number(l.unitPrice) || 0 })),
        subtotal: round2(num(inv.subtotal)), discount: round2(num(inv.discount)), total, amountPaid,
        balance: Math.max(0, round2(total - amountPaid)),
        payments: inv.payments.map((p) => ({ amount: round2(num(p.amount)), paidAt: p.paidAt, method: p.method, account: p.account })),
      };
    });
    return res.json({
      customer: { id: customer.id, name: customer.name, phone: customer.phone, address: customer.address },
      generatedAt: new Date(),
      status,
      truncated,
      totals: {
        count,
        shown: invoices.length,
        invoiced: round2(num(agg._sum.total)),
        paid: round2(num(agg._sum.amountPaid)),
        owed: Math.max(0, round2(num(agg._sum.total) - num(agg._sum.amountPaid))),
      },
      invoices,
    });
  } catch (err) {
    console.error(`GET /api/admin/customers/${id}/statement:`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
