'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchJson, parseApiError } from '@/lib/apiError';
import useConfirm from '@/hooks/useConfirm';

const emptyItem = { name: '', unit: '', reorderLevel: '', costPerUnit: '', supplier: '', isActive: true };
const MV_TYPES = [
  { v: 'purchase', label: 'Purchase' },
  { v: 'usage', label: 'Usage' },
  { v: 'waste', label: 'Waste' },
  { v: 'adjustment', label: 'Adjust' },
];
const MV_COLOR = { purchase: 'var(--primary)', usage: 'var(--sky)', waste: 'var(--rose)', adjustment: 'var(--gold)' };
const MV_SIGN = { purchase: '+', usage: '−', waste: '−', adjustment: '=' };

function num(v) { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
const money = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function InventoryPage() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyItem);
  const [formError, setFormError] = useState('');

  const [movingId, setMovingId] = useState(null);
  const [mvType, setMvType] = useState('purchase');
  const [mvQty, setMvQty] = useState('');
  const [mvCost, setMvCost] = useState('');
  const [mvNote, setMvNote] = useState('');
  const [movementError, setMovementError] = useState('');
  const [log, setLog] = useState({});

  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const res = await fetch('/api/admin/inventory');
      if (res.status === 403) return { denied: true, items: [] };
      if (!res.ok) throw new Error('Failed to load inventory');
      const items = await res.json();
      return { denied: false, items: Array.isArray(items) ? items : [] };
    },
  });

  const accessDenied = data?.denied ?? false;
  const allItems = useMemo(() => data?.items ?? [], [data]);

  const statusOf = (it) => (Number(it.quantity) <= 0 ? 'out' : it.lowStock ? 'low' : 'ok');
  const lowCount = useMemo(() => allItems.filter((i) => statusOf(i) === 'low').length, [allItems]);
  const outCount = useMemo(() => allItems.filter((i) => statusOf(i) === 'out').length, [allItems]);
  const stockValue = useMemo(() => allItems.reduce((s, i) => s + Number(i.quantity) * Number(i.costPerUnit || 0), 0), [allItems]);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allItems.filter((i) => {
      if (lowOnly && statusOf(i) === 'ok') return false;
      if (q && !i.name.toLowerCase().includes(q) && !(i.supplier || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allItems, search, lowOnly]);

  const movingItem = useMemo(() => allItems.find((i) => i.id === movingId) || null, [allItems, movingId]);

  const saveMutation = useMutation({
    mutationFn: (payload) => fetchJson(
      editingId ? `/api/admin/inventory/${editingId}` : '/api/admin/inventory',
      { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    ),
    onMutate: () => toast.loading(editingId ? 'Saving…' : 'Adding item…', { id: 'inv-save' }),
    onSuccess: () => { toast.success(editingId ? 'Item updated' : 'Item added', { id: 'inv-save' }); qc.invalidateQueries({ queryKey: ['inventory'] }); resetForm(); },
    onError: (err) => { toast.dismiss('inv-save'); setFormError(parseApiError(err)); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => fetchJson(`/api/admin/inventory/${id}`, { method: 'DELETE' }),
    onMutate: () => toast.loading('Deleting…', { id: 'inv-del' }),
    onSuccess: () => { toast.success('Item deleted', { id: 'inv-del' }); qc.invalidateQueries({ queryKey: ['inventory'] }); },
    onError: (err) => toast.error(parseApiError(err), { id: 'inv-del' }),
  });

  const movementMutation = useMutation({
    mutationFn: ({ id, payload }) => fetchJson(`/api/admin/inventory/${id}/movements`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onMutate: () => toast.loading('Recording movement…', { id: 'inv-move' }),
    onSuccess: (_d, variables) => {
      toast.success('Stock updated', { id: 'inv-move' });
      const { id, payload } = variables;
      setLog((prev) => ({ ...prev, [id]: [{ type: payload.type, q: payload.quantity, t: 'just now' }, ...(prev[id] || [])] }));
      setMvQty(''); setMvCost(''); setMvNote('');
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (err) => { toast.dismiss('inv-move'); setMovementError(parseApiError(err)); },
  });

  const resetForm = () => { setForm(emptyItem); setEditingId(null); setShowForm(false); setFormError(''); };
  const closeMovement = () => { setMovingId(null); setMvType('purchase'); setMvQty(''); setMvCost(''); setMvNote(''); setMovementError(''); };

  const handleSubmit = (e) => {
    e.preventDefault(); setFormError('');
    if (!form.name.trim() || !form.unit.trim()) { setFormError('Name and unit are required'); return; }
    saveMutation.mutate({ name: form.name.trim(), unit: form.unit.trim(), reorderLevel: num(form.reorderLevel), costPerUnit: num(form.costPerUnit), supplier: form.supplier.trim() || null, isActive: form.isActive });
  };

  const handleEdit = (item) => {
    setForm({ name: item.name, unit: item.unit, reorderLevel: item.reorderLevel ?? '', costPerUnit: item.costPerUnit ?? '', supplier: item.supplier ?? '', isActive: item.isActive });
    setEditingId(item.id); setShowForm(true); setFormError('');
  };

  const handleDelete = async (item) => {
    const ok = await confirm({ title: `Delete ${item.name}?`, body: 'This removes the item and its movement history.', confirmLabel: 'Delete item' });
    if (ok) deleteMutation.mutate(item.id);
  };

  const handleMovementSubmit = (e) => {
    e.preventDefault(); setMovementError('');
    const magnitude = num(mvQty);
    if (magnitude == null || magnitude === 0) { setMovementError('Enter a non-zero quantity'); return; }
    movementMutation.mutate({
      id: movingItem.id,
      payload: { type: mvType, quantity: magnitude, unitCost: mvType === 'purchase' ? num(mvCost) : null, note: mvNote.trim() || null },
    });
  };

  const openMovement = (item) => { setMovingId(item.id); setMvType('purchase'); setMvQty(''); setMvCost(''); setMvNote(''); setMovementError(''); };

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
                      <td className="num">{it.costPerUnit ? money(it.costPerUnit) : '—'}</td>
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

      {/* Item modal */}
      {showForm && (
        <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget) resetForm(); }}>
          <div className="modal">
            <div className="modal-h">
              <div className="mt"><div className="eyebrow">{editingId ? 'Edit item' : 'New item'}</div><div className="h-1" style={{ marginTop: 3 }}>{editingId ? form.name || 'Item' : 'Add inventory item'}</div></div>
              <button className="icon-btn" onClick={resetForm} aria-label="Close" disabled={isSaving}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
              <div className="modal-b">
                <div className="ff"><label>Item name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
                <div className="ff-row">
                  <div className="ff" style={{ flex: 1 }}><label>Unit</label><input className="input" placeholder="kg, L, pcs" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} required /></div>
                  <div className="ff" style={{ flex: 1 }}><label>Reorder level</label><input className="input" type="number" step="any" min="0" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} /></div>
                </div>
                <div className="ff-row">
                  <div className="ff" style={{ flex: 1 }}><label>Cost / unit</label><input className="input" type="number" step="any" min="0" value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: e.target.value })} /></div>
                  <div className="ff" style={{ flex: 1 }}><label>Supplier</label><input className="input" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></div>
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
                <button type="submit" disabled={isSaving} className="btn btn-primary">{isSaving ? 'Saving…' : (editingId ? 'Save changes' : 'Add item')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Movement sheet */}
      <div className={`sheet-bk${movingItem ? ' open' : ''}`} onClick={closeMovement} />
      <aside className={`sheet${movingItem ? ' open' : ''}`}>
        {movingItem && (
          <>
            <div className="sheet-h">
              <div style={{ flex: 1 }}><div className="eyebrow" style={{ color: 'var(--primary)' }}>Stock movement</div><div className="h-2" style={{ marginTop: 2 }}>{movingItem.name}</div></div>
              <button className="icon-btn" onClick={closeMovement}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
            <form className="sheet-b" onSubmit={handleMovementSubmit}>
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Current on hand</span>
                <span className="mono" style={{ fontSize: 18, fontWeight: 680 }}>{movingItem.quantity} {movingItem.unit}</span>
              </div>

              <div className="field-l">Movement type</div>
              <div className="chips">
                {MV_TYPES.map((t) => <button key={t.v} type="button" className={`chip2${mvType === t.v ? ' on' : ''}`} onClick={() => setMvType(t.v)}>{t.label}</button>)}
              </div>

              <div className="field-l">Quantity ({movingItem.unit}){mvType === 'adjustment' ? ' — signed' : ''}</div>
              <input className="input" type="number" step="any" value={mvQty} onChange={(e) => setMvQty(e.target.value)} placeholder="e.g. 10" />

              {mvType === 'purchase' && (<><div className="field-l">Cost / unit (books an expense)</div><input className="input" type="number" step="any" min="0" value={mvCost} onChange={(e) => setMvCost(e.target.value)} placeholder="0.00" /></>)}

              <div className="field-l">Note (optional)</div>
              <input className="input" value={mvNote} onChange={(e) => setMvNote(e.target.value)} placeholder="Supplier, reason…" />

              {movementError && <div className="adm-error-banner" style={{ marginTop: 12 }}>{movementError}</div>}
              <button className="btn btn-primary" type="submit" style={{ width: '100%', height: 44, marginTop: 20 }} disabled={isMoving}>{isMoving ? 'Recording…' : 'Record movement'}</button>

              <div className="field-l">Recent movements</div>
              {(log[movingItem.id] || []).length ? (log[movingItem.id]).map((m, idx) => (
                <div className="mv-item" key={idx}>
                  <span className="mdot" style={{ background: MV_COLOR[m.type] }} />
                  <span style={{ textTransform: 'capitalize', flex: 1 }}>{m.type}</span>
                  <span className="mono" style={{ fontWeight: 600 }}>{MV_SIGN[m.type]}{m.q}</span>
                  <span style={{ color: 'var(--faint)', fontSize: 11 }}>{m.t}</span>
                </div>
              )) : <p className="empty-sub" style={{ textAlign: 'left' }}>No movements recorded this session.</p>}
            </form>
          </>
        )}
      </aside>
    </div>
  );
}
