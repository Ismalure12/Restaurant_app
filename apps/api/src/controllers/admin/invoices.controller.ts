import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import prisma from '../../lib/db/prisma.js';
import { requirePage } from '../../lib/auth/auth.js';
import { searchParams as getSearchParams } from '../../utils/query.js';
import { updateInvoiceSchema, recordInvoicePaymentSchema } from '../../validations/invoices.validation.js';
import { readJson } from '../../utils/body.js';
import { formatOrderCode, getOrderPrefix } from '../../lib/orders/orderCode.js';
import { PAY_TO_PEOPLE, payToOf } from '../../lib/orders/orderSerialize.js';
import { TILL_KINDS, resolveCollector, writeInvoicePaymentEntry } from '../../lib/money/cashBook.js';

function serialize(inv: any) {
  const total = Number(inv.total);
  const amountPaid = Number(inv.amountPaid);
  return {
    id: inv.id,
    customerId: inv.customerId,
    customerName: inv.customer?.name ?? null,
    customerPhone: inv.customer?.phone ?? null,
    orderId: inv.orderId,
    total: total.toFixed(2),
    amountPaid: amountPaid.toFixed(2),
    balance: Math.max(0, total - amountPaid).toFixed(2),
    status: inv.status,
    dueDate: inv.dueDate,
    tableNumber: inv.tableNumber,
    orderType: inv.orderType,
    note: inv.note,
    creator: inv.creator ? (inv.creator.name || inv.creator.email) : null,
    createdAt: inv.createdAt,
  };
}

