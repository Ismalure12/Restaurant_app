'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, parseApiError } from '@/lib/apiError';
import OrderDetailView from '@/components/admin/orders/OrderDetailView';
import PaymentDetail, { PAY_STATUS, isStuck, useOnlinePayments } from '@/components/admin/orders/OnlinePaymentsPanel';
import {
  EmptyState, ErrorState, Icon, RowSkeletons, SearchInput, Segmented, cx, useBreakpoint, usePanelWidth,
} from '@/components/admin/ui';
import { STATUS, age, cap, hm, initials, isUnpaid, money, payPill, whoOf } from '@/components/admin/orders/orderUi';

// Orders = live work only (GET /api/admin/orders): pending online orders,
// unpaid dine-in orders and anything created/closed/voided today. Stuck online
// payments (a checkout with no order) sit at the top under "Needs a decision".
// A resizable list + detail split on ≥900px; on smaller screens the list and
// the detail swap. ?id=<orderId> preselects an order (Tables links here),
// ?pay=unpaid opens on Unpaid, ?tab=payments opens the first stuck payment.

const VIEWS = [['all', 'All'], ['await', 'Awaiting'], ['kitchen', 'In kitchen'], ['unpaid', 'Unpaid']];
const SOURCES = [{ value: 'all', label: 'All' }, { value: 'online', label: 'Online' }, { value: 'pos', label: 'Counter' }];
const inView = (o, v) => v === 'all' || (v === 'await' && o.status === 'pending') || (v === 'kitchen' && o.status === 'open') || (v === 'unpaid' && isUnpaid(o));
const TILE = {
  warn: 'bg-mq-warn-bg text-mq-warn-ink', info: 'bg-mq-info-bg text-mq-info-ink', ok: 'bg-mq-soft text-mq-primary',
  plain: 'bg-mq-chip text-mq-chip-ink', off: 'bg-mq-chip text-mq-chip-ink', danger: 'bg-mq-danger-bg text-mq-danger',
};
const RULE_COLOR = { warn: 'shadow-[inset_3px_0_0_#B06A00]', info: 'shadow-[inset_3px_0_0_#1F6FB2]', danger: 'shadow-[inset_3px_0_0_#C8321F]' };
const PAY_MINI = { ok: 'bg-mq-ok-bg text-mq-ok-ink', warn: 'bg-mq-warn-bg text-mq-warn-ink', info: 'bg-mq-info-bg text-mq-info-ink', off: 'bg-mq-chip text-mq-chip-ink' };

