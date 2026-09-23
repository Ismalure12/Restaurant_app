'use client';

import { useMemo, useState } from 'react';
import { money } from '@/lib/money';


const uid = () => Math.random().toString(36).slice(2, 10);

/** A cart line in the shape the API expects (the server reprices it). */
export function buildLine(item, optionParts = [], extras = [], quantity = 1, notes = '') {
  const unitPrice = Number(item.price)
    + optionParts.reduce((s, o) => s + Number(o.priceAdd), 0)
    + extras.reduce((s, e) => s + Number(e.priceAdd), 0);
  return {
    uid: uid(), itemId: item.id, name: item.name, imageUrl: item.imageUrl ?? null,
    optionName: optionParts.map((o) => o.name).join(' · ') || null,
    extras: extras.map((e) => ({ name: e.name, priceAdd: Number(e.priceAdd) })),
    notes: notes || '', unitPrice, quantity,
  };
}

export const needsChoices = (item) => (item.optionGroups?.length ?? 0) > 0 || (item.extras?.length ?? 0) > 0;

/**
 * Pick one option per group, any extras, notes and quantity for a menu item,
 * then onAdd(line). Used by the Register and by "Add items" on an unpaid order.
 */
export default function ItemCustomizer({ item, eyebrow = 'Item', onClose, onAdd }) {
  const [selOptions, setSelOptions] = useState(() => {
    const d = {};
    item.optionGroups?.forEach((g) => { if (g.options?.length) d[g.id] = g.options[0].id; });
    return d;
  });
  const [selExtras, setSelExtras] = useState({});
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');

  const chosen = useMemo(() => ({
    options: (item.optionGroups || []).map((g) => g.options?.find((o) => o.id === selOptions[g.id])).filter(Boolean),
    extras: (item.extras || []).filter((e) => selExtras[e.id]),
  }), [item, selOptions, selExtras]);
  const preview = buildLine(item, chosen.options, chosen.extras, qty).unitPrice * qty;

  return (
    <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={item.name}>
        <div className="modal-h">
          <div className="mt"><div className="eyebrow">{eyebrow}</div><div className="h-1" style={{ marginTop: 3 }}>{item.name}</div></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </div>
        <div className="modal-b">
          {item.optionGroups?.map((g) => (
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
          {item.extras?.length > 0 && (
            <div className="ff">
              <label>Extras · optional</label>
              <div className="opt-group">
                {item.extras.map((e) => (
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
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onAdd(buildLine(item, chosen.options, chosen.extras, qty, notes))}>Add · {money(preview)}</button>
        </div>
      </div>
    </div>
  );
}
