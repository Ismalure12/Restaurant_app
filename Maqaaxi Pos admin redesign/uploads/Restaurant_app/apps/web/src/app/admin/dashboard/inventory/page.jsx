'use client';

import { useState, useMemo , Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { useFormValidation } from '@/lib/formValidation';
import { inventoryItemFormSchema, stockMovementFormSchema, numOrNull } from '@/lib/schemas/inventory';
import Field from '@/components/admin/Field';
import AccountField from '@/components/admin/suppliers/AccountField';
import { reportSaveError } from '@/lib/saveError';
import useConfirm from '@/hooks/useConfirm';
import useMoneyAccounts from '@/hooks/useMoneyAccounts';
import useSuppliers from '@/hooks/useSuppliers';
import useAccess from '@/hooks/useAccess';
import { defaultPaidFrom } from '@/components/admin/AccountSelect';
import { SupplierForm } from '@/components/admin/suppliers/SuppliersTab';
import MovementsTab from '@/components/admin/stocktake/MovementsTab';
import CountsTab from '@/components/admin/stocktake/CountsTab';
import { money } from '@/lib/money';

const emptyItem = { name: '', unit: '', reorderLevel: '', costPerUnit: '', supplier: '', isActive: true };
const MV_TYPES = [
  { v: 'purchase', label: 'Purchase' },
  { v: 'usage', label: 'Usage' },
  { v: 'waste', label: 'Waste' },
  { v: 'adjustment', label: 'Adjust' },
];
const MV_COLOR = { purchase: 'var(--primary)', usage: 'var(--sky)', waste: 'var(--rose)', adjustment: 'var(--gold)' };
const MV_SIGN = { purchase: '+', usage: '−', waste: '−', adjustment: '=' };

const num = numOrNull;

const TABS = [['stock', 'Stock'], ['purchases', 'Purchases'], ['usage', 'Usage & waste'], ['counts', 'Counts']];

// The topbar search links here with ?q= — the page opens already filtered.
// Keyed on q so a second search while on this page starts fresh.
export default function InventoryRoute() {
  return <Suspense fallback={null}><InventoryPageFromUrl /></Suspense>;
}
function InventoryPageFromUrl() {
  const sp = useSearchParams();
  const q = sp.get('q') || '';
  const t = sp.get('tab');
  return <InventoryPage key={q} initialSearch={q} urlTab={TABS.some(([k]) => k === t) ? t : 'stock'} />;
}

function InventoryPage({ initialSearch = '', urlTab = 'stock' }) {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  // Purchases, usage/waste and counts need Inventory › Act (Settings › Staff access).
  const { canAct } = useAccess();
  const isManager = canAct('inventory');
  const tab = isManager ? urlTab : 'stock';
  const goTab = (t) => router.replace(t === 'stock' ? pathname : `${pathname}?tab=${t}`, { scroll: false });
  const { accounts } = useMoneyAccounts({ enabled: isManager });
  const { suppliers } = useSuppliers({ enabled: isManager });
  const [mvSupplier, setMvSupplier] = useState('');
  const [mvOnCredit, setMvOnCredit] = useState(false);
  const [mvAccount, setMvAccount] = useState('');
  const [newSupplier, setNewSupplier] = useState(false);
  const { confirm, dialog } = useConfirm();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyItem);
  const [formError, setFormError] = useState('');

  const [movingId, setMovingId] = useState(null);
  const [mvType, setMvType] = useState('purchase');
  const [mvQty, setMvQty] = useState('');
  const [mvTotalCost, setMvTotalCost] = useState('');
  const [mvNote, setMvNote] = useState('');
  const [movementError, setMovementError] = useState('');
  const [log, setLog] = useState({});

  const [search, setSearch] = useState(initialSearch);
  const [lowOnly, setLowOnly] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      try {
        const items = await fetchJson('/api/admin/inventory');
        return { denied: false, items: Array.isArray(items) ? items : [] };
      } catch (err) {
        if (err.kind === 'forbidden') return { denied: true, items: [] };
        throw err;
      }
    },
  });

  const accessDenied = data?.denied ?? false;
  const allItems = useMemo(() => data?.items ?? [], [data]);

  const statusOf = (it) => (Number(it.quantity) <= 0 ? 'out' : it.lowStock ? 'low' : 'ok');
  const lowCount = useMemo(() => allItems.filter((i) => statusOf(i) === 'low').length, [allItems]);
  const outCount = useMemo(() => allItems.filter((i) => statusOf(i) === 'out').length, [allItems]);
  // Uses the API's effectiveCost (weighted-average purchase cost, falling
  // back to the manual estimate) — never a stale client-side costPerUnit.
  const stockValue = useMemo(() => allItems.reduce((s, i) => s + Number(i.quantity) * Number(i.effectiveCost || 0), 0), [allItems]);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allItems.filter((i) => {
      if (lowOnly && statusOf(i) === 'ok') return false;
      if (q && !i.name.toLowerCase().includes(q) && !(i.supplier || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allItems, search, lowOnly]);

  const movingItem = useMemo(() => allItems.find((i) => i.id === movingId) || null, [allItems, movingId]);

  // Front-end checks (the API re-validates). The submit buttons stay disabled until the form is valid.
  const itemV = useFormValidation(inventoryItemFormSchema, form);
  const paidFrom = mvAccount || defaultPaidFrom(accounts);
  const mvValues = useMemo(() => ({
    type: mvType, quantity: mvQty, totalCost: mvType === 'purchase' ? mvTotalCost : '', supplierId: mvType === 'purchase' ? mvSupplier : '',
    onCredit: mvType === 'purchase' && mvOnCredit, paidFrom, note: mvNote,
  }), [mvType, mvQty, mvTotalCost, mvSupplier, mvOnCredit, paidFrom, mvNote]);
  const mvForm = useFormValidation(stockMovementFormSchema, mvValues);

  const saveMutation = useMutation({
    mutationFn: (payload) => fetchJson(
      editingId ? `/api/admin/inventory/${editingId}` : '/api/admin/inventory',
      { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    ),
    onSuccess: () => { notify.success(editingId ? 'Item updated' : 'Item added', { title: editingId ? 'Could not save the item' : 'Could not add the item' }); qc.invalidateQueries({ queryKey: ['inventory'] }); resetForm(); },
    onError: (err) => reportSaveError(err, { title: editingId ? 'Could not save the item' : 'Could not add the item', form: itemV, setBanner: setFormError }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => fetchJson(`/api/admin/inventory/${id}`, { method: 'DELETE' }),
    onSuccess: () => { notify.success('Item deleted'); qc.invalidateQueries({ queryKey: ['inventory'] }); },
    onError: (err) => notify.error(err, { title: 'Could not delete the item' }),
  });

  const movementMutation = useMutation({
    mutationFn: ({ id, payload }) => fetchJson(`/api/admin/inventory/${id}/movements`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: (_d, variables) => {
      notify.success('Stock updated', { title: 'Could not record the movement' });
      const { id, payload } = variables;
      setLog((prev) => ({ ...prev, [id]: [{ type: payload.type, q: payload.quantity, t: 'just now' }, ...(prev[id] || [])] }));
      setMvQty(''); setMvTotalCost(''); setMvNote(''); setMvOnCredit(false); mvForm.reset();
      qc.invalidateQueries({ queryKey: ['inventory'] });
      // Purchases feed the ledger, supplier balances, cash book and account balances.
      ['inv-movements', 'suppliers', 'supplier', 'account-balances', 'account-entries', 'expenses'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (err) => reportSaveError(err, { title: 'Could not record the movement', form: mvForm, setBanner: setMovementError }),
  });

  const resetForm = () => { setForm(emptyItem); setEditingId(null); setShowForm(false); setFormError(''); itemV.reset(); };
  const closeMovement = () => { mvForm.reset(); setMovingId(null); setMvType('purchase'); setMvQty(''); setMvTotalCost(''); setMvNote(''); setMovementError(''); setMvOnCredit(false); setMvSupplier(''); setMvAccount(''); };

  const handleSubmit = (e) => {
    e.preventDefault(); setFormError('');
    if (!itemV.check()) return;
    itemV.setServerErrors({});
    saveMutation.mutate({ name: form.name.trim(), unit: form.unit.trim(), reorderLevel: num(form.reorderLevel), costPerUnit: num(form.costPerUnit), supplier: form.supplier.trim() || null, isActive: form.isActive });
  };

  const handleEdit = (item) => {
    setForm({ name: item.name, unit: item.unit, reorderLevel: item.reorderLevel ?? '', costPerUnit: item.costPerUnit ?? '', supplier: item.supplier ?? '', isActive: item.isActive });
    setEditingId(item.id); setShowForm(true); setFormError(''); itemV.reset();
  };

  const handleDelete = async (item) => {
    const ok = await confirm({ title: `Delete ${item.name}?`, body: 'This removes the item and its movement history.', confirmLabel: 'Delete item' });
    if (ok) deleteMutation.mutate(item.id);
  };

  const handleMovementSubmit = (e) => {
    e.preventDefault(); setMovementError('');
    if (!mvForm.check()) return;
    mvForm.setServerErrors({});
    const payload = { type: mvType, quantity: num(mvQty), totalCost: mvType === 'purchase' ? num(mvTotalCost) : null, note: mvNote.trim() || null };
    if (mvType === 'purchase') {
      const cost = payload.totalCost;
      if (mvSupplier) payload.supplierId = Number(mvSupplier);
      if (mvOnCredit) payload.onCredit = true;
      else if (cost > 0) payload.paidFromAccountId = Number(paidFrom);
    }
    movementMutation.mutate({ id: movingItem.id, payload });
  };

  const openMovement = (item, type = 'purchase') => { mvForm.reset(); setMovingId(item.id); setMvType(type); setMvQty(''); setMvTotalCost(''); setMvNote(''); setMovementError(''); setMvOnCredit(false); setMvSupplier(''); setMvAccount(''); };

  const isSaving = saveMutation.isPending;
  const isMoving = movementMutation.isPending;

  if (!isLoading && accessDenied) {
    return (
      <div className="card card-pad-lg" style={{ maxWidth: 560 }}>
        <div className="empty">
          <div className="empty-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></div>
          <p className="empty-title">No access</p>
          <p className="empty-sub">You don’t have permission to view inventory.</p>
        </div>
      </div>
    );
  }

  const statusPill = (st) => st === 'out'
    ? <span className="pill pill-rose"><span className="pdot" />Out</span>
    : st === 'low'
      ? <span className="pill pill-amber"><span className="pdot" />Low</span>
      : <span className="pill pill-green"><span className="pdot" />In stock</span>;

  return (
    <div>
      {dialog}

      {isManager && (
        <div className="toolbar">
          <div className="seg" role="tablist" aria-label="Inventory">
            {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => goTab(k)}>{l}</button>)}
          </div>
        </div>
      )}

      {tab === 'purchases' && <MovementsTab key="purchases" mode="purchases" items={allItems.filter((i) => i.isActive)} onRecord={openMovement} />}
      {tab === 'usage' && <MovementsTab key="usage" mode="usage" items={allItems.filter((i) => i.isActive)} onRecord={openMovement} />}
      {tab === 'counts' && <CountsTab />}

      {tab === 'stock' && (<>
      {/* KPIs */}
      <div className="kpi-row" style={{ marginBottom: 18 }}>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ic ink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg></div><span className="kpi-k">Tracked items</span></div>
          <div className="kpi-v">{allItems.length}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ic amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg></div><span className="kpi-k">Low stock</span></div>
          <div className="kpi-v">{lowCount}</div>
          <div className="kpi-foot"><span className="pill pill-amber" style={{ padding: '1px 8px' }}>needs reorder</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ic rose"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></svg></div><span className="kpi-k">Out of stock</span></div>
          <div className="kpi-v">{outCount}</div>
          <div className="kpi-foot"><span>halt on menu</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ic green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div><span className="kpi-k">Stock value</span></div>
          <div className="kpi-v"><small>$</small>{stockValue.toFixed(0)}</div>
          <div className="kpi-foot"><span>at cost</span></div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="search" style={{ width: 240 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items…" />
        </div>
        <button className={`btn btn-sm ${lowOnly ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setLowOnly((v) => !v)}>Low stock only</button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" /></svg>Add item
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="card" style={{ overflow: 'hidden' }}>{[1, 2, 3, 4].map((n) => <div key={n} className="sk" style={{ height: 52, margin: 12, borderRadius: 'var(--r-sm)' }} />)}</div>
      ) : items.length === 0 ? (
        <div className="card card-pad-lg">
          <div className="empty">
            <div className="empty-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg></div>
            <p className="empty-title">{lowOnly ? 'Nothing low on stock' : (search ? 'No matches' : 'No inventory yet')}</p>
            <p className="empty-sub">{lowOnly ? 'All items are above their reorder level.' : (search ? 'Try a different search.' : 'Add your first stock item.')}</p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Item</th><th>On hand</th><th>Reorder at</th><th>Status</th><th className="num">Cost/unit</th><th>Supplier</th><th /></tr></thead>
              {/* Cost/unit shows the weighted-average purchase cost (avg) once the
                  item has purchase history, else the manual estimate (est.). */}
              <tbody>
                {items.map((it) => {
                  const st = statusOf(it);
                  const qty = Number(it.quantity);
                  const reorder = Number(it.reorderLevel || 0);
                  const pct = reorder > 0 ? Math.min(100, Math.round((qty / (reorder * 2)) * 100)) : (qty > 0 ? 100 : 0);
                  const col = st === 'out' ? 'var(--rose)' : st === 'low' ? 'var(--amber)' : 'var(--primary)';
                  return (
                    <tr key={it.id} className={st !== 'ok' ? 'low' : ''}>
                      <td style={{ fontWeight: 560, color: 'var(--ink)' }}>{it.name}{!it.isActive && <span className="pill pill-ghost" style={{ marginLeft: 8 }}>Inactive</span>}</td>
                      <td>
                        <span className="stock-pill" style={{ color: col }}>{it.quantity} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{it.unit}</span></span>
                        {' '}<span className="meter"><i style={{ width: `${pct}%`, background: col }} /></span>
                      </td>
                      <td className="num" style={{ color: 'var(--muted)' }}>{it.reorderLevel ?? '—'} {it.reorderLevel ? it.unit : ''}</td>
                      <td>{statusPill(st)}</td>
                      <td className="num">
                        {it.effectiveCost ? (
                          <>
                            {money(it.effectiveCost)}{' '}
                            <span style={{ fontSize: 10, color: 'var(--faint)', fontWeight: 500 }}>{it.avgCost ? 'avg' : 'est.'}</span>
                          </>
                        ) : '—'}
                      </td>
                      <td style={{ color: 'var(--muted)' }}>{it.supplier ?? '—'}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openMovement(it)}>Movement</button>
                        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => handleEdit(it)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8, color: 'var(--rose)' }} onClick={() => handleDelete(it)} disabled={deleteMutation.isPending}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>)}

      {/* Item modal */}
      {showForm && (
        <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget) resetForm(); }}>
          <div className="modal">
            <div className="modal-h">
              <div className="mt"><div className="eyebrow">{editingId ? 'Edit item' : 'New item'}</div><div className="h-1" style={{ marginTop: 3 }}>{editingId ? form.name || 'Item' : 'Add inventory item'}</div></div>
              <button className="icon-btn" onClick={resetForm} aria-label="Close" disabled={isSaving}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={handleSubmit} noValidate style={{ display: 'contents' }}>
              <div className="modal-b">
                <Field label="Item name" required {...itemV.fieldProps('name')}>
                  <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
                </Field>
                <div className="g2-cols">
                  <Field label="Unit" required {...itemV.fieldProps('unit')}>
                    <input className="input" placeholder="kg, L, pcs" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
                  </Field>
                  <Field label="Reorder level" {...itemV.fieldProps('reorderLevel')}>
                    <input className="input" type="number" inputMode="decimal" step="any" min="0" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} />
                  </Field>
                </div>
                <div className="g2-cols">
                  <Field label="Estimated cost / unit" {...itemV.fieldProps('costPerUnit')}>
                    <input className="input" type="number" inputMode="decimal" step="any" min="0" value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })} placeholder="Used until purchases are logged" />
                  </Field>
                  <Field label="Supplier" {...itemV.fieldProps('supplier')}>
                    <input className="input" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
                  </Field>
                </div>
                <label className="ff-row" style={{ cursor: 'pointer' }}>
                  <span style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 500 }}>Active</span>
                  <span role="switch" aria-checked={form.isActive} className={`hj-sw${form.isActive ? ' on' : ''}`} onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))} />
                </label>
                {formError && <div className="adm-error-banner">{formError}</div>}
              </div>
              <div className="modal-f">
                {editingId && <button type="button" className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--rose)' }} onClick={() => { handleDelete({ id: editingId, name: form.name }); resetForm(); }} disabled={deleteMutation.isPending}>Delete</button>}
                <button type="button" onClick={resetForm} disabled={isSaving} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={isSaving || !itemV.valid} className="btn btn-primary">{isSaving ? 'Saving…' : (editingId ? 'Save changes' : 'Add item')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {newSupplier && <SupplierForm onClose={() => setNewSupplier(false)} onSaved={(sp) => sp?.id && setMvSupplier(String(sp.id))} />}

      {/* Movement sheet */}
      <div className={`sheet-bk${movingItem ? ' open' : ''}`} onClick={closeMovement} />
      <aside className={`sheet${movingItem ? ' open' : ''}`}>
        {movingItem && (
          <>
            <div className="sheet-h">
              <div style={{ flex: 1 }}><div className="eyebrow" style={{ color: 'var(--primary)' }}>Stock movement</div><div className="h-2" style={{ marginTop: 2 }}>{movingItem.name}</div></div>
              <button className="icon-btn" onClick={closeMovement}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
            <form className="sheet-b g2-mv-form" onSubmit={handleMovementSubmit} noValidate>
              <div className="g2-onhand">
                <span className="g2-onhand-k">Current on hand</span>
                <span className="mono g2-onhand-v">{movingItem.quantity} {movingItem.unit}</span>
              </div>

              <div className="ff">
                <label id="mv-type-l">Movement type</label>
                <div className="chips" role="group" aria-labelledby="mv-type-l">
                  {MV_TYPES.map((t) => <button key={t.v} type="button" className={`chip2${mvType === t.v ? ' on' : ''}`} aria-pressed={mvType === t.v} onClick={() => setMvType(t.v)}>{t.label}</button>)}
                </div>
              </div>

              <Field label={`Quantity (${movingItem.unit})${mvType === 'adjustment' ? ' — signed' : ''}`} required {...mvForm.fieldProps('quantity')}>
                <input className="input" type="number" inputMode="decimal" step="any" value={mvQty} onChange={(e) => setMvQty(e.target.value)} placeholder="e.g. 10" />
              </Field>

              {mvType === 'purchase' && (
                <>
                  <Field label="Total cost paid (books an expense)" required={mvOnCredit} hint="What you paid (or owe) for this whole purchase, not a per-unit price. Unit cost is averaged automatically from purchase history." {...mvForm.fieldProps('totalCost')}>
                    <input className="input" type="number" inputMode="decimal" step="any" min="0" value={mvTotalCost} onChange={(e) => setMvTotalCost(e.target.value)} placeholder="0.00" />
                  </Field>

                  <Field label={`Supplier${mvOnCredit ? '' : ' (optional)'}`} required={mvOnCredit} {...mvForm.fieldProps('supplierId')}>
                    <select className="input" value={mvSupplier} onChange={(e) => { if (e.target.value === '__new') { setNewSupplier(true); return; } setMvSupplier(e.target.value); }}>
                      <option value="">No supplier</option>
                      {suppliers.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      <option value="__new">+ New supplier...</option>
                    </select>
                  </Field>

                  <label className="ff-row stm-credit" style={{ cursor: 'pointer' }}>
                    <span className="g2-credit-t"><b>Bought on credit (pay later)</b><span className="stm-k" style={{ display: 'block' }}>Nothing is paid now. It is owed to the supplier until you pay them in Expenses &rsaquo; Suppliers.</span></span>
                    <span role="switch" aria-checked={mvOnCredit} tabIndex={0} className={`hj-sw${mvOnCredit ? ' on' : ''}`}
                      onClick={() => setMvOnCredit((v) => !v)} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setMvOnCredit((v) => !v); } }} />
                  </label>

                  {!mvOnCredit && num(mvTotalCost) > 0 && (
                    <AccountField value={paidFrom} onChange={setMvAccount} {...mvForm.fieldProps('paidFrom')} />
                  )}
                </>
              )}

              <Field label="Note (optional)" {...mvForm.fieldProps('note')}>
                <input className="input" value={mvNote} onChange={(e) => setMvNote(e.target.value)} placeholder="Supplier, reason…" />
              </Field>

              {movementError && <div className="adm-error-banner">{movementError}</div>}
              <button className="btn btn-primary g2-mv-submit" type="submit" disabled={isMoving || !mvForm.valid}>{isMoving ? 'Recording…' : 'Record movement'}</button>

              <div className="field-l">Recent movements</div>
              {(log[movingItem.id] || []).length ? (log[movingItem.id]).map((m, idx) => (
                <div className="mv-item" key={idx}>
                  <span className="mdot" style={{ background: MV_COLOR[m.type] }} />
                  <span className="mv-main" style={{ textTransform: 'capitalize' }}>{m.type}</span>
                  <span className="mv-amt">{MV_SIGN[m.type]}{m.q}</span>
                  <span className="mv-when">{m.t}</span>
                </div>
              )) : <p className="empty-sub" style={{ textAlign: 'left' }}>No movements recorded this session.</p>}
            </form>
          </>
        )}
      </aside>
    </div>
  );
}
