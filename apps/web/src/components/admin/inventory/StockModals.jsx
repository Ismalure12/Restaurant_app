'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { useFormValidation } from '@/lib/formValidation';
import { inventoryItemFormSchema, stockMovementFormSchema, numOrNull } from '@/lib/schemas/inventory';
import { reportSaveError } from '@/lib/saveError';
import Field from '@/components/admin/Field';
import AccountField from '@/components/admin/suppliers/AccountField';
import { defaultPaidFrom } from '@/components/admin/AccountSelect';
import { SupplierForm } from '@/components/admin/suppliers/SuppliersTab';
import { Modal, ModalSpacer, Button, ChoiceChip, Toggle, Alert, Dot, inputCls, selectCls } from '@/components/admin/ui';

const JSON_H = { 'Content-Type': 'application/json' };
const num = numOrNull;
const NEW = '__new';

export const MV_TYPES = [
  { v: 'purchase', label: 'Purchase' },
  { v: 'usage', label: 'Usage' },
  { v: 'waste', label: 'Waste' },
  { v: 'adjustment', label: 'Adjust' },
];
const MV_TONE = { purchase: 'ok', usage: 'info', waste: 'danger', adjustment: 'warn' };
const MV_SIGN = { purchase: '+', usage: '−', waste: '−', adjustment: '=' };

const emptyItem = { name: '', unit: '', reorderLevel: '', costPerUnit: '', supplier: '', isActive: true };

/**
 * New / edit stock item (Inventory › Act). The supplier is stored on the item
 * as a name, so the select lists the supplier names (plus the item's current
 * one if it isn't a supplier record) and "+ New supplier…" adds one first.
 */
export function ItemModal({ item, suppliers, onClose, onDelete, deleting }) {
  const qc = useQueryClient();
  const editingId = item?.id ?? null;
  const [form, setForm] = useState(() => (item
    ? { name: item.name, unit: item.unit, reorderLevel: item.reorderLevel ?? '', costPerUnit: item.costPerUnit ?? '', supplier: item.supplier ?? '', isActive: item.isActive }
    : emptyItem));
  const [banner, setBanner] = useState('');
  const [newSupplier, setNewSupplier] = useState(false);
  const v = useFormValidation(inventoryItemFormSchema, form);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const names = useMemo(() => {
    const list = suppliers.filter((s) => s.isActive).map((s) => s.name);
    if (form.supplier && !list.includes(form.supplier)) list.unshift(form.supplier);
    return list;
  }, [suppliers, form.supplier]);

  const save = useMutation({
    mutationFn: (payload) => fetchJson(
      editingId ? `/api/admin/inventory/${editingId}` : '/api/admin/inventory',
      { method: editingId ? 'PATCH' : 'POST', headers: JSON_H, body: JSON.stringify(payload) },
    ),
    onSuccess: () => {
      notify.success(editingId ? 'Item updated' : 'Item added', { title: editingId ? 'Could not save the item' : 'Could not add the item' });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      onClose();
    },
    onError: (err) => reportSaveError(err, { title: editingId ? 'Could not save the item' : 'Could not add the item', form: v, setBanner }),
  });

  const submit = (e) => {
    e.preventDefault(); setBanner('');
    if (!v.check()) return;
    v.setServerErrors({});
    save.mutate({
      name: form.name.trim(), unit: form.unit.trim(), reorderLevel: num(form.reorderLevel), costPerUnit: num(form.costPerUnit),
      supplier: form.supplier.trim() || null, isActive: form.isActive,
    });
  };
  const busy = save.isPending;

  return (
    <>
      <Modal
        eyebrow={editingId ? 'Edit item' : 'New item'}
        title={editingId ? (form.name || 'Item') : 'Add inventory item'}
        onClose={onClose}
        busy={busy}
        width={520}
        footer={(
          <>
            {editingId && <Button variant="danger-soft" size="lg" onClick={() => onDelete({ id: editingId, name: form.name })} disabled={busy || deleting}>Delete</Button>}
            <ModalSpacer />
            <Button size="lg" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" size="lg" type="submit" form="inv-item-form" disabled={busy || !v.valid}>
              {busy ? 'Saving…' : editingId ? 'Save changes' : 'Add item'}
            </Button>
          </>
        )}
      >
        <form id="inv-item-form" onSubmit={submit} noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          <Field label="Item name" required className="sm:col-span-2" {...v.fieldProps('name')}>
            <input className={inputCls({ size: 'lg' })} value={form.name} onChange={set('name')} />
          </Field>
          <Field label="Unit" required {...v.fieldProps('unit')}>
            <input className={inputCls({ size: 'lg' })} placeholder="kg, L, pcs" value={form.unit} onChange={set('unit')} />
          </Field>
          <Field label="Reorder level" {...v.fieldProps('reorderLevel')}>
            <input className={inputCls({ size: 'lg', mono: true })} type="number" inputMode="decimal" step="any" min="0" value={form.reorderLevel} onChange={set('reorderLevel')} />
          </Field>
          <Field label="Estimated cost / unit" hint="Used until purchases are logged" {...v.fieldProps('costPerUnit')}>
            <input className={inputCls({ size: 'lg', mono: true })} type="number" inputMode="decimal" step="any" min="0" value={form.costPerUnit} onChange={set('costPerUnit')} placeholder="0.00" />
          </Field>
          <Field label="Supplier" {...v.fieldProps('supplier')}>
            <select
              className={selectCls({ size: 'lg' })}
              value={form.supplier}
              onChange={(e) => { if (e.target.value === NEW) { setNewSupplier(true); return; } set('supplier')(e); }}
            >
              <option value="">No supplier</option>
              {names.map((n) => <option key={n} value={n}>{n}</option>)}
              <option value={NEW}>+ New supplier…</option>
            </select>
          </Field>
          <div className="sm:col-span-2 flex items-center gap-3 py-1">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-mq-ink">Active</div>
              <div className="text-xs text-mq-muted mt-0.5">Inactive items drop out of the purchase, usage and count lists.</div>
            </div>
            <Toggle checked={form.isActive} onChange={(on) => setForm((f) => ({ ...f, isActive: on }))} label="Active" />
          </div>
          {banner && <Alert tone="danger" className="sm:col-span-2">{banner}</Alert>}
        </form>
      </Modal>
      {newSupplier && (
        <SupplierForm onClose={() => setNewSupplier(false)} onSaved={(sp) => sp?.name && setForm((f) => ({ ...f, supplier: sp.name }))} />
      )}
    </>
  );
}

