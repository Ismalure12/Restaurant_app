'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, parseApiError } from '@/lib/apiError';
import { RowsSkeleton } from '@/components/admin/Skeletons';
import OrderDetailView from '@/components/admin/orders/OrderDetailView';
import OnlinePaymentsPanel from '@/components/admin/orders/OnlinePaymentsPanel';
import useOrderCounts from '@/hooks/useOrderCounts';
import { STATUS, ago, cap, initials, isUnpaid, money, payPill, whoOf } from '@/components/admin/orders/orderUi';

const SOURCES = [['all', 'All'], ['online', 'Online'], ['pos', 'Counter']];
const PAYS = [['all', 'Any'], ['paid', 'Paid'], ['unpaid', 'Unpaid']];

function OrdersPage() {
  const qc = useQueryClient();
  const [fSrc, setFSrc] = useState('all');
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // ?tab=payments: online payments that have no order yet (stuck / not paid / needs attention).
  const tab = params.get('tab') === 'payments' ? 'payments' : 'orders';
  const setTab = (t) => router.replace(t === 'payments' ? `${pathname}?tab=payments` : pathname, { scroll: false });
  const { stuckPayments } = useOrderCounts();
  // ?pay=unpaid opens straight on the unpaid orders (Overview links here).
  const initialPay = params.get('pay');
  const [fPay, setFPay] = useState(PAYS.some(([v]) => v === initialPay) ? initialPay : 'all');
  const [search, setSearch] = useState('');
  const [selId, setSelId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: orders = [], isLoading, isError, error } = useQuery({ queryKey: ['orders-all'], queryFn: () => fetchJson('/api/admin/orders'), refetchInterval: 30_000 }); // live via SSE; the poll is the fallback

  const replaceOrder = (updated) => {
    qc.setQueryData(['orders-all'], (list) => (Array.isArray(list) ? list.map((x) => (x.id === updated.id ? updated : x)) : list));
    qc.setQueryData(['order', String(updated.id)], updated);
    qc.invalidateQueries({ queryKey: ['customers'] });
  };

  const bySource = useMemo(() => orders.filter((o) => fSrc === 'all' || o.source === fSrc), [orders, fSrc]);
  const counts = useMemo(() => ({
    src: Object.fromEntries(SOURCES.map(([v]) => [v, v === 'all' ? orders.length : orders.filter((o) => o.source === v).length])),
    pay: { all: bySource.length, paid: bySource.filter((o) => o.paymentStatus === 'paid').length, unpaid: bySource.filter(isUnpaid).length },
  }), [orders, bySource]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = bySource.filter((o) => {
      if (fPay === 'paid' && o.paymentStatus !== 'paid') return false;
      if (fPay === 'unpaid' && !isUnpaid(o)) return false;
      if (!q) return true;
      return whoOf(o).toLowerCase().includes(q) || String(o.id).includes(q) || (o.code || '').toLowerCase().includes(q)
        || (o.receiptNo || '').includes(q) || (o.contactPhone || '').includes(q);
    });
    return [
      { key: 'pending', title: 'Needs action', items: filtered.filter((o) => o.status === 'pending') },
      { key: 'unpaid', title: 'Unpaid — pay at the counter', items: filtered.filter((o) => o.status === 'open') },
      { key: 'done', title: 'Completed today', items: filtered.filter((o) => o.status === 'confirmed') },
      { key: 'closed', title: 'Declined & voided today', items: filtered.filter((o) => o.status === 'declined' || o.status === 'voided') },
    ].filter((g) => g.items.length);
  }, [bySource, fPay, search]);

  const sel = orders.find((o) => o.id === selId);
  const selectOrder = (id) => { setSelId(id); setDetailOpen(true); };

  const tabBar = (
    <div className="seg seg-full" role="tablist" aria-label="Orders or online payments">
      <button role="tab" aria-selected={tab === 'orders'} className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>Orders</button>
      <button role="tab" aria-selected={tab === 'payments'} className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>
        Online payments{stuckPayments > 0 && <span className="nl-badge amber" aria-label={`${stuckPayments} need a look`}>{stuckPayments}</span>}
      </button>
    </div>
  );

  if (tab === 'payments') {
    return (
      <OnlinePaymentsPanel
        tabs={tabBar}
        // Sifalo confirmed a payment from here: jump to its new order.
        onOrderCreated={(id) => { setTab('orders'); if (id) selectOrder(id); }}
      />
    );
  }

  return (
    <div className={`ord${detailOpen ? ' detail-open' : ''}`}>
      <section className="ord-list">
        <div className="ol-top">
          {tabBar}
          <div className="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, order ID, receipt #, phone" aria-label="Search orders" /></div>
          <div className="ol-filters" role="group" aria-label="Channel">
            {SOURCES.map(([v, l]) => (
              <button key={v} className={fSrc === v ? 'on' : ''} onClick={() => setFSrc(v)} aria-pressed={fSrc === v}><span className="n">{counts.src[v]}</span><span>{l}</span></button>
            ))}
          </div>
          <div className="ol-filters ol-pay" role="group" aria-label="Payment">
            {PAYS.map(([v, l]) => (
              <button key={v} className={`${fPay === v ? 'on' : ''}${v === 'unpaid' && counts.pay.unpaid ? ' warn' : ''}`} onClick={() => setFPay(v)} aria-pressed={fPay === v}><span className="n">{counts.pay[v]}</span><span>{l}</span></button>
            ))}
          </div>
        </div>
        <div className="ol-scroll">
          {isLoading ? (
            <div style={{ padding: 16 }}><RowsSkeleton rows={6} height={52} /></div>
          ) : isError ? (
            <div className="ol-empty">Couldn&rsquo;t load orders. {parseApiError(error)}</div>
          ) : groups.length === 0 ? (
            <div className="ol-empty">{orders.length ? 'No matching orders today' : 'Nothing waiting and no orders today yet'}</div>
          ) : groups.map((g) => (
            <div key={g.key}>
              <div className="ol-group-h">{g.title}<span className="cnt">{g.items.length}</span></div>
              {g.items.map((o) => {
                const st = STATUS[o.status] || STATUS.confirmed;
                const pay = payPill(o);
                const icStyle = o.source === 'online' ? { background: 'var(--sky-soft)', color: 'var(--sky)' } : { background: 'var(--primary-soft)', color: 'var(--primary)' };
                return (
                  <button type="button" key={o.id} className={`oli${o.id === selId ? ' sel' : ''}${o.status === 'voided' ? ' voided' : ''}`} onClick={() => selectOrder(o.id)} style={{ width: '100%', textAlign: 'left' }}>
                    <div className="oli-ic" style={icStyle}>{initials(whoOf(o))}</div>
                    <div className="oli-main">
                      <div className="oli-top"><span className="blip" style={{ background: st.color }} /><span className="oli-who">{whoOf(o)}</span></div>
                      <div className="oli-sub">{o.code || `#${o.id}`} · {cap(o.orderType)}{o.editedAt ? ' · edited' : ''}</div>
                    </div>
                    <div className="oli-r">
                      <div className="oli-amt">{money(o.total)}</div>
                      <span className={`pill pill-xs ${pay.cls}`}>{pay.label}</span>
                      <div className="oli-time">{ago(o.createdAt)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
          {!isLoading && !isError && (
            <Link className="ol-more" href="/admin/dashboard/sales">Older orders are in Sales history →</Link>
          )}
        </div>
      </section>

      <section className="ord-detail">
        {!sel ? (
          <div className="od-empty">
            <div>
              <div className="empty-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /><path d="M9 12h6M9 16h4" /></svg></div>
              <div className="empty-title">Select an order</div>
              <div className="empty-sub">Pick a ticket on the left to see details, take payment or print.</div>
            </div>
          </div>
        ) : (
          <div className="od-scroll">
            <OrderDetailView key={sel.id} order={sel} embedded onUpdated={replaceOrder} onBack={() => setDetailOpen(false)} />
          </div>
        )}
      </section>
    </div>
  );
}

export default function OrdersRoute() {
  return <Suspense fallback={<RowsSkeleton rows={6} />}><OrdersPage /></Suspense>;
}
