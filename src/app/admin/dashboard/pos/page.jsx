'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchJson, parseApiError } from '@/lib/apiError';
import ReceiptDoc from '@/components/admin/ReceiptDoc';

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const uid = () => Math.random().toString(36).slice(2, 10);

function PCardImg({ src }) {
  const [ok, setOk] = useState(Boolean(src));
  if (ok) return <img src={src} alt="" loading="lazy" onError={() => setOk(false)} />;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z" /><path d="M6 1v3M10 1v3M14 1v3" /></svg>;
}

export default function PosPage() {
  const [cashier, setCashier] = useState('');
  const [me, setMe] = useState(null);
  const [activeCat, setActiveCat] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);

  const [service, setService] = useState('dine_in');
  const [tableNumber, setTableNumber] = useState('');
  const [waiterId, setWaiterId] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('');
  const [discount, setDiscount] = useState({ type: 'percent', value: '' });
  const deliveryOn = service === 'delivery';

  const [customizing, setCustomizing] = useState(null);
  const [selOptions, setSelOptions] = useState({});
  const [selExtras, setSelExtras] = useState({});
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');

  const [placed, setPlaced] = useState(null);
  const [placing, setPlacing] = useState(false);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.json()).then((d) => { setMe(d); setCashier(d.name || d.email || ''); }).catch(() => {});
  }, []);

  const { data: categories = [] } = useQuery({ queryKey: ['pos-categories'], queryFn: () => fetchJson('/api/categories') });
  const { data: items = [], isLoading } = useQuery({ queryKey: ['pos-items'], queryFn: () => fetchJson('/api/menu-items') });
  const { data: waiters = [] } = useQuery({ queryKey: ['pos-waiters'], queryFn: () => fetchJson('/api/admin/waiters?active=1') });
  const { data: settings } = useQuery({ queryKey: ['pos-settings'], queryFn: () => fetchJson('/api/admin/settings') });

  const defaultFee = settings?.deliveryFee != null ? String(settings.deliveryFee) : '0';
  const selfWaiterId = me?.role === 'waiter' && me?.userId ? String(me.userId) : '';
  const effWaiterId = waiterId || selfWaiterId;
  const effFee = deliveryFee === '' ? defaultFee : deliveryFee;

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (activeCat !== 'all' && it.categoryId !== activeCat) return false;
      if (q && !it.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, activeCat, search]);

  const subtotal = useMemo(() => cart.reduce((s, l) => s + Number(l.unitPrice) * l.quantity, 0), [cart]);
  const discountAmount = useMemo(() => {
    const v = Number(discount.value);
    if (!v || v <= 0) return 0;
    const d = discount.type === 'percent' ? (subtotal * v) / 100 : v;
    return Math.min(Math.max(d, 0), subtotal);
  }, [discount, subtotal]);
  const delivery = deliveryOn ? Math.max(Number(effFee) || 0, 0) : 0;
  const total = Math.max(0, subtotal - discountAmount + delivery);
  const orderType = service;

  const openItem = (item) => {
    if (placed) return;
    const hasGroups = item.optionGroups?.length > 0;
    const hasExtras = item.extras?.length > 0;
    if (!hasGroups && !hasExtras) { addLine(item, [], [], 1, ''); return; }
    const defaults = {};
    item.optionGroups?.forEach((g) => { if (g.options?.length) defaults[g.id] = g.options[0].id; });
    setSelOptions(defaults); setSelExtras({}); setQty(1); setNotes(''); setCustomizing(item);
  };

  const addLine = (item, optionParts, extras, quantity, lineNotes) => {
    const unitPrice = Number(item.price)
      + optionParts.reduce((s, o) => s + Number(o.priceAdd), 0)
      + extras.reduce((s, e) => s + Number(e.priceAdd), 0);
    setCart((prev) => [...prev, {
      uid: uid(), itemId: item.id, name: item.name, imageUrl: item.imageUrl ?? null,
      optionName: optionParts.map((o) => o.name).join(' · ') || null,
      extras: extras.map((e) => ({ name: e.name, priceAdd: Number(e.priceAdd) })),
      notes: lineNotes || '', unitPrice, quantity,
    }]);
  };

  const confirmCustomize = () => {
    const optionParts = [];
    customizing.optionGroups?.forEach((g) => {
      const chosen = g.options?.find((o) => o.id === selOptions[g.id]);
      if (chosen) optionParts.push(chosen);
    });
    const extras = (customizing.extras || []).filter((e) => selExtras[e.id]);
    addLine(customizing, optionParts, extras, qty, notes);
    setCustomizing(null);
  };

  const unitPreview = useMemo(() => {
    if (!customizing) return 0;
    let p = Number(customizing.price);
    customizing.optionGroups?.forEach((g) => { const o = g.options?.find((x) => x.id === selOptions[g.id]); if (o) p += Number(o.priceAdd); });
    (customizing.extras || []).forEach((e) => { if (selExtras[e.id]) p += Number(e.priceAdd); });
    return p * qty;
  }, [customizing, selOptions, selExtras, qty]);

  const changeQty = (lineUid, delta) => setCart((prev) => prev.map((l) => l.uid === lineUid ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l).filter((l) => l.quantity > 0));
  const removeLine = (lineUid) => setCart((prev) => prev.filter((l) => l.uid !== lineUid));

  const resetOrder = () => {
    setCart([]); setService('dine_in'); setTableNumber(''); setWaiterId(''); setContactName(''); setContactPhone('');
    setAddress(''); setDeliveryFee(''); setDiscount({ type: 'percent', value: '' });
    setPlaced(null); setReceipt(null);
  };

  const placeOrder = async () => {
    if (cart.length === 0) return;
    if (deliveryOn && (!contactPhone.trim() || !address.trim())) { toast.error('Delivery needs a phone and address'); return; }
    setPlacing(true);
    try {
      const order = await fetchJson('/api/admin/pos/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(({ uid: _u, ...l }) => ({ uid: _u, ...l })),
          orderType,
          tableNumber: orderType === 'dine_in' ? tableNumber.trim() : null,
          waiterId: effWaiterId ? Number(effWaiterId) : null,
          discountType: Number(discount.value) > 0 ? discount.type : null,
          discountValue: Number(discount.value) > 0 ? Number(discount.value) : null,
          deliveryFee: deliveryOn ? Math.max(Number(effFee) || 0, 0) : null,
          contactName: deliveryOn ? contactName.trim() || null : null,
          contactPhone: deliveryOn ? contactPhone.trim() || null : null,
          address: deliveryOn ? address.trim() || null : null,
        }),
      });
      setReceipt({
        id: order.id, reference: order.reference, orderType,
        tableNumber: orderType === 'dine_in' ? tableNumber.trim() : null,
        items: cart, total: order.total, discount: order.discount, deliveryFee: order.deliveryFee,
        contactName: deliveryOn ? contactName.trim() : null,
        contactPhone: deliveryOn ? contactPhone.trim() : null,
        address: deliveryOn ? address.trim() : null,
        waiterName: effWaiterId ? (waiters.find((w) => String(w.id) === String(effWaiterId))?.name ?? null) : null,
        cashierName: cashier, createdAt: new Date().toISOString(),
      });
      setPlaced(order);
      toast.success(`Order #${order.id} placed`);
      setTimeout(() => window.print(), 150);
    } catch (err) {
      toast.error(parseApiError(err));
    } finally { setPlacing(false); }
  };

  const activeCats = categories.filter((c) => c.isActive);

  return (
    <div className="pos">
      {/* LEFT — menu */}
      <section className="pos-menu">
        <div className="pos-menu-top">
          <div className="search" style={{ width: '100%' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the menu…" />
          </div>
          <div className="pos-cats">
            <button className={`pos-cat${activeCat === 'all' ? ' on' : ''}`} onClick={() => setActiveCat('all')}>All</button>
            {activeCats.map((c) => <button key={c.id} className={`pos-cat${activeCat === c.id ? ' on' : ''}`} onClick={() => setActiveCat(c.id)}>{c.name}</button>)}
          </div>
        </div>
        <div className="pos-grid">
          {isLoading
            ? [1, 2, 3, 4, 5, 6].map((n) => <div key={n} className="sk" style={{ height: 180, borderRadius: 'var(--r-md)' }} />)
            : visibleItems.length === 0
              ? <div className="sub" style={{ padding: 30 }}>No items found.</div>
              : visibleItems.map((item) => {
                const hasChoices = item.optionGroups?.length > 0 || item.extras?.length > 0;
                return (
                  <button key={item.id} className={`pcard${item.isActive === false ? ' off' : ''}`} onClick={() => openItem(item)} title={`Add ${item.name}`}>
                    <div className="pcard-img"><PCardImg src={item.imageUrl} />{hasChoices && <span className="pcard-tag">Options</span>}</div>
                    <div className="pcard-b">
                      <div className="pcard-nm">{item.name}</div>
                      <div className="pcard-row"><span className="pcard-pr">{money(item.price)}</span><span className="pcard-add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" /></svg></span></div>
                    </div>
                  </button>
                );
              })}
        </div>
      </section>

      {/* RIGHT — ticket */}
      <aside className="pos-ticket">
        {!placed && (
          <div className="ticket-top">
            <div className="ticket-svc">
              <button className={service === 'dine_in' ? 'on' : ''} onClick={() => setService('dine_in')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 2v7c0 1.1.9 2 2 2a2 2 0 0 0 2-2V2M5 2v20M11 2v20M11 8a4 4 0 0 0 4 4V2" /></svg>Dine-in
              </button>
              <button className={service === 'delivery' ? 'on' : ''} onClick={() => setService('delivery')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 18V6a2 2 0 0 0-2-2H3v12M14 9h4l3 3v6M3 18h11" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></svg>Delivery
              </button>
            </div>
            <div className="ticket-meta">
              {!deliveryOn ? (
                <>
                  <input className="input" value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} placeholder="Table no. (optional)" />
                  {waiters.length > 0 && (
                    <select className="input" value={effWaiterId} onChange={(e) => setWaiterId(e.target.value)}>
                      <option value="">Waiter (optional)</option>
                      {waiters.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  )}
                </>
              ) : (
                <>
                  <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Customer name (optional)" />
                  <input className="input" type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="Phone — required" />
                  <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Delivery address" />
                  <div className="fee-field"><span className="fee-lbl">Delivery fee</span><input className="input" type="number" min="0" step="0.5" value={effFee} onChange={(e) => setDeliveryFee(e.target.value)} /><span className="fee-hint sub" style={{ fontSize: 10.5 }}>from settings</span></div>
                </>
              )}
            </div>
          </div>
        )}

        {cart.length === 0 && !placed ? (
          <div className="ticket-lines">
            <div className="ticket-empty">
              <div className="er"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="26" height="26"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></svg></div>
              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Ticket is empty</div>
              <div className="empty-sub" style={{ marginTop: 3 }}>Tap a menu item to start the order.</div>
            </div>
          </div>
        ) : placed ? (
          <div className="pos-placed">
            <div className="pos-placed-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ width: 26, height: 26 }}><path d="M20 6 9 17l-5-5" /></svg></div>
            <div className="h-2">Order #{placed.id} placed</div>
            <div className="sub" style={{ marginBottom: 16 }}>Receipt sent to the printer.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => window.print()}>Reprint</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={resetOrder}>New order</button>
            </div>
          </div>
        ) : (
          <div className="ticket-lines">
            {cart.map((l) => (
              <div className="tline" key={l.uid}>
                <span className="tline-q">{l.quantity}×</span>
                <div className="tline-main">
                  <div className="tline-nm">{l.name}</div>
                  {(l.optionName || l.extras.length > 0 || l.notes) && (
                    <div className="tline-opt">{[l.optionName, l.extras.map((e) => e.name).join(', '), l.notes && `“${l.notes}”`].filter(Boolean).join(' · ')}</div>
                  )}
                </div>
                <div className="tline-r">
                  <span className="tline-pr">{money(l.unitPrice * l.quantity)}</span>
                  <span className="tline-steps">
                    <button onClick={() => changeQty(l.uid, -1)}>−</button>
                    <span>{l.quantity}</span>
                    <button onClick={() => changeQty(l.uid, 1)}>+</button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {cart.length > 0 && !placed && (
          <div className="ticket-foot">
            <div className="disc-row">
              <input className="input" type="number" min="0" value={discount.value} onChange={(e) => setDiscount((d) => ({ ...d, value: e.target.value }))} placeholder="Discount" style={{ height: 34, fontSize: '12.5px' }} />
              <div className="seg" style={{ flexShrink: 0 }}>
                <button className={discount.type === 'percent' ? 'active' : ''} onClick={() => setDiscount((d) => ({ ...d, type: 'percent' }))}>%</button>
                <button className={discount.type === 'fixed' ? 'active' : ''} onClick={() => setDiscount((d) => ({ ...d, type: 'fixed' }))}>$</button>
              </div>
            </div>
            <div className="tf-row"><span>Subtotal</span><span className="v">{money(subtotal)}</span></div>
            {discountAmount > 0 && <div className="tf-row"><span>Discount</span><span className="v" style={{ color: 'var(--rose)' }}>−{money(discountAmount)}</span></div>}
            {delivery > 0 && <div className="tf-row"><span>Delivery fee</span><span className="v">{money(delivery)}</span></div>}
            <div className="tf-row total"><span>Total</span><span className="v">{money(total)}</span></div>
            <button className="btn btn-primary" style={{ width: '100%', height: 46, fontSize: 14, marginTop: 12 }} disabled={placing} onClick={placeOrder}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14M13 6l6 6-6 6" /></svg>{placing ? 'Placing…' : 'Place order & print'}
            </button>
          </div>
        )}
      </aside>

      {/* Customize modal */}
      {customizing && (
        <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget) setCustomizing(null); }}>
          <div className="modal">
            <div className="modal-h">
              <div className="mt"><div className="eyebrow">{activeCats.find((c) => c.id === customizing.categoryId)?.name || 'Item'}</div><div className="h-1" style={{ marginTop: 3 }}>{customizing.name}</div></div>
              <button className="icon-btn" onClick={() => setCustomizing(null)} aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
            <div className="modal-b">
              {customizing.optionGroups?.map((g) => (
                <div className="ff" key={g.id}>
                  <label>{g.title} · pick one</label>
                  <div className="opt-group">
                    {g.options?.map((o) => (
                      <div key={o.id} className={`opt-line radio${selOptions[g.id] === o.id ? ' on' : ''}`} onClick={() => setSelOptions((p) => ({ ...p, [g.id]: o.id }))}>
                        <span className="ck"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5" /></svg></span>
                        <span className="opt-nm">{o.name}</span>{Number(o.priceAdd) > 0 && <span className="opt-pr">+{money(o.priceAdd)}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {customizing.extras?.length > 0 && (
                <div className="ff">
                  <label>Extras · optional</label>
                  <div className="opt-group">
                    {customizing.extras.map((e) => (
                      <div key={e.id} className={`opt-line${selExtras[e.id] ? ' on' : ''}`} onClick={() => setSelExtras((p) => ({ ...p, [e.id]: !p[e.id] }))}>
                        <span className="ck"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 6 9 17l-5-5" /></svg></span>
                        <span className="opt-nm">{e.name}</span>{Number(e.priceAdd) > 0 && <span className="opt-pr">+{money(e.priceAdd)}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="ff"><label>Notes</label><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. no onions, extra crispy" /></div>
              <div className="ff"><label>Quantity</label><div className="qty-big"><button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button><span>{qty}</span><button type="button" onClick={() => setQty((q) => q + 1)}>+</button></div></div>
            </div>
            <div className="modal-f">
              <button className="btn btn-ghost" onClick={() => setCustomizing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmCustomize}>Add · {money(unitPreview)}</button>
            </div>
          </div>
        </div>
      )}

      <ReceiptDoc order={receipt} />
    </div>
  );
}