function OrdersPage() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const bp = useBreakpoint();
  const split = bp === 'desktop' || bp === 'narrow';
  const { width, handleProps } = usePanelWidth('ord', { initial: 380, min: 280, max: 620, edge: 'right' });

  const [view, setView] = useState(() => (params.get('pay') === 'unpaid' ? 'unpaid' : 'all'));
  const [src, setSrc] = useState('all');
  const [search, setSearch] = useState('');
  // undefined = the URL's choice (?id / ?tab=payments); null = nothing selected.
  const [picked, setPicked] = useState(() => {
    const id = Number(params.get('id'));
    return Number.isInteger(id) && id > 0 ? { kind: 'order', id } : undefined;
  });

  const { data: ordersData, isLoading, isError, error, refetch } = useQuery({ queryKey: ['orders-all'], queryFn: () => fetchJson('/api/admin/orders'), refetchInterval: 30_000 }); // live via SSE; the poll is the fallback
  const orders = useMemo(() => (Array.isArray(ordersData) ? ordersData : []), [ordersData]);
  const { payments } = useOnlinePayments();

  const stuck = useMemo(() => payments.filter(isStuck), [payments]);
  const sel = picked !== undefined ? picked
    : (params.get('tab') === 'payments' && stuck[0] ? { kind: 'payment', id: stuck[0].id } : null);

  const replaceOrder = (updated) => {
    qc.setQueryData(['orders-all'], (list) => (Array.isArray(list) ? list.map((x) => (x.id === updated.id ? updated : x)) : list));
    qc.setQueryData(['order', String(updated.id)], updated);
    qc.invalidateQueries({ queryKey: ['customers'] });
    qc.invalidateQueries({ queryKey: ['tables-status'] });
  };

  const q = search.trim().toLowerCase();
  const bySource = useMemo(() => orders.filter((o) => src === 'all' || o.source === src), [orders, src]);
  const showPayments = src !== 'pos';
  const counts = {
    all: bySource.length + (showPayments ? stuck.length : 0),
    await: bySource.filter((o) => o.status === 'pending').length + (showPayments ? stuck.length : 0),
    kitchen: bySource.filter((o) => o.status === 'open').length,
    unpaid: bySource.filter(isUnpaid).length,
  };

  const groups = useMemo(() => {
    const match = (o) => !q || whoOf(o).toLowerCase().includes(q) || String(o.id).includes(q) || (o.code || '').toLowerCase().includes(q)
      || String(o.receiptNo || '').includes(q) || (o.contactPhone || '').includes(q) || String(o.tableNumber || '').toLowerCase().includes(q);
    const payMatch = (p) => !q || (p.name || '').toLowerCase().includes(q) || String(p.phone || '').includes(q);
    const list = bySource.filter((o) => inView(o, view) && match(o));
    const payRows = showPayments && (view === 'all' || view === 'await') ? payments.filter(payMatch) : [];
    return [
      { key: 'decision', title: 'Needs a decision', rows: [...payRows.filter(isStuck).map((p) => ({ kind: 'payment', p })), ...list.filter((o) => o.status === 'pending').map((o) => ({ kind: 'order', o }))] },
      { key: 'kitchen', title: 'In kitchen · unpaid', rows: list.filter((o) => o.status === 'open').map((o) => ({ kind: 'order', o })) },
      { key: 'done', title: 'Completed today', rows: list.filter((o) => o.status === 'confirmed').map((o) => ({ kind: 'order', o })) },
      { key: 'closed', title: 'Declined & voided today', rows: list.filter((o) => o.status === 'declined' || o.status === 'voided').map((o) => ({ kind: 'order', o })) },
      { key: 'checkouts', title: 'Online checkouts without an order', rows: view === 'all' ? payRows.filter((p) => !isStuck(p)).map((p) => ({ kind: 'payment', p })) : [] },
    ].filter((g) => g.rows.length);
  }, [bySource, payments, view, q, showPayments]);

  // The selected order: from the live list, else loaded on its own (an older order via ?id=).
  const selOrderInList = sel?.kind === 'order' ? orders.find((o) => o.id === sel.id) : null;
  const single = useQuery({
    queryKey: ['order', String(sel?.id)],
    queryFn: () => fetchJson(`/api/admin/orders/${sel.id}`),
    enabled: sel?.kind === 'order' && !selOrderInList && !isLoading,
    retry: false,
  });
  const selOrder = sel?.kind === 'order' ? (selOrderInList || single.data) : null;
  const selPayment = sel?.kind === 'payment' ? payments.find((p) => p.id === sel.id) : null;
  const showDetail = split || Boolean(sel);
  const back = split ? undefined : () => setPicked(null);

  const list = (
    <section
      aria-label="Orders"
      className={cx('flex flex-col min-h-0 bg-white', split ? 'flex-none border-r border-mq-line' : 'flex-1 min-w-0')}
      style={split ? { width } : undefined}
    >
      <div className="flex flex-col gap-2.5 px-3.5 py-3 border-b border-mq-chip">
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Show">
          {VIEWS.map(([v, l]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cx(
                'flex flex-col items-center justify-center gap-px min-h-[52px] px-1 py-1.5 rounded-[9px] border text-[11.5px] font-semibold transition-colors',
                view === v ? 'bg-mq-soft border-mq-soft-line text-mq-primary' : 'bg-white border-mq-line text-mq-on-tint hover:bg-mq-canvas',
              )}
            >
              <span className="font-mq-mono text-base font-semibold tabular-nums">{counts[v]}</span>{l}
            </button>
          ))}
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Customer, table, order ID, receipt #, phone" aria-label="Search orders" className="h-10" />
        <Segmented label="Source" options={SOURCES} value={src} onChange={setSrc} className="self-start" />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <RowSkeletons rows={7} />
        ) : isError ? (
          <div className="p-3.5"><ErrorState error={{ message: parseApiError(error) }} onRetry={() => refetch()} title="Couldn’t load orders" /></div>
        ) : groups.length === 0 ? (
          <EmptyState icon="orders" title={orders.length ? 'No matching orders' : 'Nothing waiting'}>
            {orders.length ? 'Try another filter or search.' : 'No orders today yet. New ones appear here the moment they arrive.'}
          </EmptyState>
        ) : groups.map((g) => (
          <div key={g.key}>
            <div className="sticky top-0 z-[1] flex items-center gap-2 px-3.5 pt-2.5 pb-1.5 bg-white/90 backdrop-blur-[6px] text-[10.5px] font-bold uppercase tracking-[.1em] text-mq-muted">
              {g.title}<span className="font-mq-mono bg-mq-chip text-mq-chip-ink rounded-full px-[7px] tabular-nums">{g.rows.length}</span>
            </div>
            {g.rows.map((r) => (r.kind === 'payment'
              ? <PaymentRow key={`p${r.p.id}`} p={r.p} on={sel?.kind === 'payment' && sel.id === r.p.id} onPick={() => setPicked({ kind: 'payment', id: r.p.id })} />
              : <OrderRow key={r.o.id} o={r.o} on={sel?.kind === 'order' && sel.id === r.o.id} onPick={() => setPicked({ kind: 'order', id: r.o.id })} />))}
          </div>
        ))}
        {!isLoading && !isError && (
          <div className="px-3.5 py-4 text-center">
            <Link href="/admin/dashboard/sales" className="text-[12.5px] font-semibold text-mq-cta hover:text-mq-primary">Older orders are in Sales history →</Link>
          </div>
        )}
      </div>
    </section>
  );

  const detail = (
    <section aria-label="Order detail" className="flex-1 min-w-0 min-h-0 overflow-y-auto">
      {selPayment ? (
        <PaymentDetail
          key={`p${selPayment.id}`}
          payment={selPayment}
          onBack={back}
          onResolved={(orderId) => setPicked(orderId ? { kind: 'order', id: orderId } : null)}
        />
      ) : selOrder ? (
        <OrderDetailView key={selOrder.id} order={selOrder} embedded onUpdated={replaceOrder} onBack={back} />
      ) : sel?.kind === 'order' && (single.isLoading || isLoading) ? (
        <RowSkeletons rows={8} />
      ) : (
        <div className="h-full grid place-items-center p-6">
          {!split && sel && (
            <button type="button" onClick={() => setPicked(null)} className="justify-self-start self-start inline-flex items-center gap-1.5 min-h-11 text-[13px] font-semibold text-mq-cta">
              <Icon name="chevLeft" size={15} stroke={2} />All orders
            </button>
          )}
          <EmptyState icon="orders" title={sel ? 'This one is no longer here' : 'Select an order'}>
            {sel ? 'It was settled or dismissed. Pick another on the left.' : 'Pick a ticket on the left to see it, take payment, accept or print.'}
          </EmptyState>
        </div>
      )}
    </section>
  );

  return (
    <div className="flex h-[calc(100dvh-61px)] min-h-[420px]">
      {(split || !sel) && list}
      {split && (
        <div
          {...handleProps}
          title="Drag to resize · double-click to reset"
          className="flex-none w-2.5 -mx-[5px] z-[6] grid place-items-center cursor-col-resize touch-none hover:bg-[rgba(133,13,51,.07)] focus-visible:outline-none focus-visible:bg-[rgba(133,13,51,.07)]"
        >
          <span className="w-1 h-9 rounded-full bg-[#D5D5CF]" />
        </div>
      )}
      {showDetail && detail}
    </div>
  );
}

