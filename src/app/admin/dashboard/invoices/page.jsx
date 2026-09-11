'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchJson, parseApiError } from '@/lib/apiError';
import CustomerPicker from '@/components/admin/CustomerPicker';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (n) => Math.round(Number(n || 0)).toLocaleString('en-US');
const STATUS_PILL = {
  unpaid: { cls: 'pill-rose', label: 'Unpaid' },
  partial: { cls: 'pill-amber', label: 'Partial' },
  paid: { cls: 'pill-green', label: 'Paid' },
  void: { cls: 'pill-ghost', label: 'Void' },
};
const FILTERS = [{ v: 'all', l: 'All' }, { v: 'unpaid', l: 'Unpaid' }, { v: 'partial', l: 'Partial' }, { v: 'paid', l: 'Paid' }, { v: 'void', l: 'Void' }];
const emptyLine = () => ({ uid: Math.random().toString(36).slice(2, 9), description: '', quantity: 1, unitPrice: '' });
const emptyForm = () => ({ customerId: null, customer: null, tableNumber: '', dueDate: '', discount: '', note: '', lines: [emptyLine()] });
const DocIc = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h4" /></svg>;
const isOverdue = (inv) => inv.status !== 'void' && inv.status !== 'paid' && inv.dueDate && new Date(inv.dueDate) < new Date();

