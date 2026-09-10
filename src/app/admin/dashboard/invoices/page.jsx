'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchJson, parseApiError } from '@/lib/apiError';
import CustomerPicker from '@/components/admin/CustomerPicker';

const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const STATUS_PILL = {
  unpaid: { cls: 'pill-rose', label: 'Unpaid' },
  partial: { cls: 'pill-amber', label: 'Partial' },
  paid: { cls: 'pill-green', label: 'Paid' },
  void: { cls: 'pill-ghost', label: 'Void' },
};
const emptyLine = () => ({ uid: Math.random().toString(36).slice(2, 9), description: '', quantity: 1, unitPrice: '' });
const emptyForm = {
  customerId: null, customer: null,
  tableNumber: '', dueDate: '', discount: '', note: '',
  lines: [emptyLine()],
};

export default function InvoicesPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', status, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (search.trim()) params.set('q', search.trim());
      const res = await fetch(`/api/admin/invoices?${params}`);
      if (res.status === 403) return { denied: true, invoices: [] };
      if (!res.ok) throw new Error('Failed to load invoices');
      return { denied: false, ...(await res.json()) };
    },
  });

  const accessDenied = data?.denied ?? false;
  const invoices = useMemo(() => data?.invoices ?? [], [data]);

  const kpis = useMemo(() => {
    const outstanding = invoices.filter((i) => i.status !== 'void' && i.status !== 'paid').reduce((s, i) => s + Number(i.balance), 0);
    const overdue = invoices.filter((i) => i.status !== 'void' && i.status !== 'paid' && i.dueDate && new Date(i.dueDate) < new Date()).length;
    const invoicedTotal = invoices.filter((i) => i.status !== 'void').reduce((s, i) => s + Number(i.total), 0);
    const collected = invoices.filter((i) => i.status !== 'void').reduce((s, i) => s + Number(i.amountPaid), 0);
    return { outstanding, overdue, invoicedTotal, collected };
  }, [invoices]);

  const createMutation = useMutation({
    mutationFn: (payload) => fetchJson('/api/admin/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: () => { toast.success('Invoice created'); qc.invalidateQueries({ queryKey: ['invoices'] }); resetForm(); },
    onError: (err) => setFormError(parseApiError(err)),
  });

  const resetForm = () => { setForm(emptyForm); setShowForm(false); setFormError(''); };

  const setLine = (uid, patch) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.uid === uid ? { ...l, ...patch } : l)) }));
  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }));
  const removeLine = (uid) => setForm((f) => ({ ...f, lines: f.lines.filter((l) => l.uid !== uid) }));

  const lineTotal = form.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const discountAmt = Number(form.discount) || 0;
  const formTotal = Math.max(0, lineTotal - discountAmt);

  const handleSubmit = (e) => {
    e.preventDefault(); setFormError('');
    if (!form.customerId) { setFormError('Select or create a customer'); return; }
    const items = form.lines
      .filter((l) => l.description.trim() && Number(l.quantity) > 0)
      .map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) || 0 }));
    if (items.length === 0) { setFormError('Add at least one line item'); return; }
    createMutation.mutate({
      customerId: form.customerId,
      items,
      discount: discountAmt,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
      tableNumber: form.tableNumber.trim() || null,
      note: form.note.trim() || null,
    });
  };

  if (!isLoading && accessDenied) {
    return (
      <div className="card card-pad-lg" style={{ maxWidth: 560 }}>
        <div className="empty">
          <div className="empty-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg></div>
          <p className="empty-title">No access</p>
          <p className="empty-sub">You don’t have permission to view invoices.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="kpi-row" style={{ marginBottom: 18 }}>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ic amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div><span className="kpi-k">Outstanding</span></div>
          <div className="kpi-v"><small>$</small>{kpis.outstanding.toFixed(0)}</div>
          <div className="kpi-foot"><span>owed by customers</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ic ink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg></div><span className="kpi-k">Invoiced total</span></div>
          <div className="kpi-v"><small>$</small>{kpis.invoicedTotal.toFixed(0)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ic green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg></div><span className="kpi-k">Collected</span></div>
          <div className="kpi-v"><small>$</small>{kpis.collected.toFixed(0)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ic rose"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg></div><span className="kpi-k">Overdue</span></div>
          <div className="kpi-v">{kpis.overdue}</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="search" style={{ width: 240 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer or phone…" />
        </div>
        <div className="seg">
          {['all', 'unpaid', 'partial', 'paid', 'void'].map((s) => (
            <button key={s} className={status === s ? 'active' : ''} onClick={() => setStatus(s)} style={{ textTransform: 'capitalize' }}>{s}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" /></svg>New invoice
        </button>
      </div>

      {isLoading ? (
        <div className="card" style={{ overflow: 'hidden' }}>{[1, 2, 3, 4].map((n) => <div key={n} className="sk" style={{ height: 52, margin: 12, borderRadius: 'var(--r-sm)' }} />)}</div>
      ) : invoices.length === 0 ? (
        <div className="card card-pad-lg">
          <div className="empty">
            <div className="empty-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg></div>
            <p className="empty-title">No invoices yet</p>
            <p className="empty-sub">Bill a customer who pays later from here, or from the Register&apos;s payment step.</p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Customer</th><th className="num">Total</th><th className="num">Balance</th><th>Status</th><th>Due</th><th>Created</th><th /></tr></thead>
              <tbody>
                {invoices.map((inv) => {
                  const st = STATUS_PILL[inv.status] || STATUS_PILL.unpaid;
                  const overdue = inv.status !== 'void' && inv.status !== 'paid' && inv.dueDate && new Date(inv.dueDate) < new Date();
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: 560, color: 'var(--ink)' }}>{inv.customerName || '—'}<div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 400 }}>{inv.customerPhone}</div></td>
                      <td className="num">{money(inv.total)}</td>
                      <td className="num" style={{ color: Number(inv.balance) > 0 ? 'var(--rose)' : 'var(--muted)' }}>{money(inv.balance)}</td>
                      <td><span className={`pill ${st.cls}`}><span className="pdot" />{st.label}</span></td>
                      <td style={{ color: overdue ? 'var(--rose)' : 'var(--muted)' }}>{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}</td>
                      <td style={{ color: 'var(--muted)' }}>{new Date(inv.createdAt).toLocaleDateString()}</td>
                      <td style={{ textAlign: 'right' }}><Link href={`/admin/dashboard/invoices/${inv.id}`} className="btn btn-ghost btn-sm">Open</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget) resetForm(); }}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-h">
              <div className="mt"><div className="eyebrow">New invoice</div><div className="h-1" style={{ marginTop: 3 }}>Bill a customer</div></div>
              <button className="icon-btn" onClick={resetForm} aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
              <div className="modal-b">
                <CustomerPicker
                  customerId={form.customerId}
                  customer={form.customer}
                  onChange={(c) => setForm({ ...form, customerId: c.customerId, customer: c.customer })}
                  disabled={createMutation.isPending}
                />

                <div className="field-l">Line items</div>
                {form.lines.map((l) => (
                  <div className="ff-row" key={l.uid} style={{ alignItems: 'flex-end' }}>
                    <div className="ff" style={{ flex: 2 }}><input className="input" placeholder="Description" value={l.description} onChange={(e) => setLine(l.uid, { description: e.target.value })} /></div>
                    <div className="ff" style={{ flex: 1 }}><input className="input" type="number" min="0" step="any" placeholder="Qty" value={l.quantity} onChange={(e) => setLine(l.uid, { quantity: e.target.value })} /></div>
                    <div className="ff" style={{ flex: 1 }}><input className="input" type="number" min="0" step="0.01" placeholder="Unit price" value={l.unitPrice} onChange={(e) => setLine(l.uid, { unitPrice: e.target.value })} /></div>
                    <button type="button" className="icon-btn" onClick={() => removeLine(l.uid)} disabled={form.lines.length === 1} aria-label="Remove line"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
                  </div>
                ))}
                <button type="button" className="btn btn-ghost btn-sm" onClick={addLine}>+ Add line</button>

                <div className="ff-row">
                  <div className="ff" style={{ flex: 1 }}><label>Discount</label><input className="input" type="number" min="0" step="0.01" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></div>
                  <div className="ff" style={{ flex: 1 }}><label>Due date (optional)</label><input className="input" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
                  <div className="ff" style={{ flex: 1 }}><label>Table (optional)</label><input className="input" value={form.tableNumber} onChange={(e) => setForm({ ...form, tableNumber: e.target.value })} /></div>
                </div>
                <div className="ff"><label>Note (optional)</label><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>

                <div className="tf-row total" style={{ marginTop: 4 }}><span>Total</span><span className="v">{money(formTotal)}</span></div>
                {formError && <div className="adm-error-banner">{formError}</div>}
              </div>
              <div className="modal-f">
                <button type="button" onClick={resetForm} disabled={createMutation.isPending} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="btn btn-primary">{createMutation.isPending ? 'Creating…' : 'Create invoice'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