function RowShell({ on, rule, onPick, children, label }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-current={on ? 'true' : undefined}
      aria-label={label}
      className={cx(
        'flex items-center gap-3 w-full min-h-[66px] px-3.5 py-3 border-b border-mq-chip text-left transition-colors focus-visible:outline-none focus-visible:bg-mq-soft',
        rule ? RULE_COLOR[rule] : '',
        on ? 'bg-mq-soft' : 'bg-white hover:bg-mq-cream',
      )}
    >
      {children}
    </button>
  );
}

function OrderRow({ o, on, onPick }) {
  const st = STATUS[o.status] || STATUS.confirmed;
  const pay = payPill(o);
  const units = (Array.isArray(o.items) ? o.items : []).reduce((n, l) => n + Number(l.quantity || 0), 0);
  const who = o.waiterName || o.waiter || o.staffName || o.staff;
  const sub = [
    o.code || `#${o.id}`,
    o.source === 'online' ? 'Online' : cap(o.orderType),
    `${units} ${units === 1 ? 'item' : 'items'}`,
    o.tableNumber && !whoOf(o).startsWith('Table') ? `Table ${o.tableNumber}` : null,
    who,
    o.editedAt && 'edited',
  ].filter(Boolean).join(' · ');
  const waiting = o.status === 'pending' || o.status === 'open';
  const rule = o.status === 'pending' ? 'warn' : o.status === 'open' ? 'info' : null;
  const tile = o.tableNumber && o.orderType === 'dine_in' ? `T${String(o.tableNumber).replace(/^\D+/, '').slice(0, 3) || initials(String(o.tableNumber))}` : initials(whoOf(o));
  return (
    <RowShell on={on} rule={rule} onPick={onPick}>
      <span className={cx('grid place-items-center w-10 h-10 rounded-[11px] text-[12.5px] font-bold flex-none', TILE[st.tone])} aria-hidden="true">{tile}</span>
      <span className="flex-1 min-w-0 flex flex-col gap-[3px]">
        <span className="flex items-center gap-2 min-w-0">
          {o.status === 'pending' && <span className="w-[7px] h-[7px] rounded-full bg-mq-warn flex-none animate-mq-pulse motion-reduce:animate-none" aria-hidden="true" />}
          <span className={cx('text-[14.5px] font-semibold truncate', o.status === 'voided' ? 'text-mq-muted line-through' : 'text-mq-ink')}>{whoOf(o)}</span>
          <span className={cx('inline-flex flex-none rounded-full px-[7px] py-px text-[10.5px] font-bold uppercase tracking-[.04em]', PAY_MINI[pay.tone] || PAY_MINI.off)}>{pay.label}</span>
        </span>
        <span className="text-[12.5px] text-mq-on-tint truncate">{sub}</span>
      </span>
      <span className="flex-none flex flex-col items-end gap-[3px] text-right">
        <span className={cx('font-mq-mono text-[15px] font-semibold tabular-nums', o.status === 'voided' ? 'text-mq-muted line-through' : 'text-mq-ink')}>{money(o.total)}</span>
        <span className={cx('text-[11.5px] tabular-nums', o.status === 'pending' ? 'text-mq-warn-ink font-semibold' : 'text-mq-on-tint')}>
          {waiting ? age(o.createdAt) : hm(o.closedAt || o.createdAt)}
        </span>
        <span className="sr-only">{st.label}</span>
      </span>
    </RowShell>
  );
}

