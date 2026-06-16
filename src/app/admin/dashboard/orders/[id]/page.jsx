'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ReceiptDoc from '@/components/admin/ReceiptDoc';

/* ─── Helpers ─────────────────────────────────────────── */
function fmtTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { weekday:'short', day:'numeric', month:'short', year:'numeric' });
}

/* ─── Status config ───────────────────────────────────── */
const STATUS = {
  pending:   { label:'Awaiting review', pillBg:'var(--amber-soft)', pillColor:'var(--amber)',     dotBg:'var(--amber)'     },
  confirmed: { label:'Confirmed',       pillBg:'var(--green-soft)', pillColor:'var(--green-deep)', dotBg:'var(--green)'    },
  declined:  { label:'Declined',        pillBg:'var(--rose-soft)',  pillColor:'var(--rose)',        dotBg:'var(--rose)'     },
};

/* ─── Spinner ─────────────────────────────────────────── */
function Spinner({ color = 'currentColor' }) {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2.4" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/* ─── Page ─────────────────────────────────────────────── */
export default function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/orders/${id}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        if (!cancelled) setOrder(data);
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const act = useCallback(async (kind) => {
    setBusy(kind); setActionError('');
    try {
      const res = await fetch(`/api/admin/orders/${id}/${kind}`, { method:'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) { setActionError(data.error || `Failed to ${kind}`); setBusy(null); return; }
      setOrder(prev => ({ ...prev, ...data.order }));
    } catch (err) { setActionError(err.message); }
    finally { setBusy(null); }
  }, [id]);

  if (loading) return <LoadingState />;
  if (loadError) return <ErrorState message={loadError} />;
  if (!order) return null;

  const items = Array.isArray(order.items) ? order.items : [];
  const itemCount = items.reduce((s, i) => s + (i.quantity || 1), 0);
  const dine = order.orderType === 'dine_in';
  const status = order.status || 'pending';
  const cfg = STATUS[status] ?? STATUS.pending;
  const total = parseFloat(order.total || '0');

  // Bill computations
  const itemsSubtotal = items.reduce((s, i) => s + (i.unitPrice ?? i.price ?? 0) * i.quantity, 0);
  const discount = Number(order.discount || 0);
  const deliveryFee = Number(order.deliveryFee || 0);
  const isPos = order.source === 'pos';

  // Background image from first item with an imageUrl
  const heroBg = items.find(i => i.imageUrl)?.imageUrl;

  return (
    <div style={{ maxWidth: 1200, paddingBottom: 80 }}>
      {/* Breadcrumb */}
      <nav className="adm-crumb">
        <Link href="/admin/dashboard/orders">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          All orders
        </Link>
        <span className="sep">/</span>
        <span style={{ textTransform:'capitalize' }}>{status}</span>
        <span className="sep">/</span>
        <span className="adm-crumb-ref">{order.reference}</span>
      </nav>

      {/* Detail grid: left + rail */}
      <div className="adm-detail-grid">

        {/* ── Left column ──────────────────────────────────── */}
        <div>
          {/* Hero */}
          <div
            className="adm-detail-hero"
            style={heroBg ? { '--hero-bg': `url('${heroBg}')` } : {}}
          >
            {heroBg && (
              <style>{`.adm-detail-hero::before { background-image: var(--hero-bg); }`}</style>
            )}

            {/* Top row */}
            <div className="adm-dh-top">
              <span
                className="adm-pill"
                style={{ background:'rgba(255,255,255,.14)', color:'#fff', backdropFilter:'blur(8px)' }}
              >
                <span className="dot" style={{ background:'var(--green-mint)' }} />
                {dine ? `Table ${order.tableNumber ?? '—'}` : 'Delivery'}
              </span>
              <span
                className="adm-pill"
                style={{ background: cfg.pillBg, color: cfg.pillColor }}
              >
                <span className="dot" style={{ background: cfg.dotBg }} />
                {cfg.label}
              </span>
              <span className="adm-dh-ref">REF · <b>{order.reference}</b></span>
              <button
                className="adm-btn-icon"
                title="Print receipt"
                style={{ background:'rgba(255,255,255,.14)', borderColor:'transparent', color:'#fff', marginLeft:4 }}
                onClick={() => window.print()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" style={{ width:15, height:15 }}>
                  <polyline points="6 9 6 2 18 2 18 9"/>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg>
              </button>
            </div>

            {/* Main: name + total */}
            <div className="adm-dh-main">
              <div>
                <h1 className="adm-dh-nm">{order.customer?.name ?? order.contactName ?? (isPos ? 'Walk-in' : '—')}</h1>
                <div className="adm-dh-who">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  <a href={`tel:${order.customer?.phone ?? order.contactPhone ?? ''}`}>{order.customer?.phone ?? order.contactPhone ?? '—'}</a>
                  <span className="sep" />
                  <span>Placed {fmtTime(order.createdAt)}</span>
                </div>
              </div>
              <div className="adm-dh-total">
                <span className="k">Order total</span>
                <span className="v"><small>$</small>{total.toFixed(2)}</span>
              </div>
            </div>

            {/* Hero meta */}
            <div className="adm-hero-meta">
              <div className="cell">
                <div className="k">Service</div>
                <div className="v">{dine ? `Dine-in · Table ${order.tableNumber ?? '—'}` : 'Delivery'}</div>
              </div>
              <div className="cell">
                <div className="k">Items</div>
                <div className="v">{items.length} items · {itemCount} units</div>
              </div>
              <div className="cell">
                <div className="k">Placed</div>
                <div className="v">{fmtDate(order.createdAt)} · {fmtTime(order.createdAt)}</div>
              </div>
              <div className="cell">
                <div className="k">Waafi txn</div>
                <div className="v" style={{ fontFamily:'var(--font-inter),Inter,sans-serif' }}>
                  {order.paymentTransactionId || '—'}
                </div>
              </div>
              {!dine && order.address && (
                <div className="cell">
                  <div className="k">Address</div>
                  <div className="v">{order.address}</div>
                </div>
              )}
            </div>
          </div>

          {/* Items card */}
          <div className="adm-items-card">
            <div className="adm-ic-ti">
              <h3>The order</h3>
              <div className="ct"><b>{items.length}</b> item{items.length !== 1 ? 's' : ''} · {itemCount} units</div>
            </div>

            {items.length === 0 ? (
              <div style={{ padding:'28px 22px', textAlign:'center', color:'var(--muted)', fontSize:13 }}>
                No items recorded.
              </div>
            ) : items.map((item, i) => {
              const opt = item.optionName ?? item.variant;
              const extras = item.extras || [];
              const unitPrice = item.unitPrice ?? item.price ?? 0;
              const lineTotal = unitPrice * item.quantity;
              const basePrice = unitPrice - extras.reduce((s, e) => s + (e.priceAdd || 0), 0);
              const extrasSum = extras.reduce((s, e) => s + (e.priceAdd || 0), 0);
              const breakdown = extrasSum > 0
                ? `${item.quantity} × $${basePrice.toFixed(2)} + $${(extrasSum * item.quantity).toFixed(2)}`
                : `${item.quantity} × $${unitPrice.toFixed(2)}`;
              return (
                <div key={i} className="adm-line-item">
                  {/* Image + qty badge */}
                  <div className="adm-li-pic-wrap">
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt={item.name} className="adm-li-pic" />
                      : <div className="adm-li-pic" />}
                    <div className="adm-li-qty-badge">{item.quantity}</div>
                  </div>

                  {/* Info */}
                  <div className="adm-li-info">
                    <div className="adm-li-nm">
                      <h4>{item.name}</h4>
                      <span className="each">${unitPrice.toFixed(2)} each</span>
                    </div>

                    {/* Option + extras */}
                    {(opt || extras.length > 0) && (
                      <div className="adm-li-row">
                        {opt && (
                          <span className="adm-opt-chip">
                            <span className="lbl">Option</span>
                            {opt}
                          </span>
                        )}
                        {extras.map((e, ei) => (
                          <span key={ei} className="adm-extra-chip">
                            {e.name}
                            {e.priceAdd ? <span className="add">${e.priceAdd.toFixed(2)}</span> : null}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Guest note */}
                    {item.notes && (
                      <div className="adm-li-notes">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        <p>{item.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Totals */}
                  <div className="adm-li-totals">
                    <span className="adm-li-ln"><small>$</small>{lineTotal.toFixed(2)}</span>
                    <span className="adm-li-bd">{breakdown}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action bar */}
          <div className="adm-order-action-bar">
            {status !== 'pending' ? (
              <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, fontWeight:600, color: status === 'confirmed' ? 'var(--green-deep)' : 'var(--rose)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {status === 'confirmed'
                    ? <polyline points="20 6 9 17 4 12"/>
                    : <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>}
                </svg>
                {status === 'confirmed'
                  ? 'Payment captured · order released to kitchen.'
                  : 'Hold released · funds returned to guest.'}
              </div>
            ) : (
              <>
                <div className="adm-oab-legend">
                  Decision pending <span className="ref">{order.reference}</span>
                </div>
                <div className="adm-oab-acts">
                  {actionError && (
                    <span style={{ fontSize:11.5, color:'var(--rose)', marginRight:4 }}>{actionError}</span>
                  )}
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => act('decline')}
                    className="adm-btn adm-btn-danger-ghost"
                  >
                    {busy === 'decline' ? <Spinner /> : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    )}
                    Decline order
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => act('accept')}
                    className="adm-btn adm-btn-success"
                  >
                    {busy === 'accept' ? <Spinner color="#fff" /> : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                    Accept &amp; capture
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Right rail ─────────────────────────────────────── */}
        <aside className="adm-rail">
          {/* Bill summary */}
          <div className="adm-rail-card">
            <h4>Bill summary</h4>
            <div>
              <div className="adm-bill-row">
                <span className="lbl">Items subtotal</span>
                <span className="val">${itemsSubtotal.toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className="adm-bill-row">
                  <span className="lbl">Discount</span>
                  <span className="val" style={{ color: 'var(--green-deep)' }}>−${discount.toFixed(2)}</span>
                </div>
              )}
              {deliveryFee > 0 && (
                <div className="adm-bill-row">
                  <span className="lbl">Delivery</span>
                  <span className="val">${deliveryFee.toFixed(2)}</span>
                </div>
              )}
              {discount === 0 && deliveryFee === 0 && (
                <div className="adm-bill-row">
                  <span className="lbl">Service</span>
                  <span className="val">Included</span>
                </div>
              )}
              <div className="adm-bill-row total">
                <span className="lbl">{isPos ? 'Total' : 'Total held'}</span>
                <span className="val"><small>$</small>{total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Guest & service */}
          <div className="adm-rail-card">
            <h4>Guest &amp; service</h4>
            <div className="adm-kv-list">
              <div className="adm-kv">
                <span className="k">Name</span>
                <span className="v">{order.customer?.name ?? order.contactName ?? (isPos ? 'Walk-in' : '—')}</span>
              </div>
              <div className="adm-kv">
                <span className="k">Phone</span>
                <span className="v mono">{order.customer?.phone ?? order.contactPhone ?? '—'}</span>
              </div>
              <div className="adm-kv">
                <span className="k">Service</span>
                <span className="v" style={{ textTransform: 'capitalize' }}>{(order.orderType || '').replace('_', '-') || (dine ? 'Dine-in' : 'Delivery')}</span>
              </div>
              {order.waiter && (
                <div className="adm-kv">
                  <span className="k">Waiter</span>
                  <span className="v">{order.waiter}</span>
                </div>
              )}
              {dine ? (
                <div className="adm-kv">
                  <span className="k">Table</span>
                  <span className="v" style={{ fontFamily:'var(--font-cormorant),serif', fontSize:18, fontWeight:600, color:'var(--blue)' }}>
                    {order.tableNumber ?? '—'}
                  </span>
                </div>
              ) : order.address ? (
                <div className="adm-kv">
                  <span className="k">Address</span>
                  <span className="v">{order.address}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Payment hold */}
          <div className="adm-rail-card">
            <h4>Payment hold</h4>
            <div className="adm-kv-list">
              <div className="adm-kv">
                <span className="k">Provider</span>
                <span className="v">Waafi</span>
              </div>
              {order.paymentTransactionId && (
                <div className="adm-kv">
                  <span className="k">Pre-auth</span>
                  <span className="v mono">{order.paymentTransactionId}</span>
                </div>
              )}
              <div className="adm-kv">
                <span className="k">Reference</span>
                <span className="v mono">{order.reference}</span>
              </div>
              <div className="adm-kv">
                <span className="k">Placed</span>
                <span className="v">{fmtDate(order.createdAt)} · {fmtTime(order.createdAt)}</span>
              </div>
              <div className="adm-kv">
                <span className="k">Status</span>
                <span className="v" style={{ color: cfg.pillColor }}>{cfg.label}</span>
              </div>
            </div>
          </div>

          {/* Activity */}
          <div className="adm-rail-card">
            <h4>Activity</h4>
            <div className="adm-kv-list">
              <div className="adm-kv">
                <span className="k" style={{ fontVariantNumeric:'tabular-nums' }}>{fmtTime(order.createdAt)}</span>
                <span className="v">Pre-authorization placed by guest</span>
              </div>
              <div className="adm-kv">
                <span className="k" style={{ fontVariantNumeric:'tabular-nums' }}>{fmtTime(order.createdAt)}</span>
                <span className="v">Notification sent to admin</span>
              </div>
              {status === 'pending' && (
                <div className="adm-kv">
                  <span className="k">— —</span>
                  <span className="v" style={{ color:'var(--muted)' }}>Awaiting your decision</span>
                </div>
              )}
              {status === 'confirmed' && (
                <div className="adm-kv">
                  <span className="k">—</span>
                  <span className="v" style={{ color:'var(--green-deep)' }}>Payment captured · order released to kitchen</span>
                </div>
              )}
              {status === 'declined' && (
                <div className="adm-kv">
                  <span className="k">—</span>
                  <span className="v" style={{ color:'var(--rose)' }}>Hold released · funds returned to guest</span>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <ReceiptDoc order={{
        id: order.id,
        reference: order.reference,
        orderType: order.orderType,
        tableNumber: order.tableNumber,
        items,
        total,
        discount,
        deliveryFee,
        contactName: order.contactName,
        contactPhone: order.contactPhone,
        address: order.address,
        waiterName: order.waiter,
        paymentMethod: order.paymentMethod,
        amountReceived: order.amountReceived,
        change: order.amountReceived != null ? Math.max(0, Number(order.amountReceived) - total) : 0,
        cashierName: order.staff || order.customer?.name,
        createdAt: order.createdAt,
      }} />
    </div>
  );
}

/* ─── Loading / error states ─────────────────────────── */
function LoadingState() {
  return (
    <div style={{ maxWidth: 1200 }}>
      <div className="adm-skeleton" style={{ height:32, width:280, borderRadius:99, marginBottom:20 }} />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:18 }}>
        <div>
          <div className="adm-skeleton" style={{ height:260, borderRadius:24, marginBottom:18 }} />
          <div className="adm-skeleton" style={{ height:320, borderRadius:20 }} />
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {[120,100,140,100].map((h,i) => (
            <div key={i} className="adm-skeleton" style={{ height:h, borderRadius:20 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div style={{ maxWidth: 1200 }}>
      <div className="adm-error-banner">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        {message}
      </div>
    </div>
  );
}
