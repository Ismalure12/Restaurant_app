'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { reportSaveError } from '@/lib/saveError';
import { useFormValidation } from '@/lib/formValidation';
import { customerSchema } from '@/lib/schemas/customers';
import Field from '@/components/admin/Field';
import IfCan from '@/components/admin/IfCan';
import { money } from '@/lib/money';
import {
  Page, Toolbar, Button, Card, Kpi, KpiGrid, KpiSkeletons, SearchInput, Segmented,
  Table, Th, Td, Tr, EmptyRow, LoadMoreBar, RowSkeletons, ErrorState, NoAccess, Modal, ModalSpacer, inputCls,
} from '@/components/admin/ui';

const num = (n) => Number(n || 0).toLocaleString('en-US');
const since = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const emptyForm = { name: '', phone: '', address: '' };
const SHOW = [{ value: 'all', label: 'All' }, { value: 'owing', label: 'Owing' }, { value: 'overdue', label: 'Overdue' }];

// ?owing=1 (old Invoicing link, Financial report) / ?overdue=1 open the list
// already filtered.
export default function CustomersRoute() {
  return <Suspense fallback={null}><CustomersFromUrl /></Suspense>;
}
function CustomersFromUrl() {
  const sp = useSearchParams();
  return <CustomersPage initialShow={sp.get('overdue') === '1' ? 'overdue' : sp.get('owing') === '1' ? 'owing' : 'all'} />;
}

/**
 * Money › Customers — back-office account customers (buy On account at the
 * Register, pay their invoices later). Invoices are only created at the
 * Register, so "Open in Register" starts a sale for this customer.
 */
