'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCart } from './CartProvider';
import { FMT } from '@/lib/menu/format';

const MAX_QTY = 20;

// Choosing options and adding a dish to the cart. Pricing is the documented
// rule: unitPrice = basePrice + selectedOption.priceAdd + sum(extras.priceAdd).
// The server reprices at checkout, so this is display only.
export default function ItemForm({ item }) {
  const router = useRouter();
  const { add } = useCart();

  // Memoised: the `|| []` fallback would otherwise be a new array each render
  // and re-run every useMemo below it.
  const groups = useMemo(() => item.optionGroups || [], [item.optionGroups]);
  const [picked, setPicked] = useState(() => {
    // First option of each group is the default, matching the old detail screen.
    const init = {};
    for (const g of groups) if (g.options?.length) init[g.id] = g.options[0].id;
    return init;
  });
  const [extras, setExtras] = useState([]);
  const [notes, setNotes] = useState('');
  const [qty, setQty] = useState(1);

  const chosenOptions = useMemo(
    () => groups
      .map((g) => g.options?.find((o) => o.id === picked[g.id]))
      .filter(Boolean),
    [groups, picked]
  );
  const chosenExtras = useMemo(
    () => (item.extras || []).filter((e) => extras.includes(e.id)),
    [item.extras, extras]
  );

  const unitPrice =
    Number(item.price || 0)
    + chosenOptions.reduce((s, o) => s + Number(o.priceAdd || 0), 0)
    + chosenExtras.reduce((s, e) => s + Number(e.priceAdd || 0), 0);

  const addToCart = () => {
    add({
      uid: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      itemId: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
      optionName: chosenOptions.map((o) => o.name).join(' · ') || null,
      extras: chosenExtras.map((e) => ({ name: e.name, priceAdd: Number(e.priceAdd || 0) })),
      notes: notes.trim() || null,
      unitPrice,
      quantity: qty,
    });
    router.push('/cart');
  };

  return (
    <div className="mx-item-form">
      {groups.map((g) => (
        <fieldset key={g.id} className="mx-field-group">
          <legend className="mx-legend">
            {g.title}
            <span className="mx-required">Required</span>
          </legend>
          <div className="mx-choice-list">
            {g.options.map((o) => (
              <label
                key={o.id}
                className={`mx-choice${picked[g.id] === o.id ? ' is-picked' : ''}`}
              >
                <input
                  type="radio"
                  name={`group-${g.id}`}
                  checked={picked[g.id] === o.id}
                  onChange={() => setPicked((p) => ({ ...p, [g.id]: o.id }))}
                />
                <span className="mx-choice-name">{o.name}</span>
                <span className="mx-choice-price tnum">
                  {Number(o.priceAdd) > 0 ? `+${FMT(o.priceAdd)}` : 'Included'}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      {item.extras?.length > 0 && (
        <fieldset className="mx-field-group">
          <legend className="mx-legend">Add extras</legend>
          <div className="mx-choice-list">
            {item.extras.map((e) => (
              <label
                key={e.id}
                className={`mx-choice${extras.includes(e.id) ? ' is-picked' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={extras.includes(e.id)}
                  onChange={() => setExtras((x) => (
                    x.includes(e.id) ? x.filter((i) => i !== e.id) : [...x, e.id]
                  ))}
                />
                <span className="mx-choice-name">{e.name}</span>
                <span className="mx-choice-price tnum">+{FMT(e.priceAdd)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mx-field-group">
        <label htmlFor="mx-notes" className="mx-legend">Note for the kitchen</label>
        <input
          id="mx-notes"
          type="text"
          className="mx-input"
          placeholder="No onion, please"
          value={notes}
          maxLength={140}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="mx-item-actions">
        <div className="mx-stepper">
          <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14" /></svg>
          </button>
          <span className="tnum" aria-live="polite">{qty}</span>
          <button type="button" onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))} aria-label="Increase quantity">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>
        <button type="button" className="mx-btn mx-btn-primary mx-btn-grow" onClick={addToCart}>
          Add to cart
          <span className="tnum">{FMT(unitPrice * qty)}</span>
        </button>
      </div>
    </div>
  );
}
