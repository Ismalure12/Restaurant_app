import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import prisma from '@/lib/prisma';
import { waafiPreAuthorize } from '@/lib/waafi';

export const maxDuration = 300;

export async function POST(request) {
  try {
    const { reference } = await request.json();
    if (!reference) {
      return NextResponse.json({ error: 'reference required' }, { status: 400 });
    }

    const session = await prisma.paymentSession.findUnique({ where: { reference } });
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Strip leading zeros from phone — Waafi expects the bare digits.
    const accountNo = session.phone.replace(/^0+/, '');

    const waafi = await waafiPreAuthorize({
      accountNo,
      referenceId: reference,
      // amount: Number(session.amount).toFixed(2),
      amount: 0.01, // For testing purposes, use a small amount
      description: 'Hotel Jazeera Order',
    });

    if (waafi.networkError) return NextResponse.json({ error: 'failed' }, { status: 502 });
    if (waafi.responseCode === '5306') return NextResponse.json({ error: 'cancelled' }, { status: 402 });
    if (waafi.responseCode === '5309') return NextResponse.json({ error: 'timeout' }, { status: 504 });
    if (!waafi.ok) return NextResponse.json({ error: 'failed' }, { status: 502 });

    if (!waafi.transactionId) {
      return NextResponse.json({ error: 'failed' }, { status: 502 });
    }

    const cart = session.cartJson;
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findUnique({ where: { phone: session.phone } });
      const customerAddress = session.address ?? existing?.address ?? '';

      const customer = await tx.customer.upsert({
        where: { phone: session.phone },
        update: { name: session.name, address: customerAddress },
        create: { phone: session.phone, name: session.name, address: customerAddress },
      });

      const order = await tx.order.create({
        data: {
          customerId: customer.id,
          items: cart,
          total: session.amount,
          address: session.address,
          orderType: session.orderType,
          tableNumber: session.tableNumber,
          status: 'pending',
          paymentTransactionId: waafi.transactionId,
          reference,
        },
      });

      await tx.paymentSession.delete({ where: { reference } });

      return { customer, order };
    });

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const token = await new SignJWT({ customerId: result.customer.id })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1y')
      .sign(secret);

    return NextResponse.json({ success: true, token, reference });
  } catch (err) {
    console.error('POST /api/payment/initiate:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
