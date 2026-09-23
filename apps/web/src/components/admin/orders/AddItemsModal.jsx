'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { useFormValidation } from '@/lib/formValidation';
import { addItemsSchema } from '@/lib/schemas/sales';
import ItemCustomizer, { buildLine, needsChoices } from '@/components/admin/ItemCustomizer';
import { Modal, ModalSpacer, Button, ChoiceChip, SearchInput, Icon, Overline, Skeleton } from '@/components/admin/ui';
import { money } from './orderUi';

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
  const count = lines.reduce((n, l) => n + l.quantity, 0);

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
    <Modal
      title="Add items"
      eyebrow={`${order.code}${order.tableNumber ? ` · Table ${order.tableNumber}` : ''} · ${money(order.total)} so far`}
      icon="plus"
      width={600}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <ModalSpacer />
          <Button variant="secondary" size="lg" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="lg" onClick={send} disabled={busy || !form.valid}>
            {busy ? 'Sending…' : <>Send to kitchen · <span className="font-mq-mono tabular-nums">+{money(added)}</span></>}
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search the menu…" aria-label="Search the menu" className="h-10" />
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label="Category">
          <ChoiceChip size="sm" active={cat === 'all'} onClick={() => setCat('all')}>All</ChoiceChip>
          {cats.map((c) => <ChoiceChip key={c.id} size="sm" active={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</ChoiceChip>)}
        </div>

        <div className="max-h-[260px] overflow-y-auto rounded-[10px] border border-mq-line" role="list">
          {isLoading ? (
            <div className="flex flex-col gap-2 p-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9" />)}</div>
          ) : visible.length === 0 ? (
            <div className="px-4 py-6 text-center text-[13px] text-mq-muted">No items match.</div>
          ) : visible.map((m) => (
            <button
              type="button"
              role="listitem"
              key={m.id}
              onClick={() => pick(m)}
              className="flex w-full items-center gap-3 min-h-12 px-3.5 border-b border-mq-chip last:border-b-0 text-left hover:bg-mq-cream focus-visible:outline-none focus-visible:bg-mq-soft"
            >
              <span className="flex-1 min-w-0 truncate text-sm font-medium text-mq-ink">
                {m.name}
                {needsChoices(m) && <span className="ml-2 text-[11px] font-semibold uppercase tracking-[.08em] text-mq-muted">options</span>}
              </span>
              <span className="font-mq-mono text-[13px] tabular-nums text-mq-ink">{money(m.price)}</span>
              <span className="grid place-items-center w-7 h-7 rounded-lg bg-mq-soft text-mq-primary" aria-hidden="true"><Icon name="plus" size={14} stroke={2.2} /></span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <Overline>Adding · {count} {count === 1 ? 'item' : 'items'}</Overline>
          {lines.length === 0 ? (
            <p className="m-0 text-[13px] text-mq-muted">Tap items above to add them.</p>
          ) : (
            <div className="rounded-[10px] border border-mq-line">
              {lines.map((l) => (
                <div key={l.uid} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-2.5 border-b border-mq-chip last:border-b-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-mq-ink truncate">{l.name}</div>
                    {(l.optionName || l.extras.length > 0 || l.notes) && (
                      <div className="text-xs text-mq-muted truncate">{[l.optionName, l.extras.map((x) => x.name).join(', '), l.notes && `“${l.notes}”`].filter(Boolean).join(' · ')}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mq-mono text-[13px] tabular-nums text-mq-ink">{money(l.unitPrice * l.quantity)}</span>
                    <Stepper value={l.quantity} name={l.name} onStep={(d) => step(l.uid, d)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** − n + quantity stepper (44px targets). */
export function Stepper({ value, name, onStep, min = 0, max = 99 }) {
  const btn = 'grid place-items-center w-11 h-11 tab:w-9 tab:h-9 rounded-lg text-mq-body hover:bg-mq-chip disabled:opacity-40 disabled:hover:bg-transparent';
  return (
    <span className="inline-flex items-center rounded-lg border border-mq-line bg-white">
      <button type="button" className={btn} onClick={() => onStep(-1)} disabled={value <= min} aria-label={`Decrease ${name}`}><Icon name="minus" size={14} stroke={2.2} /></button>
      <span className="min-w-[24px] text-center font-mq-mono text-[13px] font-semibold tabular-nums text-mq-ink">{value}</span>
      <button type="button" className={btn} onClick={() => onStep(1)} disabled={value >= max} aria-label={`Increase ${name}`}><Icon name="plus" size={14} stroke={2.2} /></button>
    </span>
  );
}
