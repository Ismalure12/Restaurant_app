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
import { Button, Card, CardHeader, Chip, Facts, Icon, Overline, cx } from '@/components/admin/ui';
import AddItemsModal from './AddItemsModal';
import EditOrderModal from './EditOrderModal';
import VoidOrderModal from './VoidOrderModal';
import {
  MANAGER_ROLES, METHOD_LABEL, STATUS, age, cap, dt, editBlocker, hm, isPayLater, money, payPill, whoOf,
} from './orderUi';

const STAFF_ROLES = ['admin', 'manager', 'cashier'];
const EV_DOT = { ink: 'bg-mq-line-2', info: 'bg-mq-info', warn: 'bg-mq-warn', ok: 'bg-mq-ok', danger: 'bg-mq-danger' };

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
    ev.push({ at, tone: 'info', title: `Added ${ls.reduce((n, l) => n + Number(l.quantity || 0), 0)} items`, body: ls.map((l) => `${l.quantity}× ${l.name}`).join(', ') });
  }
  if (o.status === 'pending') ev.push({ at: o.createdAt, tone: 'warn', title: 'Paid online · waiting for the kitchen to accept' });
  if (o.closedAt) {
    const how = o.paymentMethod === 'invoice'
      ? `Billed to ${o.customer?.name || 'the customer'}'s account${o.invoice ? ` · invoice #${o.invoice.id}` : ''}`
      : `${o.paymentAccount || METHOD_LABEL[o.paymentMethod] || o.paymentMethod || 'Paid'} · ${money(o.total)}${o.receiptNo ? ` · receipt ${o.receiptNo}` : ''}`;
    ev.push({ at: o.closedAt, tone: 'ok', title: o.paymentMethod === 'invoice' ? 'Closed on account' : 'Paid', body: [how, o.staffName && `by ${o.staffName}`].filter(Boolean).join(' · ') });
  }
  if (o.status === 'declined') ev.push({ at: o.updatedAt || o.createdAt, tone: 'danger', title: o.paymentStatus === 'refunded' ? 'Declined · payment refunded' : 'Declined' });
  if (o.editedAt) ev.push({ at: o.editedAt, tone: 'info', title: `Edited by ${o.editedBy || 'a manager'}`, body: o.editReason });
  if (o.voidedAt) ev.push({ at: o.voidedAt, tone: 'danger', title: `Voided by ${o.voidedBy || 'a manager'}`, body: o.voidReason });
  return ev.sort((a, b) => new Date(a.at) - new Date(b.at));
}

/**
 * The order's progress, from its status only (times only where the order
 * stores one: createdAt, closedAt).
 *   online:        Placed → Paid → Accepted
 *   pay later:     Placed → In kitchen → Paid
 *   counter:       Placed → Paid (or On account)
 *   voided / declined end on that state.
 */
function steps(o) {
  const placed = { label: 'Placed', at: o.createdAt, state: 'done' };
  const closedLabel = o.paymentMethod === 'invoice' ? 'On account' : 'Paid';
  if (o.status === 'declined') return [placed, { label: o.paymentStatus === 'refunded' ? 'Declined · refunded' : 'Declined', state: 'end' }];
  if (o.source === 'online') {
    const paid = { label: 'Paid', at: o.closedAt, state: 'done' };
    const accepted = { label: 'Accepted', state: o.status === 'pending' ? 'current' : 'done' };
    return o.status === 'voided' ? [placed, paid, { label: 'Voided', state: 'end' }] : [placed, paid, accepted];
  }
  if (o.status === 'open') return [placed, { label: 'In kitchen', state: 'current' }, { label: 'Paid', state: 'todo' }];
  const closed = { label: closedLabel, at: o.closedAt, state: 'done' };
  return o.status === 'voided' ? [placed, ...(o.closedAt ? [closed] : []), { label: 'Voided', state: 'end' }] : [placed, closed];
}

