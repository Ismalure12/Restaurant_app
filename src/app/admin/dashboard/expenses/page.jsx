'use client';

import { useState, useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchJson, parseApiError } from '@/lib/apiError';
import useConfirm from '@/hooks/useConfirm';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';

const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (n) => String(n).padStart(2, '0');
const localISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const RANGES = [{ v: 'month', l: 'This month' }, { v: '30d', l: '30 days' }, { v: '90d', l: '90 days' }, { v: 'all', l: 'All time' }];
function rangeFrom(range) {
  const now = new Date();
  if (range === 'month') return localISO(new Date(now.getFullYear(), now.getMonth(), 1));
  if (range === '30d') return localISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
  if (range === '90d') return localISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89));
  return null;
}
const emptyForm = () => ({ category: '', amount: '', incurredAt: localISO(new Date()), note: '' });
const WalletIc = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 12V8H6a2 2 0 0 1 0-4h12v4" /><path d="M4 6v12a2 2 0 0 0 2 2h14v-4" /><path d="M18 12a2 2 0 0 0 0 4h4v-4z" /></svg>;

export default function ExpensesPage() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [range, setRange] = useState('month');
  const [editing, setEditing] = useState(null); // null | 'new' | expense row
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const from = rangeFrom(range);
  const list = useInfiniteQuery({
    queryKey: ['expenses', { q, category, range }],
    initialPageParam: null,
    placeholderData: keepPreviousData,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (category) params.set('category', category);
      if (from) params.set('from', from);
      if (pageParam) params.set('cursor', pageParam);
      const res = await fetch(`/api/admin/expenses?${params}`);
      if (res.status === 403) return { denied: true, expenses: [], nextCursor: null };
      if (!res.ok) throw new Error('Failed to load expenses');
      return { denied: false, ...(await res.json()) };
    },
    getNextPageParam: (last) => last.nextCursor || undefined,
  });

  const pages = list.data?.pages || [];
  const first = pages[0];
  const rows = pages.flatMap((p) => p.expenses || []);
  const summary = first?.summary;
  const categories = first?.categories || [];
  const filtered = first?.filtered;
  const top = summary?.topCategories?.[0];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['expenses'] });
    qc.invalidateQueries({ queryKey: ['ins-expenses'] });
    qc.invalidateQueries({ queryKey: ['fin-summary'] });
  };

  const save = useMutation({
    mutationFn: ({ id, payload }) => fetchJson(id ? `/api/admin/expenses/${id}` : '/api/admin/expenses', {
      method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }),
    onSuccess: (_d, v) => { toast.success(v.id ? 'Expense updated' : 'Expense added'); refresh(); closeForm(); },
    onError: (e) => setFormError(parseApiError(e)),
  });

  const remove = useMutation({
    mutationFn: (id) => fetchJson(`/api/admin/expenses/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Expense deleted'); refresh(); },
    onError: (e) => toast.error(parseApiError(e)),
  });

  function openNew() { setForm(emptyForm()); setFormError(''); setEditing('new'); }
  function openEdit(e) {
    setForm({ category: e.category, amount: String(Number(e.amount)), incurredAt: localISO(new Date(e.incurredAt)), note: e.note || '' });
    setFormError('');
    setEditing(e);
  }
  function closeForm() { setEditing(null); setFormError(''); }

  const submit = (e) => {
    e.preventDefault(); setFormError('');
    const amount = Number(form.amount);
    if (!form.category.trim()) { setFormError('Category is required'); return; }
    if (!(amount > 0)) { setFormError('Enter an amount greater than zero'); return; }
    save.mutate({
      id: editing === 'new' ? null : editing.id,
      payload: { category: form.category.trim(), amount, incurredAt: form.incurredAt || undefined, note: form.note.trim() || null },
    });
  };

  const askDelete = async (row) => {
    const ok = await confirm({ title: 'Delete this expense?', body: `${row.category} · ${money(row.amount)} will be removed and profit figures recalculated. This cannot be undone.`, confirmLabel: 'Delete expense' });
    if (ok) remove.mutate(row.id);
  };

  if (!list.isLoading && first?.denied) {
    return (
      <div className="card card-pad-lg" style={{ maxWidth: 560 }}>
        <div className="empty">
          <div className="empty-ring">{WalletIc}</div>
          <p className="empty-title">No access</p>
          <p className="empty-sub">Only managers can view and manage expenses.</p>
        </div>
      </div>
    );
  }

  const filtersOn = Boolean(q || category || range !== 'all');

  return (
    <div className="wrap">
      {dialog}

      {list.isLoading && !summary ? <KpiRowSkeleton count={4} style={{ marginBottom: 16 }} /> : summary && (
        <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic gold">{WalletIc}</div><span className="kpi-k">This month</span></div>
            <div className="kpi-v"><small>$</small>{Math.round(Number(summary.monthTotal)).toLocaleString('en-US')}</div>
            <div className="kpi-foot"><span>{summary.monthCount} {summary.monthCount === 1 ? 'entry' : 'entries'} so far</span></div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18" /><path d="M18 9l-5 5-3-3-4 4" /></svg></div><span className="kpi-k">Last 30 days</span></div>
            <div className="kpi-v"><small>$</small>{Math.round(Number(summary.last30Total)).toLocaleString('en-US')}</div>
            <div className="kpi-foot"><span>rolling total</span></div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic rose"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><path d="M7 7h.01" /></svg></div><span className="kpi-k">Top category · 30 days</span></div>
            <div className="kpi-v is-text" style={{ textTransform: 'capitalize' }}>{top?.category || '—'}</div>
            <div className="kpi-foot"><span>{top ? money(top.total) : 'No spending logged'}</span></div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><div className="kpi-ic ink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /></svg></div><span className="kpi-k">All entries</span></div>
            <div className="kpi-v">{summary.totalCount.toLocaleString('en-US')}</div>
            <div className="kpi-foot"><span>on record</span></div>
          </div>
        </div>
      )}

      <div className="toolbar">
        <div className="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search category or note" aria-label="Search expenses" />
        </div>
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="seg">
          {RANGES.map((r) => <button key={r.v} className={range === r.v ? 'active' : ''} onClick={() => setRange(r.v)}>{r.l}</button>)}
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={openNew}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14" /></svg>Add expense
        </button>
      </div>

      <div className="card reveal" style={{ overflow: 'hidden', animationDelay: '.08s' }}>
        <div className="card-h">
          <div>
            <div className="ttl">Expenses</div>
            <div className="note">{filtered ? `${filtered.count} ${filtered.count === 1 ? 'entry' : 'entries'} · ${money(filtered.total)} in view` : 'Loading…'}</div>
          </div>
          {filtersOn && <button className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); setCategory(''); setRange('all'); }}>Clear filters</button>}
        </div>
        {list.isLoading ? (
          <RowsSkeleton rows={5} className="card-pad" />
        ) : list.isError ? (
          <div className="card-pad"><div className="adm-error-banner">Couldn&rsquo;t load expenses. Try again.</div></div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <div className="empty-ring">{WalletIc}</div>
            <p className="empty-title">{filtersOn ? 'No expenses match' : 'No expenses yet'}</p>
            <p className="empty-sub">{filtersOn ? 'Try another search, category or date range.' : 'Log rent, supplies and wages so net profit stays honest.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ marginTop: 12 }}>
              <thead><tr><th>Date</th><th>Category</th><th>Note</th><th>Recorded by</th><th className="num">Amount</th><th /></tr></thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(e.incurredAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td><span className="pill pill-gold" style={{ textTransform: 'capitalize' }}>{e.category}</span></td>
                    <td className="muted">{e.note || '—'}</td>
                    <td className="muted">{e.recordedBy || '—'}</td>
                    <td className="num strong">{money(e.amount)}</td>
                    <td className="act">
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(e)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => askDelete(e)} disabled={remove.isPending}>Delete</button>
                      </span>
                    </td>
                  </tr>
                ))}
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

      {editing && (
        <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget && !save.isPending) closeForm(); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={editing === 'new' ? 'Add expense' : 'Edit expense'}>
            <div className="modal-h">
              <div className="mt"><div className="eyebrow">{editing === 'new' ? 'New expense' : 'Edit expense'}</div><div className="h-1" style={{ marginTop: 3 }}>{editing === 'new' ? 'Log a cost' : editing.category}</div></div>
              <button className="icon-btn" onClick={closeForm} aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
            <form onSubmit={submit} style={{ display: 'contents' }}>
              <div className="modal-b">
                <div className="ff">
                  <label htmlFor="ex-cat">Category</label>
                  <input id="ex-cat" className="input" list="expense-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Rent, Supplies, Wages" autoFocus />
                  <datalist id="expense-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                </div>
                <div className="form-grid">
                  <div className="ff"><label htmlFor="ex-amt">Amount ($)</label><input id="ex-amt" className="input" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" /></div>
                  <div className="ff"><label htmlFor="ex-date">Date</label><input id="ex-date" className="input" type="date" value={form.incurredAt} max={localISO(new Date())} onChange={(e) => setForm({ ...form, incurredAt: e.target.value })} /></div>
                </div>
                <div className="ff"><label htmlFor="ex-note">Note</label><textarea id="ex-note" className="input" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional — supplier, invoice number…" /></div>
                {formError && <div className="adm-error-banner">{formError}</div>}
              </div>
              <div className="modal-f">
                <button type="button" className="btn btn-ghost" onClick={closeForm} disabled={save.isPending}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving…' : editing === 'new' ? 'Add expense' : 'Save changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
