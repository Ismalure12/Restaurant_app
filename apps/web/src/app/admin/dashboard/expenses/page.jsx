'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { useFormValidation } from '@/lib/formValidation';
import { expenseFormSchema } from '@/lib/schemas/expenses';
import Field from '@/components/admin/Field';
import AccountField from '@/components/admin/suppliers/AccountField';
import { reportSaveError } from '@/lib/saveError';
import useMoneyAccounts from '@/hooks/useMoneyAccounts';
import useAccess from '@/hooks/useAccess';
import { defaultPaidFrom } from '@/components/admin/AccountSelect';
import useConfirm from '@/hooks/useConfirm';
import SuppliersTab from '@/components/admin/suppliers/SuppliersTab';
import ExpenseCategoriesDialog from '@/components/admin/suppliers/ExpenseCategoriesDialog';
import { money } from '@/lib/money';
import IfCan from '@/components/admin/IfCan';
import { ActiveFilters, FilterSelect, FiltersButton } from '@/components/admin/reports/ReportKit';
import {
  Page, Toolbar, Button, Card, CardHeader, Chip, Kpi, KpiGrid, KpiSkeletons, Delta, SearchInput, Segmented,
  Table, Th, Td, Tr, EmptyRow, LoadMoreBar, RowSkeletons, ErrorState, NoAccess, Modal, ModalSpacer, Alert,
  inputCls, textareaCls, buttonCls,
} from '@/components/admin/ui';

const pad = (n) => String(n).padStart(2, '0');
const localISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const RANGES = [{ value: 'month', label: 'This month' }, { value: '30d', label: '30 days' }, { value: '90d', label: '90 days' }, { value: 'all', label: 'All time' }];
function rangeFrom(range) {
  const now = new Date();
  if (range === 'month') return localISO(new Date(now.getFullYear(), now.getMonth(), 1));
  if (range === '30d') return localISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
  if (range === '90d') return localISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89));
  return null;
}
const emptyForm = () => ({ category: '', amount: '', incurredAt: localISO(new Date()), note: '', paidFromAccountId: '' });
const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const monthYear = (d) => new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

// The topbar search links here with ?q= — the page opens already filtered.
// Keyed on q so a second search while on this page starts fresh.
export default function ExpensesRoute() {
  return <Suspense fallback={null}><ExpensesPageFromUrl /></Suspense>;
}
const TABS = [{ value: 'expenses', label: 'Expenses' }, { value: 'suppliers', label: 'Suppliers' }];
function ExpensesPageFromUrl() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = sp.get('q') || '';
  const tab = sp.get('tab') === 'suppliers' ? 'suppliers' : 'expenses';
  const go = (t) => router.replace(t === 'expenses' ? pathname : `${pathname}?tab=${t}`, { scroll: false });
  return (
    <Page>
      <Segmented label="Expenses" options={TABS} value={tab} onChange={go} className="self-start" />
      {tab === 'suppliers' ? <SuppliersTab /> : <ExpensesPage key={q} initialSearch={q} />}
    </Page>
  );
}