export async function listInvoices(req: Request, res: Response) {
  const auth = await requirePage(prisma, req, 'customers', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const searchParams = getSearchParams(req);
  const status = searchParams.get('status'); // unpaid | partial | paid | void
  const customerId = parseInt(searchParams.get('customerId') ?? '', 10);
  const q = (searchParams.get('q') || '').trim();
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');
  const take = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1), 100);
  const cursorParam = parseInt(searchParams.get('cursor') ?? '', 10);

  const where: Prisma.InvoiceWhereInput = {};
  if ((['unpaid', 'partial', 'paid', 'void'] as (string | null)[]).includes(status)) where.status = status as string;
  if (Number.isFinite(customerId)) where.customerId = customerId;
  if (fromParam || toParam) {
    const createdAt: Prisma.DateTimeFilter = {};
    where.createdAt = createdAt;
    if (fromParam) createdAt.gte = new Date(fromParam);
    if (toParam) { const to = new Date(toParam); to.setUTCHours(23, 59, 59, 999); createdAt.lte = to; }
  }
  if (q) {
    where.customer = { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] };
  }

  try {
    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(Number.isFinite(cursorParam) ? { cursor: { id: cursorParam }, skip: 1 } : {}),
      include: {
        customer: { select: { name: true, phone: true } },
        creator: { select: { name: true, email: true } },
      },
    });

    const hasMore = invoices.length > take;
    const page = hasMore ? invoices.slice(0, take) : invoices;
    const result: {
      invoices: ReturnType<typeof serialize>[];
      nextCursor: number | null;
      summary?: Record<string, unknown>;
    } = { invoices: page.map(serialize), nextCursor: hasMore ? page[page.length - 1].id : null };

    // Header figures for the whole filtered set — the list itself is paginated,
    // so totals summed client-side from one page would undercount.
    if (!Number.isFinite(cursorParam)) {
      const within = (extra: Prisma.InvoiceWhereInput): Prisma.InvoiceWhereInput => ({ AND: [where, extra] });
      const OPEN = { status: { in: ['unpaid', 'partial'] } };
      const [live, open, overdue] = await Promise.all([
        prisma.invoice.aggregate({ where: within({ status: { not: 'void' } }), _sum: { total: true, amountPaid: true }, _count: { _all: true } }),
        prisma.invoice.aggregate({ where: within(OPEN), _sum: { total: true, amountPaid: true }, _count: { _all: true } }),
        prisma.invoice.count({ where: within({ ...OPEN, dueDate: { lt: new Date() } }) }),
      ]);
      result.summary = {
        count: live._count._all,
        invoicedTotal: Number(live._sum.total || 0).toFixed(2),
        collected: Number(live._sum.amountPaid || 0).toFixed(2),
        outstanding: Math.max(0, Number(open._sum.total || 0) - Number(open._sum.amountPaid || 0)).toFixed(2),
        openCount: open._count._all,
        overdue,
      };
    }

    return res.json(result);
  } catch (err) {
    console.error('GET /api/admin/invoices:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Invoices are created only by the Register (On account sales, see
// lib/orders/closeSale.ts) — there is no standalone "new invoice" any more.

// Voiding a debt is a manager-tier call, not a cashier one.
const VOID_ROLES = ['admin', 'manager'];

function serializeDetail(inv: any, prefix: string) {
  const total = Number(inv.total);
  const amountPaid = Number(inv.amountPaid);
  return {
    id: inv.id,
    customer: inv.customer,
    orderId: inv.orderId,
    // Short order ID for staff; the random reference stays out of the UI.
    order: inv.order ? { id: inv.order.id, code: formatOrderCode(inv.order, prefix) } : null,
    // Whose wallet numbers the printed invoice asks the customer to pay to (the order's collector/waiter).
    payTo: inv.order ? payToOf(inv.order) : null,
    items: inv.items,
    subtotal: Number(inv.subtotal).toFixed(2),
    discount: Number(inv.discount).toFixed(2),
    total: total.toFixed(2),
    amountPaid: amountPaid.toFixed(2),
    balance: Math.max(0, total - amountPaid).toFixed(2),
    status: inv.status,
    dueDate: inv.dueDate,
    tableNumber: inv.tableNumber,
    orderType: inv.orderType,
    note: inv.note,
    creator: inv.creator ? (inv.creator.name || inv.creator.email) : null,
    payments: inv.payments.map((p: any) => ({
      id: p.id,
      amount: Number(p.amount).toFixed(2),
      method: p.method,
      account: p.account ?? null,
      note: p.note,
      recordedBy: p.recorder ? (p.recorder.name || p.recorder.email) : null,
      // Name only — the printed invoice never shows a staff login email.
      recordedByName: p.recorder?.name?.trim() || null,
      paidAt: p.paidAt,
    })),
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
  };
}

async function loadInvoice(id: number) {
  return prisma.invoice.findFirst({
    where: { id },
    include: {
      customer: true,
      order: { select: { id: true, createdAt: true, orderType: true, ...PAY_TO_PEOPLE } },
      creator: { select: { name: true, email: true } },
      payments: { orderBy: { paidAt: 'desc' }, include: { recorder: { select: { name: true, email: true } } } },
    },
  });
}

export async function getInvoice(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'customers', 'view');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const { id: rawId } = req.params;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const invoice = await loadInvoice(id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    return res.json(serializeDetail(invoice, await getOrderPrefix(prisma)));
  } catch (err) {
    console.error('GET /api/admin/invoices/[id]:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateInvoice(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'customers', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const { id: rawId } = req.params;
  const id = parseInt(rawId, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const body = readJson(req);
    const parsed = updateInvoiceSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
    }
    const { status, ...rest } = parsed.data;

    if (status === 'void' && !VOID_ROLES.includes(auth.session!.role as string)) {
      return res.status(403).json({ error: 'Only a manager can void an invoice' });
    }

    const data: any = { ...rest };
    if (status) data.status = status;
    if (data.dueDate !== undefined) data.dueDate = data.dueDate ? new Date(data.dueDate) : null;

    const updated = await prisma.invoice.updateMany({
      where: { id },
      data,
    });
    if (updated.count === 0) return res.status(404).json({ error: 'Invoice not found' });

    const invoice = await loadInvoice(id);
    return res.json(serializeDetail(invoice, await getOrderPrefix(prisma)));
  } catch (err) {
    console.error('PATCH /api/admin/invoices/[id]:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// The column the invoice screen and receipts show for how it was paid.
const METHOD_OF_KIND: Record<string, string> = { cash: 'cash', card: 'card', wallet: 'evc' };

export async function recordInvoicePayment(req: Request<{ id: string }>, res: Response) {
  const auth = await requirePage(prisma, req, 'customers', 'act');
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  const { id: rawId } = req.params;
  const invoiceId = parseInt(rawId, 10);
  if (!Number.isFinite(invoiceId)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const body = readJson(req);
    const parsed = recordInvoicePaymentSchema.safeParse(body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' });
    }
    const { amount, accountId, collectedById, note, paidAt } = parsed.data;
    const account = await prisma.moneyAccount.findFirst({ where: { id: accountId, isActive: true, kind: { in: [...TILL_KINDS] } } });
    if (!account) return res.status(400).json({ error: 'That account is not an active cash, wallet or card account' });
    const collector = await resolveCollector(prisma, auth.session!, collectedById);
    if (!collector.ok) return res.status(collector.status ?? 400).json({ error: collector.error });

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id: invoiceId } });
      if (!invoice) throw Object.assign(new Error('Invoice not found'), { httpStatus: 404 });
      if (invoice.status === 'void') throw Object.assign(new Error('Invoice is void — cannot record a payment'), { httpStatus: 409 });

      const total = Number(invoice.total);
      const alreadyPaid = Number(invoice.amountPaid);
      const balance = Math.round((total - alreadyPaid) * 100) / 100;
      if (amount > balance) {
        throw Object.assign(new Error(`Amount exceeds outstanding balance ($${balance.toFixed(2)})`), { httpStatus: 400 });
      }

      const payment = await tx.invoicePayment.create({
        data: {
          invoiceId,
          amount,
          method: METHOD_OF_KIND[account.kind],
          // Label snapshot, so renaming an account never rewrites history.
          account: account.kind === 'wallet' ? account.label : null,
          note: note || null,
          recordedBy: auth.session!.userId,
          paidAt: paidAt ? new Date(paidAt) : undefined,
        },
      });

      await writeInvoicePaymentEntry(tx, {
        invoicePaymentId: payment.id, account, amount, collectedById: collector.value,
        createdById: auth.session!.userId ?? null, at: payment.paidAt,
      });

      const newPaid = Math.round((alreadyPaid + amount) * 100) / 100;
      const newStatus = newPaid >= total ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: { amountPaid: newPaid, status: newStatus },
      });

      return { payment, invoice: updatedInvoice };
    });

    return res.status(201).json({
      payment: {
        id: result.payment.id,
        amount: Number(result.payment.amount).toFixed(2),
        method: result.payment.method,
        account: result.payment.account,
        paidAt: result.payment.paidAt,
      },
      invoice: {
        id: result.invoice.id,
        status: result.invoice.status,
        amountPaid: Number(result.invoice.amountPaid).toFixed(2),
        balance: Math.max(0, Number(result.invoice.total) - Number(result.invoice.amountPaid)).toFixed(2),
      },
    });
  } catch (err) {
    const e = err as { httpStatus?: number; message?: string };
    if (e.httpStatus) return res.status(e.httpStatus).json({ error: e.message });
    console.error('POST /api/admin/invoices/[id]/payments:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
