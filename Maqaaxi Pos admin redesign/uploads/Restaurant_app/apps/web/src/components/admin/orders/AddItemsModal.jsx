'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { useFormValidation } from '@/lib/formValidation';
import { addItemsSchema } from '@/lib/schemas/sales';
import ItemCustomizer, { buildLine, needsChoices } from '@/components/admin/ItemCustomizer';
import { Ic, money } from './orderUi';

/**
 * Add items (drinks, dessert…) to an unpaid pay-later order. Picks from the
 * menu with the same option/extra picker as the Register; the server reprices
 * every line. onAdded({ order, addedLines }) — the caller prints the kitchen
 * ticket for just the new lines.
 */
export default function AddItemsModal({ order, onClose, onAdded }) {
  const { data: menu = [], isLoading } = useQuery({ queryKey: ['pos-items'], queryFn: () => fetchJson('/api/menu-items') });
  const { data: categories = [] } = useQuery({ queryKey: ['pos-categories'], queryFn: () => fetchJson('/api/categories') });
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [lines, setLines] = useState([]);
  const [customizing, setCustomizing] = useState(null);
  const [busy, setBusy] = useState(false);
  const form = useFormValidation(addItemsSchema, { lineCount: lines.length });

  const visible = useMemo(() => {
    const t = q.trim().toLowerCase();
    return menu.filter((m) => m.isActive !== false && (cat === 'all' || m.categoryId === cat) && (!t || m.name.toLowerCase().includes(t)));
  }, [menu, q, cat]);
  const cats = categories.filter((c) => c.isActive);
  const added = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

  const pick = (item) => (needsChoices(item) ? setCustomizing(item) : setLines((ls) => [...ls, buildLine(item)]));
  const step = (uid, d) => setLines((ls) => ls.map((l) => (l.uid === uid ? { ...l, quantity: Math.min(99, l.quantity + d) } : l)).filter((l) => l.quantity > 0));

  const send = async () => {
    if (!form.check() || busy) return;
    setBusy(true);
    try {
      const d = await fetchJson(`/api/admin/orders/${order.id}/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: lines }),
      });
      onAdded(d);
    } catch (err) {
      notify.error(err, { title: 'Could not add the items' });
    } finally { setBusy(false); }
  };

  if (customizing) {
    return (
      <ItemCustomizer
        item={customizing}
        eyebrow={`Add to ${order.code}`}
        onClose={() => setCustomizing(null)}
        onAdd={(line) => { setLines((ls) => [...ls, line]); setCustomizing(null); }}
      />
    );
  }

  return (
    <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal add-items" role="dialog" aria-modal="true" aria-labelledby="ai-title">
        <div className="modal-h">
          <div className="mt">
            <div className="eyebrow">{order.code}{order.tableNumber ? ` · Table ${order.tableNumber}` : ''} · {money(order.total)} so far</div>
            <div className="h-1" id="ai-title" style={{ marginTop: 3 }}>Add items</div>
          </div>
          <button className="icon-btn" onClick={onClose} disabled={busy} aria-label="Close">{Ic.x}</button>
        </div>
        <div className="modal-b">
          <div className="search ai-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the menu…" aria-label="Search the menu" autoFocus />
          </div>
          <div className="pos-cats ai-cats">
            <button className={`pos-cat${cat === 'all' ? ' on' : ''}`} onClick={() => setCat('all')}>All</button>
            {cats.map((c) => <button key={c.id} className={`pos-cat${cat === c.id ? ' on' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>)}
          </div>
          <div className="ai-menu" role="list">
            {isLoading ? <div className="sub">Loading the menu…</div>
              : visible.length === 0 ? <div className="sub">No items match.</div>
                : visible.map((m) => (
                  <button type="button" role="listitem" key={m.id} className="ai-item" onClick={() => pick(m)}>
                    <span className="ai-nm">{m.name}{needsChoices(m) && <span className="ai-tag">options</span>}</span>
                    <span className="ai-pr">{money(m.price)}</span>
                    <span className="ai-add" aria-hidden="true">{Ic.plus}</span>
                  </button>
                ))}
          </div>

          <div className="ai-cart">
            <div className="field-l" style={{ marginTop: 0 }}>Adding · {lines.reduce((n, l) => n + l.quantity, 0)} items</div>
            {lines.length === 0 ? <div className="sub">Tap items above to add them.</div> : lines.map((l) => (
              <div className="tline" key={l.uid}>
                <span className="tline-q">{l.quantity}×</span>
                <div className="tline-main">
                  <div className="tline-nm">{l.name}</div>
                  {(l.optionName || l.extras.length > 0 || l.notes) && <div className="tline-opt">{[l.optionName, l.extras.map((x) => x.name).join(', '), l.notes && `“${l.notes}”`].filter(Boolean).join(' · ')}</div>}
                </div>
                <div className="tline-r">
                  <span className="tline-pr">{money(l.unitPrice * l.quantity)}</span>
                  <span className="tline-steps">
                    <button type="button" onClick={() => step(l.uid, -1)} aria-label={`Decrease ${l.name}`}>−</button>
                    <span>{l.quantity}</span>
                    <button type="button" onClick={() => step(l.uid, 1)} aria-label={`Increase ${l.name}`}>+</button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-f">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={send} disabled={busy || !form.valid}>
            {busy ? 'Sending…' : `Send to kitchen · +${money(added)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