export default function InvoicesPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const list = useInfiniteQuery({
    queryKey: ['invoices', status, q],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (q) params.set('q', q);
      if (pageParam) params.set('cursor', pageParam);
      const res = await fetch(`/api/admin/invoices?${params}`);
      if (res.status === 403) return { denied: true, invoices: [], nextCursor: null };
      if (!res.ok) throw new Error('Failed to load invoices');
      return { denied: false, ...(await res.json()) };
    },
    getNextPageParam: (last) => last.nextCursor || undefined,
  });

  const { isLoading } = list;
  const pages = list.data?.pages || [];
  const accessDenied = pages[0]?.denied ?? false;
  const invoices = pages.flatMap((p) => p.invoices || []);

  // Totals cover the whole filtered set and come from the server — the list is
  // paginated, so summing the loaded rows would undercount past the first page.
  const s = pages[0]?.summary;
  const kpis = {
    outstanding: Number(s?.outstanding || 0),
    openCount: s?.openCount ?? 0,
    overdue: s?.overdue ?? 0,
    invoicedTotal: Number(s?.invoicedTotal || 0),
    collected: Number(s?.collected || 0),
    count: s?.count ?? 0,
  };

  const createMutation = useMutation({
    mutationFn: (payload) => fetchJson('/api/admin/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: () => { toast.success('Invoice created'); qc.invalidateQueries({ queryKey: ['invoices'] }); qc.invalidateQueries({ queryKey: ['customers'] }); resetForm(); },
    onError: (err) => setFormError(parseApiError(err)),
  });

  function resetForm() { setForm(emptyForm()); setShowForm(false); setFormError(''); }

  const setLine = (uid, patch) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.uid === uid ? { ...l, ...patch } : l)) }));
  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }));
  const removeLine = (uid) => setForm((f) => ({ ...f, lines: f.lines.filter((l) => l.uid !== uid) }));

  const lineTotal = form.lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const discountAmt = Math.min(Number(form.discount) || 0, lineTotal);
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
      discount: Number(form.discount) || 0,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
      tableNumber: form.tableNumber.trim() || null,
      note: form.note.trim() || null,
    });
  };

  if (!isLoading && accessDenied) {
    return (
      <div className="card card-pad-lg" style={{ maxWidth: 560 }}>
        <div className="empty">
          <div className="empty-ring">{DocIc}</div>
          <p className="empty-title">No access</p>
          <p className="empty-sub">You don&rsquo;t have permission to view invoices.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      {isLoading ? <KpiRowSkeleton count={4} style={{ marginBottom: 16 }} /> : (
        <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div><span className="kpi-k">Outstanding</span></div>
            <div className="kpi-v"><small>$</small>{whole(kpis.outstanding)}</div>
            <div className="kpi-foot"><span>{kpis.openCount} open invoices</span></div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic ink">{DocIc}</div><span className="kpi-k">Invoiced total</span></div>
            <div className="kpi-v"><small>$</small>{whole(kpis.invoicedTotal)}</div>
            <div className="kpi-foot"><span>{kpis.count} invoices{status !== 'all' ? ' in this filter' : ''}</span></div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic green"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg></div><span className="kpi-k">Collected</span></div>
            <div className="kpi-v"><small>$</small>{whole(kpis.collected)}</div>
            <div className="kpi-foot"><span>payments received</span></div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><div className={`kpi-ic ${kpis.overdue > 0 ? 'rose' : 'ink'}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg></div><span className="kpi-k">Overdue</span></div>
            <div className="kpi-v">{kpis.overdue}</div>
            <div className="kpi-foot"><span>{kpis.overdue > 0 ? 'past their due date' : 'nothing overdue'}</span></div>
          </div>
        </div>
      )}

      <div className="toolbar">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer or phone" aria-label="Search invoices" />
        </div>
        <div className="seg">
          {FILTERS.map((f) => <button key={f.v} className={status === f.v ? 'active' : ''} onClick={() => setStatus(f.v)}>{f.l}</button>)}
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" /></svg>New invoice
        </button>
      </div>

      <div className="card reveal" style={{ overflow: 'hidden', animationDelay: '.08s' }}>
        {isLoading ? (
          <RowsSkeleton rows={5} className="card-pad" />
        ) : invoices.length === 0 ? (
          <div className="empty">
            <div className="empty-ring">{DocIc}</div>
            <p className="empty-title">{q || status !== 'all' ? 'No matching invoices' : 'No invoices yet'}</p>
            <p className="empty-sub">{q || status !== 'all' ? 'Try another search or filter.' : 'Bill a customer who pays later from here, or from the Register’s payment step.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ marginTop: 12 }}>
              <thead><tr><th>Customer</th><th className="num">Total</th><th className="num">Balance</th><th>Status</th><th>Due</th><th /></tr></thead>
              <tbody>
                {invoices.map((inv) => {
                  const st = STATUS_PILL[inv.status] || STATUS_PILL.unpaid;
                  const overdue = isOverdue(inv);
                  return (
                    <tr key={inv.id}>
                      <td><div className="strong" style={{ color: 'var(--ink)', fontWeight: 560 }}>{inv.customerName || '—'}</div><div className="note mono">#{inv.id} · {inv.customerPhone}</div></td>
                      <td className="num">{money(inv.total)}</td>
                      <td className="num" style={{ color: Number(inv.balance) > 0 ? 'var(--rose)' : 'var(--muted)' }}>{money(inv.balance)}</td>
                      <td><span className={`pill ${st.cls}`}><span className="pdot" />{st.label}</span></td>
                      <td style={{ color: overdue ? 'var(--rose)' : 'var(--muted)' }}>{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}{overdue && <div className="note" style={{ color: 'var(--rose)' }}>overdue</div>}</td>
                      <td className="act"><Link href={`/admin/dashboard/customers/${inv.customerId}/invoices/${inv.id}?from=invoicing`} className="btn btn-ghost btn-sm">Open</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {list.hasNextPage && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>{list.isFetchingNextPage ? 'Loading…' : 'Load more'}</button>
        </div>
      )}

      {showForm && (
        <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget) resetForm(); }}>
          <div className="modal" style={{ width: 'min(620px, 100%)' }} role="dialog" aria-modal="true" aria-label="New invoice">
            <div className="modal-h">
              <div className="mt"><div className="eyebrow">New invoice</div><div className="h-1" style={{ marginTop: 3 }}>Bill a customer</div></div>
              <button className="icon-btn" onClick={resetForm} aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
              <div className="modal-b">
                <div className="ff">
                  <label>Customer</label>
                  <CustomerPicker
                    customerId={form.customerId}
                    customer={form.customer}
                    onChange={(c) => setForm((f) => ({ ...f, customerId: c.customerId, customer: c.customer }))}
                    disabled={createMutation.isPending}
                  />
                </div>

                <div className="ff">
                  <label>Line items</label>
                  <div className="line-ed-h"><span>Description</span><span>Qty</span><span>Unit price</span><span /></div>
                  <div className="lines">
                    {form.lines.map((l) => (
                      <div className="line-ed" key={l.uid}>
                        <input className="input" placeholder="Description" aria-label="Description" value={l.description} onChange={(e) => setLine(l.uid, { description: e.target.value })} />
                        <input className="input" type="number" min="0" step="any" placeholder="Qty" aria-label="Quantity" value={l.quantity} onChange={(e) => setLine(l.uid, { quantity: e.target.value })} />
                        <input className="input" type="number" min="0" step="0.01" placeholder="0.00" aria-label="Unit price" value={l.unitPrice} onChange={(e) => setLine(l.uid, { unitPrice: e.target.value })} />
                        <button type="button" className="icon-btn" onClick={() => removeLine(l.uid)} disabled={form.lines.length === 1} aria-label="Remove line"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
                      </div>
                    ))}
                  </div>
                  <div><button type="button" className="btn btn-ghost btn-sm" onClick={addLine}>+ Add line</button></div>
                </div>

                <div className="form-grid">
                  <div className="ff"><label htmlFor="i-disc">Discount ($)</label><input id="i-disc" className="input" type="number" min="0" step="0.01" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></div>
                  <div className="ff"><label htmlFor="i-due">Due date</label><input id="i-due" className="input" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
                  <div className="ff"><label htmlFor="i-table">Table</label><input id="i-table" className="input" value={form.tableNumber} onChange={(e) => setForm({ ...form, tableNumber: e.target.value })} placeholder="Optional" /></div>
                </div>
                <div className="ff"><label htmlFor="i-note">Note</label><input id="i-note" className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional" /></div>

                <div className="od-tot boxed">
                  <div className="r"><span>Subtotal</span><span className="mono">{money(lineTotal)}</span></div>
                  {discountAmt > 0 && <div className="r"><span>Discount</span><span className="mono rose">−{money(discountAmt)}</span></div>}
                  <div className="r t"><span>Total due</span><span className="mono">{money(formTotal)}</span></div>
                </div>
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