function Stepper({ items }) {
  return (
    <ol className="m-0 p-0 list-none flex items-center flex-wrap gap-y-2 px-0.5" aria-label="Progress">
      {items.map((s, i) => {
        const prevDone = i > 0 && items[i - 1].state === 'done' && s.state !== 'todo';
        return (
          <li key={s.label} className={cx('flex items-center min-w-0', i > 0 && 'flex-1')}>
            {i > 0 && <span aria-hidden="true" className={cx('flex-1 min-w-3 h-0.5 mx-2', prevDone ? 'bg-mq-primary' : 'bg-mq-line')} />}
            <span className="flex items-center gap-2 flex-none">
              <span
                aria-hidden="true"
                className={cx(
                  'grid place-items-center w-[26px] h-[26px] rounded-full border-2 flex-none',
                  s.state === 'done' && 'bg-mq-primary border-mq-primary text-white',
                  s.state === 'current' && 'bg-white border-mq-primary',
                  s.state === 'todo' && 'bg-white border-mq-line text-mq-faint',
                  s.state === 'end' && 'bg-mq-danger-bg border-mq-danger-line text-mq-danger-ink',
                )}
              >
                {s.state === 'current'
                  ? <span className="w-[8px] h-[8px] rounded-full bg-mq-primary" />
                  : <Icon name={s.state === 'end' ? 'x' : 'check'} size={13} stroke={2.6} />}
              </span>
              <span className="flex flex-col leading-tight">
                <span className={cx('text-[12.5px]', s.state === 'todo' ? 'text-mq-muted' : 'text-mq-ink font-semibold')}>
                  {s.label}<span className="sr-only">{s.state === 'done' ? ' (done)' : s.state === 'current' ? ' (now)' : s.state === 'todo' ? ' (to do)' : ''}</span>
                </span>
                {s.at && <span className="font-mq-mono text-[10.5px] text-mq-muted tabular-nums">{hm(s.at)}</span>}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * One order, fully: who/what/when, the money, what happened, and every action
 * the viewer's role allows. Rendered by the Orders page (embedded), by
 * /orders/[id] and /sales/[id] (full page, with `crumb`) and by the sale
 * drawer (`embedded compact`: no crumb, tighter, fits a 380px drawer).
 *
 * onUpdated(order) — push a changed order back into the caller's cache.
 */
export default function OrderDetailView({ order: o, onUpdated, crumb, onBack, embedded = false, compact = false }) {
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => fetchJson('/api/auth/me'), staleTime: 5 * 60 * 1000 });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => fetchJson('/api/admin/settings'), staleTime: 5 * 60 * 1000 });
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
  const taxRate = Number(settings?.taxRate) || 0;
  const st = STATUS[o.status] || STATUS.confirmed;
  const pay = payPill(o);
  const payLater = isPayLater(o);
  const blocker = editBlocker(o);
  const events = useMemo(() => activity(o), [o]);
  const flow = useMemo(() => steps(o), [o]);
  const isDelivery = o.orderType === 'delivery';
  const note = !isDelivery && o.address ? o.address : null;
  const when = payLater
    ? `Opened ${hm(o.createdAt)} · ${age(o.createdAt)} ago`
    : o.status === 'pending'
      ? `${dt(o.createdAt)} · ${age(o.createdAt)} ago`
      : dt(o.closedAt || o.createdAt);

  const muted = (t) => <span className="text-mq-muted">{t}</span>;
  const facts = [
    ['Order ID', <span className="font-mq-mono text-[12.5px]" key="c">{o.code || `#${o.id}`}</span>],
    ['Receipt #', o.receiptNo ? <span className="font-mq-mono text-[12.5px]" key="r">{o.receiptNo}<span className="text-mq-muted"> · {o.receiptDay}</span></span> : muted('Given when paid')],
    ['Service', `${o.source === 'online' ? 'Online' : 'Counter'} · ${cap(o.orderType)}`],
    !isDelivery && ['Table', o.tableNumber || '—'],
    ['Served by', o.waiterName || o.waiter || '—'],
    ['Cashier', o.staffName || o.staff || (o.source === 'online' ? 'Online checkout' : '—')],
    ['Payment', payLater ? muted('Not paid yet') : (o.paymentAccount || METHOD_LABEL[o.paymentMethod] || '—')],
    received != null && ['Cash received', <span key="cr" className="font-mq-mono tabular-nums">{money(received)}{received > total ? ` · change ${money(received - total)}` : ''}</span>],
    (o.customer || o.contactName) && ['Customer', <span key="cu">{o.customer?.name || o.contactName}{(o.customer?.phone || o.contactPhone) && <span className="text-mq-muted font-mq-mono text-[12.5px]"> · {o.customer?.phone || o.contactPhone}</span>}</span>],
    isDelivery && ['Deliver to', o.address || '—'],
    note && ['Note', note],
    ['Opened', <span key="op" className="font-mq-mono text-[12.5px] tabular-nums">{dt(o.createdAt)}</span>],
    o.closedAt && ['Closed', <span key="cl" className="font-mq-mono text-[12.5px] tabular-nums">{dt(o.closedAt)}</span>],
  ].filter(Boolean);

  // ── actions (role + status gates mirror the API; the API is the authority) ──
  const canAccept = o.status === 'pending' && o.paymentTransactionId && canCash;
  const canPay = payLater && canCash;
  const canPrint = o.status !== 'declined';
  const canFix = canManage && (o.status === 'confirmed' || payLater);
  const hasActions = canAccept || canPay || canPrint || canFix;
  const btn = 'max-nar:h-12';

  const itemsCard = (
    <Card className="overflow-hidden">
      <CardHeader
        title="Items"
        count={units}
        actions={canPay && <Button size="xs" icon="plus" onClick={() => setModal('add')} className="max-nar:h-10">Add items</Button>}
      />
      <ul className="m-0 p-0 list-none">
        {items.map((i, idx) => (
          <li key={i.uid || idx} className={cx('grid grid-cols-[30px_minmax(0,1fr)_auto] gap-3 items-start border-b border-mq-chip', compact ? 'px-3.5 py-2.5' : 'px-4 py-3')}>
            <span className="font-mq-mono font-semibold text-mq-primary tabular-nums">{i.quantity}×</span>
            <span className="min-w-0 flex flex-col gap-0.5">
              <span className="text-sm font-medium text-mq-ink break-words">{i.name}</span>
              {(i.optionName || i.extras?.length > 0 || i.notes) && (
                <span className="text-xs text-mq-muted">{[i.optionName, i.extras?.map((e) => e.name).join(', '), i.notes && `“${i.notes}”`].filter(Boolean).join(' · ')}</span>
              )}
              {i.addedAt && <span className="text-xs text-mq-info-ink">added {dt(i.addedAt)}</span>}
            </span>
            <span className="font-mq-mono text-[13.5px] font-semibold tabular-nums text-mq-ink whitespace-nowrap">{money(Number(i.unitPrice) * Number(i.quantity))}</span>
          </li>
        ))}
      </ul>
      <dl className={cx('m-0 flex flex-col gap-1 bg-mq-cream text-[13.5px]', compact ? 'px-3.5 py-3' : 'px-4 py-3.5')}>
        {(disc > 0 || fee > 0) && <TotalLine k="Subtotal" v={money(sub)} />}
        {disc > 0 && <TotalLine k="Discount" v={`−${money(disc)}`} tone="text-mq-danger-ink" />}
        {fee > 0 && <TotalLine k="Delivery fee" v={money(fee)} />}
        <div className={cx('flex items-baseline justify-between gap-3 text-[17px] font-bold text-mq-ink', (disc > 0 || fee > 0) && 'border-t border-mq-line mt-1.5 pt-2')}>
          <dt>Total</dt><dd className="m-0 font-mq-mono tabular-nums">{money(total)}</dd>
        </div>
        {taxRate > 0 && <div className="text-xs text-mq-muted text-right">incl. tax {taxRate}%</div>}
      </dl>
    </Card>
  );

  const activityBlock = (
    <section className="flex flex-col gap-2" aria-label="Activity">
      <Overline as="h3" className="m-0">Activity</Overline>
      <ol className="m-0 p-0 list-none">
        {events.map((e, i) => (
          <li key={i} className="relative grid grid-cols-[18px_minmax(0,1fr)] gap-2.5 pb-3">
            {i < events.length - 1 && <span aria-hidden="true" className="absolute left-[5px] top-4 bottom-0 w-px bg-mq-line" />}
            <span aria-hidden="true" className={cx('w-[11px] h-[11px] rounded-full mt-1 relative', EV_DOT[e.tone])} />
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="flex justify-between gap-2.5 flex-wrap text-[13.5px] font-semibold text-mq-ink">
                {e.title}<span className="font-mq-mono text-[11.5px] font-medium text-mq-muted tabular-nums">{dt(e.at)}</span>
              </span>
              {e.body && <span className="text-[12.5px] text-mq-muted break-words">{e.body}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );

  const detailsCard = (
    <Card className="overflow-hidden">
      <CardHeader title="Details" />
      <div className={compact ? 'p-3.5' : 'p-4'}>
        <Facts items={facts} labelWidth={compact ? 92 : 104} />
      </div>
    </Card>
  );

  const invoiceCard = o.invoice && (
    <Link
      href={o.customer?.id ? `/admin/dashboard/customers/${o.customer.id}/invoices/${o.invoice.id}` : '/admin/dashboard/customers'}
      className="block bg-white border border-mq-line rounded-xl shadow-mq-card p-4 hover:border-mq-line-2 hover:bg-mq-cream transition-colors focus-visible:outline-none focus-visible:shadow-mq-focus"
    >
      <div className="flex items-center gap-2 mb-2.5">
        <span className="flex-1 text-sm font-semibold text-mq-ink">Invoice #{o.invoice.id}</span>
        <Chip tone={o.invoice.status === 'paid' ? 'ok' : o.invoice.status === 'void' ? 'off' : 'info'} small>{o.invoice.status}</Chip>
      </div>
      <dl className="m-0 flex flex-col gap-1 text-[13px]">
        <TotalLine k="Balance due" v={money(o.invoice.balance)} tone={Number(o.invoice.balance) > 0 ? 'text-mq-danger-ink font-semibold' : 'text-mq-ink'} />
        <TotalLine k="Paid so far" v={money(o.invoice.amountPaid)} />
      </dl>
    </Link>
  );

  return (
    <div className={cx('flex flex-col', embedded && 'min-h-full')}>
      <div className={cx(
        'flex-1 flex flex-col w-full',
        compact ? 'gap-3.5 p-4' : embedded ? 'gap-4 px-4 py-5 tab:px-6 max-w-[820px] mx-auto' : 'gap-4',
      )}
      >
        {onBack && (
          <Button variant="secondary" size="sm" icon="chevLeft" onClick={onBack} className="self-start max-nar:h-11">All orders</Button>
        )}
        {!compact && crumb}

        <Card pad={false} className={cx('flex items-start justify-between gap-4 flex-wrap', compact ? 'p-4' : 'px-5 py-[18px]')}>
          <div className="min-w-0 flex-[1_1_220px] flex flex-col gap-1">
            <span className="font-mq-mono text-xs font-semibold text-mq-muted">{o.code || `#${o.id}`}{o.receiptNo ? ` · receipt ${o.receiptNo}` : ''}</span>
            <span className={cx('font-semibold tracking-[-.02em] leading-tight text-mq-ink break-words', compact ? 'text-xl' : 'text-[26px]')}>{whoOf(o)}</span>
            <span className="flex flex-wrap gap-1.5 mt-1.5">
              <Chip tone={st.tone} pulse={st.pulse} strike={st.strike}>{st.label}</Chip>
              <Chip tone={pay.tone}>{pay.label}</Chip>
              <Chip tone="off" dot={false}>{o.source === 'online' ? 'Online' : 'Counter'} · {cap(o.orderType)}</Chip>
              {o.editedAt && <Chip tone="info" dot={false}>Edited</Chip>}
            </span>
          </div>
          <div className="text-right flex-none">
            <div className={cx('font-mq-mono font-medium tracking-[-.03em] leading-none tabular-nums text-mq-ink', compact ? 'text-[26px]' : 'text-[32px]', o.status === 'voided' && 'line-through text-mq-muted')}>{money(total)}</div>
            <div className="text-[12.5px] text-mq-muted mt-1.5">{when}</div>
          </div>
        </Card>

        <Stepper items={flow} />

        {embedded ? (
          <>
            {itemsCard}
            {detailsCard}
            {invoiceCard}
            {activityBlock}
          </>
        ) : (
          <div className="grid gap-4 desk:grid-cols-[minmax(0,1fr)_340px] items-start">
            <div className="flex flex-col gap-4 min-w-0">{itemsCard}{activityBlock}</div>
            <div className="flex flex-col gap-4 min-w-0">{detailsCard}{invoiceCard}</div>
          </div>
        )}
      </div>

      {hasActions && (
        <div className={cx(
          'sticky bottom-0 z-[2] bg-white',
          embedded ? 'border-t border-mq-line' : 'mt-4 border border-mq-line rounded-xl shadow-mq-md',
          compact ? 'px-4 py-3' : 'px-4 py-3 tab:px-5',
        )}
        >
          {canFix && o.status === 'confirmed' && blocker && <p className="m-0 mb-2 text-xs text-mq-muted">{blocker}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {canAccept && (
              <>
                <Button variant="primary" size="lg" icon="check" className={cx('flex-[1_1_160px]', btn)} disabled={act.isPending} onClick={() => act.mutate('accept')}>Accept order</Button>
                <Button variant="danger-soft" size="lg" icon="x" className={btn} disabled={act.isPending} onClick={decline}>
                  {act.isPending && act.variables === 'decline' ? 'Declining…' : 'Decline & refund'}
                </Button>
              </>
            )}
            {canPay && (
              <Button variant="primary" size="lg" icon="cash" className={cx('flex-[1_1_160px]', btn)} onClick={() => setModal('pay')}>
                Take payment · <span className="font-mq-mono tabular-nums">{money(total)}</span>
              </Button>
            )}
            {canPrint && (
              <>
                {payLater
                  ? <Button size="lg" icon="print" className={btn} onClick={() => print('bill')}>Print bill</Button>
                  : <Button size="lg" icon="print" className={btn} onClick={() => print('customer')}>Receipt</Button>}
                <Button size="lg" icon="print" className={btn} onClick={() => print('kitchen')}>Kitchen ticket</Button>
              </>
            )}
            {canFix && (
              <>
                <span className="flex-1 max-tab:hidden" />
                <Button size="lg" icon="pen" className={btn} onClick={() => setModal('edit')} disabled={Boolean(blocker)} title={blocker || undefined}>Edit</Button>
                <Button variant="danger-soft" size="lg" icon="trash" className={btn} onClick={() => setModal('void')}>Void</Button>
              </>
            )}
          </div>
        </div>
      )}

      {modal === 'pay' && (
        <TakePaymentModal
          tab={o}
          onClose={() => setModal(null)}
          onPaid={(order) => {
            setModal(null);
            onUpdated?.(order);
            // No auto-print: the table already has the bill. Receipt is one tap away.
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

function TotalLine({ k, v, tone = 'text-mq-ink' }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-mq-muted">{k}</dt>
      <dd className={cx('m-0 font-mq-mono tabular-nums', tone)}>{v}</dd>
    </div>
  );
}
