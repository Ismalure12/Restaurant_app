'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchJson, parseApiError } from '@/lib/apiError';

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const cap = (t) => ({ dine_in: 'Dine-in', delivery: 'Delivery' }[t] || t);
const initials = (s) => (s || '').replace(/[^a-zA-Z0-9 ]/g, '').split(' ').map((x) => x[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '#';
function ago(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const STATUS = {
  pending: { label: 'Awaiting', cls: 'pill-amber', color: 'var(--amber)', group: 'pending' },
  confirmed: { label: 'Confirmed', cls: 'pill-green', color: 'var(--primary)', group: 'done' },
  declined: { label: 'Declined', cls: 'pill-rose', color: 'var(--rose)', group: 'done' },
};
const whoOf = (o) => o.contactName || o.customer?.name || (o.orderType === 'delivery' ? 'Delivery' : (o.tableNumber ? `Table ${o.tableNumber}` : 'Walk-in'));

export default function OrdersPage() {
  const qc = useQueryClient();
  const [fSrc, setFSrc] = useState('all');
  const [search, setSearch] = useState('');
  const [selId, setSelId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: orders = [] } = useQuery({ queryKey: ['orders-all'], queryFn: () => fetchJson('/api/admin/orders'), refetchInterval: 8000 });

  const act = useMutation({
    mutationFn: ({ id, kind }) => fetchJson(`/api/admin/orders/${id}/${kind}`, { method: 'POST' }),
    onSuccess: (_d, v) => { toast.success(v.kind === 'accept' ? 'Accepted — payment captured' : 'Declined — hold released'); qc.invalidateQueries({ queryKey: ['orders-all'] }); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  const pass = (o) => {
    if (fSrc !== 'all' && o.source !== fSrc) return false;
    if (search) { const q = search.toLowerCase(); if (!(whoOf(o).toLowerCase().includes(q) || String(o.id).includes(q) || (o.contactPhone || '').includes(q))) return false; }
    return true;
  };
  const filtered = useMemo(() => orders.filter(pass), [orders, fSrc, search]);
  const counts = { all: orders.length, online: orders.filter((o) => o.source === 'online').length, counter: orders.filter((o) => o.source === 'pos').length };

  const groups = [
    { key: 'pending', title: 'Needs action', items: filtered.filter((o) => o.status === 'pending') },
    { key: 'done', title: 'Completed', items: filtered.filter((o) => o.status !== 'pending') },
  ].filter((g) => g.items.length);

  const sel = orders.find((o) => o.id === selId);
  const selectOrder = (id) => { setSelId(id); setDetailOpen(true); };

  return (
    <div className={`ord${detailOpen ? ' detail-open' : ''}`}>
      {/* LIST */}
      <section className="ord-list">
        <div className="ol-top">
          <div className="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, ref, phone…" /></div>
          <div className="ol-filters">
            {[['all', 'All'], ['online', 'Online'], ['pos', 'Counter']].map(([v, l]) => (
              <button key={v} className={fSrc === v ? 'on' : ''} onClick={() => setFSrc(v)}><span className="n">{counts[v === 'pos' ? 'counter' : v]}</span><span>{l}</span></button>
            ))}
          </div>
        </div>
        <div className="ol-scroll">
          {groups.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No matching orders</div>}
          {groups.map((g) => (
            <div key={g.key}>
              <div className="ol-group-h">{g.title}<span className="cnt">{g.items.length}</span></div>
              {g.items.map((o) => {
                const st = STATUS[o.status] || STATUS.confirmed;
                const chan = o.source === 'online' ? 'Online' : 'Counter';
                const icStyle = o.source === 'online' ? { background: 'var(--sky-soft)', color: 'var(--sky)' } : { background: 'var(--primary-soft)', color: 'var(--primary)' };
                return (
                  <div key={o.id} className={`oli${o.id === selId ? ' sel' : ''}`} onClick={() => selectOrder(o.id)}>
                    <div className="oli-ic" style={icStyle}>{initials(whoOf(o))}</div>
                    <div className="oli-main">
                      <div className="oli-top"><span className="blip" style={{ background: st.color }} /><span className="oli-who">{whoOf(o)}</span></div>
                      <div className="oli-sub">{chan} · {cap(o.orderType)} · #{o.id}</div>
                    </div>
                    <div className="oli-r"><div className="oli-amt">{money(o.total)}</div><div className="oli-time">{ago(o.createdAt)}</div></div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      {/* DETAIL */}
      <section className="ord-detail">
        {!sel ? (
          <div className="od-empty">
            <div>
              <div className="empty-ring" style={{ margin: '0 auto 14px' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /><path d="M9 12h6M9 16h4" /></svg></div>
              <div className="empty-title">Select an order</div>
              <div className="empty-sub">Pick a ticket on the left to see details and take action.</div>
            </div>
          </div>
        ) : (
          <OrderDetail o={sel} onBack={() => setDetailOpen(false)} onAct={(kind) => act.mutate({ id: sel.id, kind })} busy={act.isPending} />
        )}
      </section>
    </div>
  );
}

function Timeline({ status }) {
  if (status === 'declined') {
    return (
      <div className="od-timeline">
        <div className="tlstep done"><div className="dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5" /></svg></div><span className="lb">Received</span></div>
        <div className="tlconn" />
        <div className="tlstep"><div className="dot" style={{ borderColor: 'var(--rose)', color: 'var(--rose)' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></div><span className="lb" style={{ color: 'var(--rose)', fontWeight: 600 }}>Declined</span></div>
      </div>
    );
  }
  const done = status === 'confirmed';
  return (
    <div className="od-timeline">
      <div className="tlstep done"><div className="dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5" /></svg></div><span className="lb">Received</span></div>
      <div className={`tlconn${done ? ' done' : ''}`} />
      <div className={`tlstep ${done ? 'done' : 'cur'}`}><div className="dot">{done ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5" /></svg> : 2}</div><span className="lb">{status === 'confirmed' ? 'Confirmed' : 'Captured'}</span></div>
    </div>
  );
}

function OrderDetail({ o, onBack, onAct, busy }) {
  const st = STATUS[o.status] || STATUS.confirmed;
  const items = Array.isArray(o.items) ? o.items : [];
  const sub = items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
  const disc = Number(o.discount || 0); const fee = Number(o.deliveryFee || 0);
  const chanPill = o.source === 'online' ? <span className="pill pill-sky">Online order</span> : <span className="pill pill-green">Counter order</span>;
  return (
    <>
      <div className="od-scroll">
        <button className="btn btn-ghost btn-sm od-back" onClick={onBack} style={{ marginBottom: 14 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>All orders</button>
        <div className="od-head">
          <div style={{ flex: 1 }}>
            <div className="od-ref">#{o.id} · {o.reference}</div>
            <div className="od-who">{whoOf(o)}</div>
            <div className="od-tags">{chanPill}<span className="pill pill-ghost">{cap(o.orderType)}</span><span className={`pill ${st.cls}`}><span className="pdot" />{st.label}</span></div>
          </div>
          <div style={{ textAlign: 'right' }}><div className="od-ref">Total</div><div style={{ fontFamily: 'var(--font-mono)', fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em' }}>{money(o.total)}</div></div>
        </div>

        <Timeline status={o.status} />

        <div className="od-cards">
          {o.orderType === 'delivery' ? (
            <>
              <div className="od-card"><div className="l">Phone</div><div className="v mono">{o.contactPhone || '—'}</div></div>
              <div className="od-card"><div className="l">Address</div><div className="v" style={{ fontSize: 13 }}>{o.address || '—'}</div></div>
            </>
          ) : (
            <>
              <div className="od-card"><div className="l">{o.tableNumber ? 'Table' : 'Order'}</div><div className="v">{o.tableNumber ? o.tableNumber : whoOf(o)}</div></div>
              <div className="od-card"><div className="l">Served by</div><div className="v">{o.waiter || o.staff || '—'}</div></div>
            </>
          )}
          <div className="od-card"><div className="l">Channel</div><div className="v">{o.source === 'online' ? 'Online app' : 'Counter / POS'}</div></div>
          <div className="od-card"><div className="l">Placed</div><div className="v">{ago(o.createdAt)}</div></div>
        </div>

        <div className="od-items">
          <div className="od-items-h">Items · {items.reduce((s, i) => s + i.quantity, 0)}</div>
          {items.map((i, idx) => (
            <div className="odl" key={i.uid || idx}>
              <span className="odl-q">{i.quantity}×</span>
              <div><div className="odl-nm">{i.name}</div>{(i.optionName || (i.extras && i.extras.length) || i.notes) && <div className="odl-opt">{[i.optionName, i.extras?.map((e) => e.name).join(', '), i.notes && `“${i.notes}”`].filter(Boolean).join(' · ')}</div>}</div>
              <span className="odl-pr">{money(Number(i.unitPrice) * i.quantity)}</span>
            </div>
          ))}
          <div className="od-tot">
            <div className="r"><span>Subtotal</span><span className="mono">{money(sub)}</span></div>
            {disc > 0 && <div className="r"><span>Discount</span><span className="mono">−{money(disc)}</span></div>}
            {fee > 0 && <div className="r"><span>Delivery fee</span><span className="mono">{money(fee)}</span></div>}
            <div className="r t"><span>Total</span><span className="mono">{money(o.total)}</span></div>
          </div>
        </div>
      </div>

      <div className="od-actions">
        {o.status === 'pending' ? (
          <>
            <button className="btn btn-danger" disabled={busy} onClick={() => onAct('decline')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg>Decline &amp; release hold</button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" disabled={busy} onClick={() => onAct('accept')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5" /></svg>Accept &amp; capture</button>
          </>
        ) : o.status === 'confirmed' ? (
          <>
            <span style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M20 6 9 17l-5-5" /></svg>Completed &amp; paid</span>
            <div style={{ flex: 1 }} />
            <button className="btn btn-ghost" onClick={() => window.print()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>Reprint receipt</button>
          </>
        ) : (
          <span style={{ color: 'var(--rose)', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M18 6 6 18M6 6l12 12" /></svg>Declined · pre-auth hold released</span>
        )}
      </div>
    </>
  );
}
