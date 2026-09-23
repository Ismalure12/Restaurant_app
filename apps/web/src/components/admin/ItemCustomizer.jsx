'use client';

import { useMemo, useState } from 'react';
import { Modal, ModalSpacer, Button, Icon, textareaCls, cx } from '@/components/admin/ui';
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

const GROUP_LABEL = 'text-[11px] font-semibold uppercase tracking-[.09em] text-mq-muted';

/** One selectable row: radio (round) for an option, checkbox (square) for an extra. */
function ChoiceRow({ on, round, name, priceAdd, onClick }) {
  return (
    <button
      type="button"
      role={round ? 'radio' : 'checkbox'}
      aria-checked={on}
      onClick={onClick}
      className={cx(
        'flex items-center gap-3 w-full min-h-12 px-3.5 rounded-lg border text-left text-sm transition-colors',
        on ? 'bg-mq-soft border-mq-primary text-mq-ink' : 'bg-white border-mq-line text-mq-body hover:bg-mq-cream hover:border-mq-line-2',
      )}
    >
      <span className={cx(
        'grid place-items-center w-5 h-5 flex-none border',
        round ? 'rounded-full' : 'rounded-[5px]',
        on ? 'bg-mq-primary border-mq-primary text-white' : 'bg-white border-mq-line-2 text-transparent',
      )}
      >
        <Icon name="check" size={12} stroke={3} />
      </span>
      <span className={cx('flex-1 min-w-0', on && 'font-semibold')}>{name}</span>
      {Number(priceAdd) > 0 && <span className="font-mq-mono tabular-nums text-[13px] text-mq-muted">+{money(priceAdd)}</span>}
    </button>
  );
}

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
    <Modal
      eyebrow={eyebrow}
      title={item.name}
      onClose={onClose}
      width={480}
      footer={(
        <>
          <ModalSpacer />
          <Button size="lg" onClick={onClose}>Cancel</Button>
          <Button size="lg" variant="primary" onClick={() => onAdd(buildLine(item, chosen.options, chosen.extras, qty, notes))}>
            Add · <span className="font-mq-mono tabular-nums">{money(preview)}</span>
          </Button>
        </>
      )}
    >
      {/* data-autofocus: the dialog focuses this, not the notes box (no keyboard popping up on a tablet). */}
      <div className="flex flex-col gap-4 outline-none" data-autofocus tabIndex={-1}>
        {item.optionGroups?.map((g) => (
          <div key={g.id} className="flex flex-col gap-2" role="radiogroup" aria-label={g.title}>
            <div className={GROUP_LABEL}>{g.title} · pick one</div>
            {g.options?.map((o) => (
              <ChoiceRow key={o.id} round on={selOptions[g.id] === o.id} name={o.name} priceAdd={o.priceAdd}
                onClick={() => setSelOptions((p) => ({ ...p, [g.id]: o.id }))} />
            ))}
          </div>
        ))}
        {item.extras?.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className={GROUP_LABEL}>Extras · optional</div>
            {item.extras.map((e) => (
              <ChoiceRow key={e.id} on={Boolean(selExtras[e.id])} name={e.name} priceAdd={e.priceAdd}
                onClick={() => setSelExtras((p) => ({ ...p, [e.id]: !p[e.id] }))} />
            ))}
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <span className={GROUP_LABEL}>Notes</span>
          <textarea className={textareaCls('min-h-[72px]')} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. no onions, extra crispy" />
        </label>
        <div className="flex items-center justify-between gap-3">
          <span className={GROUP_LABEL}>Quantity</span>
          <span className="inline-flex items-center border border-mq-line rounded-lg overflow-hidden bg-white">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Fewer" className="grid place-items-center w-12 h-12 text-mq-body hover:bg-mq-chip hover:text-mq-ink disabled:text-mq-faint" disabled={qty <= 1}>
              <Icon name="minus" size={18} stroke={2.4} />
            </button>
            <span className="min-w-[36px] text-center font-mq-mono tabular-nums text-[15px] font-semibold" aria-live="polite">{qty}</span>
            <button type="button" onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="More" className="grid place-items-center w-12 h-12 text-mq-body hover:bg-mq-chip hover:text-mq-ink">
              <Icon name="plus" size={18} stroke={2.4} />
            </button>
          </span>
        </div>
      </div>
    </Modal>
  );
}