function PaymentRow({ p, on, onPick }) {
  const st = PAY_STATUS[p.status] || PAY_STATUS.checking;
  const danger = isStuck(p);
  return (
    <RowShell on={on} rule={danger ? 'danger' : null} onPick={onPick}>
      <span className={cx('grid place-items-center w-10 h-10 rounded-[11px] flex-none', danger ? TILE.danger : TILE.off)} aria-hidden="true">
        <Icon name={danger ? 'alert' : 'clock'} size={19} stroke={2} />
      </span>
      <span className="flex-1 min-w-0 flex flex-col gap-[3px]">
        <span className="text-[14.5px] font-semibold text-mq-ink truncate">{p.name || 'Online payment'}</span>
        <span className={cx('text-[12.5px] truncate', danger ? 'text-mq-danger-ink font-medium' : 'text-mq-on-tint')}>
          {st.label} · <span className="font-mq-mono">{p.phone}</span> · Online · {cap(p.orderType)}
        </span>
      </span>
      <span className="flex-none flex flex-col items-end gap-[3px] text-right">
        <span className="font-mq-mono text-[15px] font-semibold tabular-nums text-mq-ink">{money(p.total)}</span>
        <span className="text-[11.5px] text-mq-on-tint tabular-nums">{age(p.startedAt || p.createdAt)}</span>
      </span>
    </RowShell>
  );
}

export default function OrdersRoute() {
  return <Suspense fallback={<RowSkeletons rows={6} />}><OrdersPage /></Suspense>;
}