/**
 * Record a stock movement (Inventory › Act). `item` may be null when opened
 * from the header — the modal then asks which (active) item first. `items` is
 * every item, so the on-hand figure stays live after each recording. A purchase books an
 * expense (paid from an account) unless it is bought on credit from a supplier.
 * `log` = this session's movements per item id (shown under the form).
 */
export function MovementModal({ item: initialItem, items, initialType = 'purchase', suppliers, accounts, log, onRecorded, onClose }) {
  const qc = useQueryClient();
  const [itemId, setItemId] = useState(initialItem ? String(initialItem.id) : '');
  const item = items.find((i) => String(i.id) === itemId) || null;
  const [type, setType] = useState(initialType);
  const [qty, setQty] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [onCredit, setOnCredit] = useState(false);
  const [account, setAccount] = useState('');
  const [note, setNote] = useState('');
  const [banner, setBanner] = useState('');
  const [newSupplier, setNewSupplier] = useState(false);

  const paidFrom = account || defaultPaidFrom(accounts);
  const purchase = type === 'purchase';
  const values = useMemo(() => ({
    type, quantity: qty, totalCost: purchase ? totalCost : '', supplierId: purchase ? supplierId : '',
    onCredit: purchase && onCredit, paidFrom, note,
  }), [type, qty, totalCost, supplierId, onCredit, paidFrom, note, purchase]);
  const v = useFormValidation(stockMovementFormSchema, values);

  const record = useMutation({
    mutationFn: ({ id, payload }) => fetchJson(`/api/admin/inventory/${id}/movements`, { method: 'POST', headers: JSON_H, body: JSON.stringify(payload) }),
    onSuccess: (_d, { id, payload }) => {
      notify.success('Stock updated', { title: 'Could not record the movement' });
      onRecorded(id, { type: payload.type, q: payload.quantity, t: 'just now' });
      setQty(''); setTotalCost(''); setNote(''); setOnCredit(false); v.reset();
      qc.invalidateQueries({ queryKey: ['inventory'] });
      // Purchases feed the ledger, supplier balances, cash book and account balances.
      ['inv-movements', 'suppliers', 'supplier', 'account-balances', 'account-entries', 'expenses'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    },
    onError: (err) => reportSaveError(err, { title: 'Could not record the movement', form: v, setBanner }),
  });

  const submit = (e) => {
    e.preventDefault(); setBanner('');
    if (!item || !v.check()) return;
    v.setServerErrors({});
    const payload = { type, quantity: num(qty), totalCost: purchase ? num(totalCost) : null, note: note.trim() || null };
    if (purchase) {
      if (supplierId) payload.supplierId = Number(supplierId);
      if (onCredit) payload.onCredit = true;
      else if (payload.totalCost > 0) payload.paidFromAccountId = Number(paidFrom);
    }
    record.mutate({ id: item.id, payload });
  };
  const busy = record.isPending;
  const recent = item ? (log[item.id] || []) : [];

  return (
    <>
      <Modal
        eyebrow="Stock movement"
        title={item ? item.name : 'Record movement'}
        sub={item ? <>On hand now: <span className="font-mq-mono text-mq-ink tabular-nums">{item.quantity} {item.unit}</span></> : 'Choose the item first.'}
        onClose={onClose}
        busy={busy}
        width={520}
        footer={(
          <>
            <ModalSpacer />
            <Button size="lg" onClick={onClose} disabled={busy}>Close</Button>
            <Button variant="primary" size="lg" type="submit" form="inv-move-form" disabled={busy || !item || !v.valid}>
              {busy ? 'Recording…' : 'Record movement'}
            </Button>
          </>
        )}
      >
        <form id="inv-move-form" onSubmit={submit} noValidate className="flex flex-col gap-3.5 pt-1">
          {!initialItem && (
            <Field label="Item" required>
              <select className={selectCls({ size: 'lg' })} value={itemId} onChange={(e) => setItemId(e.target.value)}>
                <option value="" disabled>Choose an item…</option>
                {items.filter((i) => i.isActive).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </Field>
          )}

          <div className="flex flex-col gap-1.5">
            <span id="mv-type-l" className="text-[11px] font-semibold uppercase tracking-[.09em] text-mq-muted">Movement type</span>
            <div role="group" aria-labelledby="mv-type-l" className="flex flex-wrap gap-2">
              {MV_TYPES.map((t) => <ChoiceChip key={t.v} active={type === t.v} onClick={() => setType(t.v)}>{t.label}</ChoiceChip>)}
            </div>
          </div>

          <Field label={`Quantity${item ? ` (${item.unit})` : ''}${type === 'adjustment' ? ' — signed' : ''}`} required {...v.fieldProps('quantity')}>
            <input className={inputCls({ size: 'lg', mono: true })} type="number" inputMode="decimal" step="any" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 10" />
          </Field>

          {purchase && (
            <>
              <Field
                label="Total cost paid (books an expense)"
                required={onCredit}
                hint="What you paid (or owe) for this whole purchase, not a per-unit price. Unit cost is averaged automatically from purchase history."
                {...v.fieldProps('totalCost')}
              >
                <input className={inputCls({ size: 'lg', mono: true })} type="number" inputMode="decimal" step="any" min="0" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} placeholder="0.00" />
              </Field>

              <Field label={`Supplier${onCredit ? '' : ' (optional)'}`} required={onCredit} {...v.fieldProps('supplierId')}>
                <select
                  className={selectCls({ size: 'lg' })}
                  value={supplierId}
                  onChange={(e) => { if (e.target.value === NEW) { setNewSupplier(true); return; } setSupplierId(e.target.value); }}
                >
                  <option value="">No supplier</option>
                  {suppliers.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value={NEW}>+ New supplier…</option>
                </select>
              </Field>

              <div className="flex items-start gap-3 rounded-[10px] border border-mq-line bg-mq-cream px-3.5 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-mq-ink">Bought on credit (pay later)</div>
                  <div className="text-xs text-mq-muted mt-0.5 leading-normal">Nothing is paid now. It is owed to the supplier until you pay them in Expenses › Suppliers.</div>
                </div>
                <Toggle checked={onCredit} onChange={setOnCredit} label="Bought on credit" />
              </div>

              {!onCredit && num(totalCost) > 0 && (
                <AccountField value={paidFrom} onChange={setAccount} {...v.fieldProps('paidFrom')} />
              )}
            </>
          )}

          <Field label="Note (optional)" {...v.fieldProps('note')}>
            <input className={inputCls({ size: 'lg' })} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Supplier, reason…" />
          </Field>

          {banner && <Alert tone="danger">{banner}</Alert>}

          {item && (
            <div className="flex flex-col gap-1 border-t border-mq-chip pt-3">
              <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-mq-muted">Recorded this session</span>
              {recent.length ? recent.map((m, idx) => (
                <div key={idx} className="flex items-center gap-2.5 py-1 text-[13px]">
                  <Dot tone={MV_TONE[m.type]} />
                  <span className="flex-1 capitalize text-mq-body">{m.type}</span>
                  <span className="font-mq-mono tabular-nums text-mq-ink">{MV_SIGN[m.type]}{m.q}</span>
                  <span className="text-xs text-mq-muted w-16 text-right">{m.t}</span>
                </div>
              )) : <p className="m-0 text-[12.5px] text-mq-muted">Nothing yet. The full history is in the Purchases and Usage &amp; waste tabs.</p>}
            </div>
          )}
        </form>
      </Modal>
      {newSupplier && <SupplierForm onClose={() => setNewSupplier(false)} onSaved={(sp) => sp?.id && setSupplierId(String(sp.id))} />}
    </>
  );
}