function ExpensesPage({ initialSearch = '' }) {
  const qc = useQueryClient();
  const { canAct } = useAccess();
  const canEdit = canAct('expenses');
  const { confirm, dialog } = useConfirm();
  const [search, setSearch] = useState(initialSearch);
  const [q, setQ] = useState(initialSearch);
  const [category, setCategory] = useState('');
  // A search hit may be older than this month — look across all dates.
  const [range, setRange] = useState(initialSearch ? 'all' : 'month');
  const [editing, setEditing] = useState(null); // null | 'new' | expense row
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [catsOpen, setCatsOpen] = useState(false);

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
      try {
        return { denied: false, ...(await fetchJson(`/api/admin/expenses?${params}`)) };
      } catch (err) {
        if (err.kind === 'forbidden') return { denied: true, expenses: [], nextCursor: null };
        throw err;
      }
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

  // Same filters as the list, every matching row (the API caps it).
  const csvHref = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (category) p.set('category', category);
    if (from) p.set('from', from);
    p.set('format', 'csv');
    return `/api/admin/expenses?${p}`;
  }, [q, category, from]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['expenses'] });
    qc.invalidateQueries({ queryKey: ['ins-expenses'] });
    qc.invalidateQueries({ queryKey: ['fin-summary'] });
  };

  const { accounts } = useMoneyAccounts();
  // Until the person picks one, a new expense comes out of Cash (the first cash account).
  const paidFromId = form.paidFromAccountId || defaultPaidFrom(accounts);
  const values = useMemo(() => ({ ...form, paidFromAccountId: paidFromId }), [form, paidFromId]);
  const fv = useFormValidation(expenseFormSchema, values);

  const save = useMutation({
    mutationFn: ({ id, payload }) => fetchJson(id ? `/api/admin/expenses/${id}` : '/api/admin/expenses', {
      method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }),
    onSuccess: (_d, v) => { notify.success(v.id ? 'Expense updated' : 'Expense added', { title: v.id ? 'Could not save the expense' : 'Could not add the expense' }); refresh(); closeForm(); },
    onError: (e, v) => reportSaveError(e, { title: v.id ? 'Could not save the expense' : 'Could not add the expense', form: fv, setBanner: setFormError }),
  });

  const remove = useMutation({
    mutationFn: (id) => fetchJson(`/api/admin/expenses/${id}`, { method: 'DELETE' }),
    onSuccess: () => { notify.success('Expense deleted'); refresh(); closeForm(); },
    onError: (e) => notify.error(e, { title: 'Could not delete the expense' }),
  });

  function openNew() { setForm(emptyForm()); setFormError(''); fv.reset(); setEditing('new'); }
  function openEdit(e) {
    setForm({ category: e.category, amount: String(Number(e.amount)), incurredAt: localISO(new Date(e.incurredAt)), note: e.note || '', paidFromAccountId: e.paidFromAccountId ? String(e.paidFromAccountId) : '' });
    setFormError(''); fv.reset();
    setEditing(e);
  }
  function closeForm() { setEditing(null); setFormError(''); fv.reset(); }

  const submit = (e) => {
    e.preventDefault(); setFormError('');
    if (!fv.check()) return;
    fv.setServerErrors({});
    save.mutate({
      id: editing === 'new' ? null : editing.id,
      payload: { category: form.category.trim(), amount: Number(form.amount), incurredAt: form.incurredAt || undefined, note: form.note.trim() || null, paidFromAccountId: Number(paidFromId) },
    });
  };

  const askDelete = async (row) => {
    const ok = await confirm({ title: 'Delete this expense?', body: `${row.category} · ${money(row.amount)} will be removed and profit figures recalculated. This cannot be undone.`, confirmLabel: `Delete ${money(row.amount)}` });
    if (ok) remove.mutate(row.id);
  };

  if (!list.isLoading && first?.denied) {
    return <NoAccess what="expenses" />;
  }

  const filtersOn = Boolean(q || category || range !== 'all');
  const topShare = top && Number(summary.last30Total) > 0 ? Math.round((Number(top.total) / Number(summary.last30Total)) * 100) : null;
  const busy = save.isPending || remove.isPending;

  return (
    <>
      {dialog}
      {catsOpen && <ExpenseCategoriesDialog onClose={() => setCatsOpen(false)} />}

      {list.isLoading && !summary ? <KpiSkeletons count={4} min={210} /> : summary && (
        <KpiGrid min={210}>
          <Kpi label="This month" value={money(summary.monthTotal)} foot={`${summary.monthCount} ${summary.monthCount === 1 ? 'entry' : 'entries'} so far`} onClick={() => setRange('month')} />
          <Kpi
            label="Last 30 days"
            value={money(summary.last30Total)}
            badge={summary.prev30Total != null && <Delta value={summary.last30Total} previous={summary.prev30Total} invert />}
            foot={summary.prev30Total != null ? `vs ${money(summary.prev30Total)} the 30 days before` : 'rolling total'}
            onClick={() => setRange('30d')}
          />
          <Kpi
            label="Top category · 30 days"
            value={<span className="font-mq text-[clamp(18px,1.8vw,22px)] font-semibold tracking-[-.02em] capitalize">{top?.category || '—'}</span>}
            foot={top ? `${money(top.total)}${topShare != null ? ` · ${topShare}%` : ''}` : 'No spending logged'}
            onClick={top ? () => { setCategory(top.category); setRange('30d'); } : undefined}
          />
          <Kpi
            label="All entries"
            value={Number(summary.totalCount).toLocaleString('en-US')}
            foot={summary.firstAt ? `since ${monthYear(summary.firstAt)}` : 'on record'}
            onClick={() => { setSearch(''); setCategory(''); setRange('all'); }}
          />
        </KpiGrid>
      )}

      <Toolbar>
        <Segmented label="Period" options={RANGES} value={range} onChange={setRange} />
        {/* Category sits in the one Filters control beside the period, never as its own select. */}
        <FiltersButton active={category ? 1 : 0} onClear={() => setCategory('')}>
          <FilterSelect label="Category" value={category} options={categories.map((c) => ({ value: c, label: c }))} onChange={setCategory} all="All categories" />
        </FiltersButton>
        <SearchInput className="flex-[1_1_220px] h-[38px]" value={search} onChange={setSearch} placeholder="Search category or note" aria-label="Search expenses" />
        <a href={csvHref} download className={buttonCls({ variant: 'secondary' })}>Export CSV</a>
        <IfCan page="expenses">
          <Button variant="secondary" onClick={() => setCatsOpen(true)}>Categories</Button>
          <Button variant="primary" icon="plus" onClick={openNew}>Add expense</Button>
        </IfCan>
      </Toolbar>
      <ActiveFilters items={category ? [{ key: 'category', label: `Category: ${category}`, onRemove: () => setCategory('') }] : []} />

      <Card className="overflow-hidden">
        <CardHeader
          title="Expenses"
          count={filtered ? filtered.count : undefined}
          sub={filtered ? `${money(filtered.total)} in view` : undefined}
          actions={filtersOn && <Button variant="ghost" size="xs" onClick={() => { setSearch(''); setCategory(''); setRange('all'); }}>Clear filters</Button>}
        />
        {list.isError ? (
          <div className="p-4"><ErrorState error={list.error} onRetry={() => list.refetch()} /></div>
        ) : list.isLoading ? <RowSkeletons rows={5} /> : (
          <Table maxH={480} minW={760} label="Expenses">
            <thead>
              <tr><Th>Date</Th><Th>Category</Th><Th>Note</Th><Th>Paid from</Th><Th>Recorded by</Th><Th align="right">Amount</Th>{canEdit && <Th align="right"><span className="sr-only">Actions</span></Th>}</tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <EmptyRow cols={canEdit ? 7 : 6}>
                  {filtersOn ? 'No expenses match. Try another search, category or period.' : 'No expenses yet. Log rent, supplies and wages so net profit stays honest.'}
                </EmptyRow>
              ) : rows.map((e) => (
                <Tr key={e.id} onClick={canEdit ? () => openEdit(e) : undefined} label={canEdit ? `Edit ${e.category} ${money(e.amount)}` : undefined}>
                  <Td mono className="whitespace-nowrap">{day(e.incurredAt)}</Td>
                  <Td><Chip tone="brand" dot={false} small className="capitalize">{e.category}</Chip></Td>
                  <Td className="text-mq-on-tint max-w-[320px]">{e.note || '—'}</Td>
                  <Td muted>{e.paidFrom || '—'}</Td>
                  <Td muted>{e.recordedBy || '—'}</Td>
                  <Td money>{money(e.amount)}</Td>
                  {canEdit && (
                    <Td align="right" className="whitespace-nowrap" onClick={(ev) => ev.stopPropagation()} onKeyDown={(ev) => ev.stopPropagation()}>
                      <Button variant="link" size="xs" onClick={() => openEdit(e)}>Edit</Button>
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {!list.isLoading && !list.isError && (
          <LoadMoreBar
            shown={rows.length}
            total={filtered?.count}
            hasMore={!!list.hasNextPage}
            loading={list.isFetchingNextPage}
            onMore={() => list.fetchNextPage()}
            noun={rows.length === 1 ? 'entry' : 'entries'}
          />
        )}
      </Card>

      {editing && (
        <Modal
          eyebrow={editing === 'new' ? 'New expense' : 'Edit expense'}
          title={editing === 'new' ? 'Log a cost' : <span className="capitalize">{editing.category}</span>}
          icon="expenses"
          onClose={closeForm}
          busy={busy}
          footer={(
            <>
              {editing !== 'new' && (
                <Button variant="danger-soft" size="lg" onClick={() => askDelete(editing)} disabled={busy}>{remove.isPending ? 'Deleting…' : 'Delete'}</Button>
              )}
              <ModalSpacer />
              <Button variant="secondary" size="lg" onClick={closeForm} disabled={busy}>Cancel</Button>
              <Button variant="primary" size="lg" type="submit" form="expense-form" disabled={busy || !fv.valid}>
                {save.isPending ? 'Saving…' : editing === 'new' ? 'Add expense' : 'Save changes'}
              </Button>
            </>
          )}
        >
          <form id="expense-form" onSubmit={submit} noValidate className="grid grid-cols-1 tab:grid-cols-2 gap-3.5">
            <Field className="tab:col-span-2" label="Category" required {...fv.fieldProps('category')}>
              <input className={inputCls({ size: 'lg' })} list="expense-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Rent, Supplies, Wages" />
            </Field>
            <datalist id="expense-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            {categories.length > 0 && (
              <div className="tab:col-span-2 -mt-1.5 flex flex-wrap gap-1.5">
                {categories.slice(0, 8).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, category: c })}
                    aria-pressed={form.category === c}
                    className={`h-7 px-2.5 rounded-full border text-xs font-semibold capitalize transition-colors ${form.category === c ? 'bg-mq-primary border-mq-primary text-white' : 'bg-white border-mq-line text-mq-body hover:bg-mq-canvas'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            <Field label="Amount ($)" required {...fv.fieldProps('amount')}>
              <input className={inputCls({ size: 'lg', mono: true })} type="number" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
            </Field>
            <Field label="Date" required {...fv.fieldProps('incurredAt')}>
              <input className={inputCls({ size: 'lg', mono: true })} type="date" value={form.incurredAt} max={localISO(new Date())} onChange={(e) => setForm({ ...form, incurredAt: e.target.value })} />
            </Field>
            <AccountField className="tab:col-span-2" value={paidFromId} onChange={(v) => setForm({ ...form, paidFromAccountId: v })} {...fv.fieldProps('paidFromAccountId')} />
            <Field className="tab:col-span-2" label="Note" {...fv.fieldProps('note')}>
              <textarea className={textareaCls('min-h-[72px]')} rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional — supplier, invoice number…" />
            </Field>
            {formError && <Alert tone="danger" className="tab:col-span-2">{formError}</Alert>}
          </form>
        </Modal>
      )}
    </>
  );
}