function CustomersPage({ initialShow = 'all' }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [show, setShow] = useState(initialShow);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const custForm = useFormValidation(customerSchema, form);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Business-wide KPIs come from the unfiltered first page, fetched on their
  // own so they stay put while the list below is searched or filtered.
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['customers', 'summary'],
    queryFn: () => fetchJson('/api/admin/customers?limit=1'),
    retry: false,
  });
  const summary = summaryData?.summary;

  const list = useInfiniteQuery({
    queryKey: ['customers', 'list', q, show],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (show === 'owing') params.set('owing', '1');
      if (show === 'overdue') params.set('overdue', '1');
      if (pageParam) params.set('cursor', pageParam);
      try {
        return { denied: false, ...(await fetchJson(`/api/admin/customers?${params}`)) };
      } catch (err) {
        if (err?.kind === 'forbidden') return { denied: true, customers: [], nextCursor: null };
        throw err;
      }
    },
    getNextPageParam: (last) => last.nextCursor || undefined,
  });

  const pages = list.data?.pages || [];
  const accessDenied = pages[0]?.denied ?? false;
  const customers = pages.flatMap((p) => p.customers || []);

  const createMutation = useMutation({
    mutationFn: (payload) => fetchJson('/api/admin/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: () => { notify.success('Customer created', { title: 'Could not create the customer' }); qc.invalidateQueries({ queryKey: ['customers'] }); resetForm(); },
    onError: (err) => reportSaveError(err, { form: custForm, title: 'Could not create the customer' }),
  });

  function resetForm() { setForm(emptyForm); setShowForm(false); custForm.reset(); }

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!custForm.check() || createMutation.isPending) return;
    custForm.setServerErrors(null);
    createMutation.mutate({ name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() || null });
  };

  if (!list.isLoading && accessDenied) {
    return <Page><NoAccess what="customers" /></Page>;
  }

  const emptyText = q
    ? `No customer matches “${q}”. Try a different name or phone number.`
    : show === 'overdue' ? 'No customer has an overdue invoice.'
      : show === 'owing' ? 'Nobody owes anything right now.'
        : 'No customers yet. Customers appear here once you sell to one On account, or create one directly.';

  return (
    <Page>
      {summaryLoading ? <KpiSkeletons count={4} min={210} /> : summary && (
        <KpiGrid min={210}>
          <Kpi label="Total customers" value={num(summary.totalCustomers)} foot="accounts on file" onClick={() => setShow('all')} />
          <Kpi label="Customers owing" value={num(summary.customersWithBalance)} foot={`of ${num(summary.totalCustomers)} accounts`} onClick={() => setShow('owing')} />
          <Kpi
            label="Total outstanding"
            value={money(summary.totalOutstanding)}
            foot={summary.openInvoices != null ? `on ${num(summary.openInvoices)} open ${summary.openInvoices === 1 ? 'invoice' : 'invoices'}` : 'owed across all customers'}
            onClick={() => setShow('owing')}
          />
          <Kpi
            label="Overdue invoices"
            value={<span className={summary.overdueInvoices > 0 ? 'text-mq-danger-ink' : undefined}>{num(summary.overdueInvoices)}</span>}
            foot={summary.overdueAmount != null ? `${money(summary.overdueAmount)} past due` : 'past their due date'}
            onClick={() => setShow('overdue')}
          />
        </KpiGrid>
      )}

      <Toolbar>
        <SearchInput className="flex-[1_1_220px] h-[38px]" value={search} onChange={setSearch} placeholder="Search by name or phone" aria-label="Search customers" />
        <Segmented label="Show" options={SHOW} value={show} onChange={setShow} />
        <IfCan page="customers">
          <Button variant="primary" icon="plus" onClick={() => { resetForm(); setShowForm(true); }}>New customer</Button>
        </IfCan>
      </Toolbar>

      <Card className="overflow-hidden">
        {list.isError ? (
          <div className="p-4"><ErrorState error={list.error} onRetry={() => list.refetch()} /></div>
        ) : list.isLoading ? <RowSkeletons rows={5} /> : (
          <Table maxH={520} minW={720} label="Customers">
            <thead>
              <tr><Th>Name</Th><Th>Phone</Th><Th align="right">Owed</Th><Th align="right">Invoices</Th><Th>Since</Th><Th align="right"><span className="sr-only">Action</span></Th></tr>
            </thead>
            <tbody>
              {customers.length === 0 ? <EmptyRow cols={6}>{emptyText}</EmptyRow> : customers.map((c) => {
                const detail = `/admin/dashboard/customers/${c.id}`;
                return (
                  <Tr key={c.id} onClick={() => router.push(detail)} label={`Open ${c.name}`}>
                    <Td strong>{c.name}</Td>
                    <Td mono>{c.phone}</Td>
                    <Td money className={c.owedBalance > 0 ? '!text-mq-danger-ink' : '!text-mq-muted'}>{money(c.owedBalance)}</Td>
                    <Td money className="!font-normal">{num(c.invoiceCount)}</Td>
                    <Td className="whitespace-nowrap">{since(c.createdAt)}</Td>
                    <Td align="right" className="whitespace-nowrap" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      {c.owedBalance > 0 ? (
                        <Button variant="link" size="xs" href={detail}>Take payment</Button>
                      ) : (
                        <IfCan page="pos"><Button variant="link" size="xs" href={`/admin/dashboard/pos?customer=${c.id}`}>Open in Register</Button></IfCan>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {!list.isLoading && !list.isError && (
          <LoadMoreBar
            shown={customers.length}
            total={!q && show === 'all' ? summary?.totalCustomers : undefined}
            hasMore={!!list.hasNextPage}
            loading={list.isFetchingNextPage}
            onMore={() => list.fetchNextPage()}
            noun={customers.length === 1 ? 'customer' : 'customers'}
          />
        )}
      </Card>

      {showForm && (
        <Modal
          title="Add a customer account"
          eyebrow="New customer"
          icon="user"
          onClose={resetForm}
          busy={createMutation.isPending}
          footer={(
            <>
              <ModalSpacer />
              <Button variant="secondary" size="lg" onClick={resetForm} disabled={createMutation.isPending}>Cancel</Button>
              <Button variant="primary" size="lg" type="submit" form="customer-new" disabled={createMutation.isPending || !custForm.valid}>{createMutation.isPending ? 'Creating…' : 'Create customer'}</Button>
            </>
          )}
        >
          <form id="customer-new" noValidate onSubmit={handleSubmit} className="grid grid-cols-1 tab:grid-cols-2 gap-3.5">
            <Field label="Name" required {...custForm.fieldProps('name')}><input className={inputCls({ size: 'lg' })} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Phone" required {...custForm.fieldProps('phone')}><input className={inputCls({ size: 'lg', mono: true })} type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field className="tab:col-span-2" label="Address (optional)" {...custForm.fieldProps('address')}><input className={inputCls({ size: 'lg' })} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          </form>
        </Modal>
      )}
    </Page>
  );
}
