import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireStaff } from '@/lib/auth';
import { recordInvoicePaymentSchema } from '@/lib/validations';

export async function POST(request, { params }) {
  const auth = await requireStaff(prisma);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: rawId } = await params;
  const invoiceId = parseInt(rawId, 10);
  if (!Number.isFinite(invoiceId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  try {
    const body = await request.json();
    const parsed = recordInvoicePaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues?.[0]?.message || 'Invalid input' }, { status: 400 });
    }
    const { amount, method, note, paidAt } = parsed.data;

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
          method,
          note: note || null,
          recordedBy: auth.session.userId,
          paidAt: paidAt ? new Date(paidAt) : undefined,
        },
      });

      const newPaid = Math.round((alreadyPaid + amount) * 100) / 100;
      const newStatus = newPaid >= total ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: { amountPaid: newPaid, status: newStatus },
      });

      return { payment, invoice: updatedInvoice };
    });

    return NextResponse.json({
      payment: {
        id: result.payment.id,
        amount: Number(result.payment.amount).toFixed(2),
        method: result.payment.method,
        paidAt: result.payment.paidAt,
      },
      invoice: {
        id: result.invoice.id,
        status: result.invoice.status,
        amountPaid: Number(result.invoice.amountPaid).toFixed(2),
        balance: Math.max(0, Number(result.invoice.total) - Number(result.invoice.amountPaid)).toFixed(2),
      },
    }, { status: 201 });
  } catch (err) {
    if (err.httpStatus) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    console.error('POST /api/admin/invoices/[id]/payments:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
