'use client';

import { useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import ReceiptDoc, { receiptFromOrder } from '@/components/admin/ReceiptDoc';
import { usePrintDoc } from '@/components/admin/printShared';
import TakePaymentModal from '@/components/admin/TakePaymentModal';
import useConfirm from '@/hooks/useConfirm';
import AddItemsModal from './AddItemsModal';
import EditOrderModal from './EditOrderModal';
import VoidOrderModal from './VoidOrderModal';
import {
  Ic, MANAGER_ROLES, METHOD_LABEL, STATUS, cap, dt, editBlocker, isPayLater, money, payPill, whoOf,
} from './orderUi';

const STAFF_ROLES = ['admin', 'manager', 'cashier'];

/** What happened to the order, oldest first — built from its own timestamps and lines. */
function activity(o) {
  const ev = [];
  const lines = Array.isArray(o.items) ? o.items : [];
  ev.push({
    at: o.createdAt, tone: 'ink',
    title: o.source === 'online' ? 'Ordered online' : 'Order placed at the counter',
    body: [o.waiterName && `Served by ${o.waiterName}`, o.tableNumber && `Table ${o.tableNumber}`].filter(Boolean).join(' · '),
  });
  // Items added later carry addedAt — one event per round.
  const rounds = new Map();
  for (const l of lines) if (l.addedAt) rounds.set(l.addedAt, [...(rounds.get(l.addedAt) || []), l]);
  for (const [at, ls] of rounds) {
    ev.push({ at, tone: 'sky', title: `Added ${ls.reduce((n, l) => n + Number(l.quantity || 0), 0)} items`, body: ls.map((l) => `${l.quantity}× ${l.name}`).join(', ') });
  }
  if (o.status === 'pending') ev.push({ at: o.createdAt, tone: 'amber', title: 'Paid online · waiting for the kitchen to accept' });
  if (o.closedAt) {
    const how = o.paymentMethod === 'invoice'
      ? `Billed to ${o.customer?.name || 'the customer'}'s account${o.invoice ? ` · invoice #${o.invoice.id}` : ''}`
      : `${o.paymentAccount || METHOD_LABEL[o.paymentMethod] || o.paymentMethod || 'Paid'} · ${money(o.total)}${o.receiptNo ? ` · receipt ${o.receiptNo}` : ''}`;
    ev.push({ at: o.closedAt, tone: 'green', title: o.paymentMethod === 'invoice' ? 'Closed on account' : 'Paid', body: [how, o.staffName && `by ${o.staffName}`].filter(Boolean).join(' · ') });
  }
  if (o.status === 'declined') ev.push({ at: o.updatedAt || o.createdAt, tone: 'rose', title: o.paymentStatus === 'refunded' ? 'Declined · payment refunded' : 'Declined' });
  if (o.editedAt) ev.push({ at: o.editedAt, tone: 'sky', title: `Edited by ${o.editedBy || 'a manager'}`, body: o.editReason });
  if (o.voidedAt) ev.push({ at: o.voidedAt, tone: 'rose', title: `Voided by ${o.voidedBy || 'a manager'}`, body: o.voidReason });
  return ev.sort((a, b) => new Date(a.at) - new Date(b.at));
}

/**
 * One order, fully: who/what/when, the money, what happened, and every action
 * the viewer's role allows. Rendered by the Orders page (embedded), by
 * /orders/[id] and by /sales/[id] (Sales history).
 *
 * onUpdated(order) — push a changed order back into the caller's cache.
 */
export default function OrderDetailView({ order: o, onUpdated, crumb, onBack, embedded = false }) {
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => fetchJson('/api/auth/me'), staleTime: 5 * 60 * 1000 });
  const canManage = MANAGER_ROLES.includes(me?.role);
  const canCash = STAFF_ROLES.includes(me?.role);
  const [modal, setModal] = useState(null); // 'pay' | 'add' | 'edit' | 'void'
  const [doc, setDoc] = useState(null);
  const [printKind, printDoc] = usePrintDoc();

  const print = (kind, extra) => {
    flushSync(() => setDoc(receiptFromOrder(o, extra)));
    printDoc(kind);
  };

  const { confirm, dialog } = useConfirm();
  const act = useMutation({
    // Decline refunds through Sifalo first — give it longer than the default timeout.
    mutationFn: (kind) => fetchJson(`/api/admin/orders/${o.id}/${kind}`, { method: 'POST', ...(kind === 'decline' ? { timeoutMs: 130000 } : {}) }),
    onSuccess: (d, kind) => {
      const refunded = d?.order?.paymentStatus === 'refunded';
      notify.success(kind === 'accept' ? 'Accepted — sent to the kitchen' : refunded ? 'Declined and refunded' : 'Declined');
      if (d?.order) onUpdated?.(d.order);
    },
    onError: (e, kind) => notify.error(e, { title: kind === 'decline' ? 'Could not decline the order' : 'Could not update the order' }),
  });
  const decline = async () => {
    const paid = o.paymentStatus === 'paid';
    const ok = await confirm({
      title: paid ? 'Decline and refund this order?' : 'Decline this order?',
      body: paid
        ? `${money(o.total)} goes back to the customer through Sifalo. This can't be undone.`
        : "The order is cancelled. This can't be undone.",
      confirmLabel: paid ? 'Decline & refund' : 'Decline',
    });
    if (ok) act.mutate('decline');
  };

  const items = Array.isArray(o.items) ? o.items : [];
  const units = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
  const sub = items.reduce((s, i) => s + Number(i.unitPrice) * Number(i.quantity), 0);
  const disc = Number(o.discount || 0);
  const fee = Number(o.deliveryFee || 0);
  const total = Number(o.total || 0);
  const received = o.amountReceived != null ? Number(o.amountReceived) : null;
  const st = STATUS[o.status] || STATUS.confirmed;
  const pay = payPill(o);
  const payLater = isPayLater(o);
  const blocker = editBlocker(o);
  const events = useMemo(() => activity(o), [o]);
  const isDelivery = o.orderType === 'delivery';
  const note = !isDelivery && o.address ? o.address : null;

  const facts = [
    ['Order ID', <span className="mono" key="c">{o.code || `#${o.id}`}</span>],
    ['Receipt #', o.receiptNo ? <span className="mono" key="r">{o.receiptNo}<span className="sub"> · {o.receiptDay}</span></span> : <span className="sub" key="r">Given when paid</span>],
    ['Service', `${o.source === 'online' ? 'Online' : 'Counter'} · ${cap(o.orderType)}`],
    !isDelivery && ['Table', o.tableNumber || '—'],
    ['Served by', o.waiterName || o.waiter || '—'],
    ['Cashier', o.staffName || o.staff || (o.source === 'online' ? 'Online checkout' : '—')],
    ['Payment', payLater ? <span className="sub" key="p">Not paid yet</span> : (o.paymentAccount || METHOD_LABEL[o.paymentMethod] || '—')],
    received != null && ['Cash received', `${money(received)}${received > total ? ` · change ${money(received - total)}` : ''}`],
    (o.customer || o.contactName) && ['Customer', <span key="cu">{o.customer?.name || o.contactName}{(o.customer?.phone || o.contactPhone) && <span className="sub mono"> · {o.customer?.phone || o.contactPhone}</span>}</span>],
    isDelivery && ['Deliver to', o.address || '—'],
    note && ['Note', note],
    ['Opened', dt(o.createdAt)],
    o.closedAt && ['Closed', dt(o.closedAt)],
  ].filter(Boolean);

  return (
    <div className={`odv${embedded ? ' odv-embedded' : ''}`}>
      {onBack && <button className="btn btn-ghost btn-sm odv-back" onClick={onBack}>{Ic.back}All orders</button>}
      {crumb}

      <section className="odv-hero">
        <div className="odv-hero-main">
          <div className="odv-code">{o.code || `#${o.id}`}</div>
          <div className="odv-who">{whoOf(o)}</div>
          <div className="odv-pills">
            <span className={`pill ${pay.cls}`}>{pay.label}</span>
            <span className={`pill ${st.cls}`}><span className="pdot" />{st.label}</span>
            <span className="pill pill-ghost">{o.source === 'online' ? 'Online' : 'Counter'} · {cap(o.orderType)}</span>
            {o.editedAt && <span className="pill pill-sky">Edited</span>}
          </div>
        </div>
        <div className="odv-hero-side">
          <div className="odv-total">{money(total)}</div>
          <div className="odv-receipt">{o.receiptNo ? `Receipt ${o.receiptNo}` : payLater ? 'Due when the guests pay' : ''}</div>
        </div>
      </section>

      {payLater && canCash && (
        <div className="odv-due">
          <div><b>Unpaid · {money(total)}</b><span className="sub"> — the guests pay when they ask for the bill.</span></div>
          <div className="odv-due-acts">
            <button className="btn btn-ghost" onClick={() => setModal('add')}>{Ic.plus}Add items</button>
            <button className="btn btn-primary" onClick={() => setModal('pay')}>{Ic.cash}Take payment</button>
          </div>
        </div>
      )}

      <div className="odv-actions">
        {o.status === 'pending' && o.paymentTransactionId && canCash && (
          <>
            <button className="btn btn-primary" disabled={act.isPending} onClick={() => act.mutate('accept')}>{Ic.check}Accept</button>
            <button className="btn btn-danger" disabled={act.isPending} onClick={decline}>{Ic.x}{act.isPending && act.variables === 'decline' ? 'Declining…' : 'Decline & refund'}</button>
          </>
        )}
        {o.status !== 'declined' && (
          <>
            {payLater
              ? <button className="btn btn-ghost" onClick={() => print('bill')}>{Ic.print}Print bill</button>
              : <button className="btn btn-ghost" onClick={() => print('customer')}>{Ic.print}Receipt</button>}
            <button className="btn btn-ghost" onClick={() => print('kitchen')}>{Ic.print}Kitchen ticket</button>
          </>
        )}
        <div className="grow" />
        {canManage && (o.status === 'confirmed' || payLater) && (
          <>
            <button className="btn btn-ghost" onClick={() => setModal('edit')} disabled={Boolean(blocker)} title={blocker || undefined}>{Ic.pen}Edit</button>
            <button className="btn btn-danger" onClick={() => setModal('void')}>{Ic.x}Void</button>
          </>
        )}
      </div>
      {canManage && o.status === 'confirmed' && blocker && <div className="note odv-blocker">{blocker}</div>}

      <div className="odv-grid">
        <div className="odv-main">
          <section className="card odv-card">
            <div className="odv-card-h"><span className="ttl">Items</span><span className="sub">{units} {units === 1 ? 'item' : 'items'}</span></div>
            <div className="odv-lines">
              {items.map((i, idx) => (
                <div className="odv-line" key={i.uid || idx}>
                  <span className="odv-q">{i.quantity}×</span>
                  <div className="odv-nm">
                    {i.name}
                    {(i.optionName || i.extras?.length > 0 || i.notes) && <div className="odv-mod">{[i.optionName, i.extras?.map((e) => e.name).join(', '), i.notes && `“${i.notes}”`].filter(Boolean).join(' · ')}</div>}
                    {i.addedAt && <div className="odv-mod">added {dt(i.addedAt)}</div>}
                  </div>
                  <span className="odv-amt">{money(Number(i.unitPrice) * Number(i.quantity))}</span>
                </div>
              ))}
            </div>
            <div className="odv-tot">
              {(disc > 0 || fee > 0) && <div className="r"><span>Subtotal</span><span className="mono">{money(sub)}</span></div>}
              {disc > 0 && <div className="r"><span>Discount</span><span className="mono rose">−{money(disc)}</span></div>}
              {fee > 0 && <div className="r"><span>Delivery fee</span><span className="mono">{money(fee)}</span></div>}
              <div className="r t"><span>Total</span><span className="mono">{money(total)}</span></div>
            </div>
          </section>

          <section className="card odv-card">
            <div className="odv-card-h"><span className="ttl">Activity</span></div>
            <ol className="odv-feed">
              {events.map((e, i) => (
                <li key={i} className={`odv-ev ${e.tone}`}>
                  <span className="odv-dot" aria-hidden="true" />
                  <div>
                    <div className="odv-ev-t">{e.title}<span className="odv-ev-at">{dt(e.at)}</span></div>
                    {e.body && <div className="odv-ev-b">{e.body}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="odv-side">
          <section className="card odv-card">
            <div className="odv-card-h"><span className="ttl">Details</span></div>
            <dl className="odv-facts">
              {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
          </section>
          {o.invoice && (
            <Link className="card odv-card odv-invoice" href={o.customer?.id ? `/admin/dashboard/customers/${o.customer.id}/invoices/${o.invoice.id}` : '/admin/dashboard/customers'}>
              <div className="odv-card-h"><span className="ttl">Invoice #{o.invoice.id}</span><span className="pill pill-ghost">{o.invoice.status}</span></div>
              <div className="odv-inv-row"><span>Balance due</span><b className={Number(o.invoice.balance) > 0 ? 'rose' : ''}>{money(o.invoice.balance)}</b></div>
              <div className="odv-inv-row"><span>Paid so far</span><span>{money(o.invoice.amountPaid)}</span></div>
            </Link>
          )}
        </aside>
      </div>

      {modal === 'pay' && (
        <TakePaymentModal
          tab={o}
          onClose={() => setModal(null)}
          onPaid={(order) => {
            setModal(null);
            onUpdated?.(order);
            // No auto-print: the guests already have the bill. Receipt is one tap away.
            notify.success(order.invoiceId ? `Billed · invoice #${order.invoiceId}` : `Paid · receipt ${order.receiptNo}`);
          }}
        />
      )}
      {modal === 'add' && (
        <AddItemsModal
          order={o}
          onClose={() => setModal(null)}
          onAdded={(d) => {
            setModal(null);
            onUpdated?.(d.order);
            notify.success(`Added ${d.addedLines.length} ${d.addedLines.length === 1 ? 'line' : 'lines'} · new total ${money(d.order.total)}`);
            // The kitchen hasn't seen these yet — print just the new lines.
            flushSync(() => setDoc(receiptFromOrder(d.order, { addedLines: d.addedLines })));
            printDoc('kitchen');
          }}
        />
      )}
      {modal === 'edit' && (
        <EditOrderModal
          order={o}
          onClose={() => setModal(null)}
          onSaved={(d) => {
            setModal(null);
            onUpdated?.(d.order);
            const delta = Number(d.totalDelta);
            notify.success(delta === 0 ? 'Order updated' : `Order updated · total ${delta < 0 ? 'down' : 'up'} ${money(Math.abs(delta))}`);
          }}
        />
      )}
      {modal === 'void' && (
        <VoidOrderModal
          order={o}
          onClose={() => setModal(null)}
          onDone={(d) => {
            setModal(null);
            onUpdated?.(d.order);
            const owed = Number(d.refund.orderAmount) + Number(d.refund.invoiceCollected);
            notify.success(owed > 0 ? `Order voided · refund ${money(owed)} to the customer` : 'Order voided');
          }}
        />
      )}
      <ReceiptDoc order={doc} kind={printKind} />
      {dialog}
    </div>
  );
}
