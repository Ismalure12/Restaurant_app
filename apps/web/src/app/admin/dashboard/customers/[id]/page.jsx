'use client';

import { useState, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { useFormValidation } from '@/lib/formValidation';
import { customerSchema } from '@/lib/schemas/customers';
import Field from '@/components/admin/Field';
import IfCan from '@/components/admin/IfCan';
import StatementDoc from '@/components/admin/StatementDoc';
import { printHtml } from '@/components/admin/printShared';
import { RECEIPT_CSS } from '@/components/admin/receiptCss';
import { money } from '@/lib/money';
import {
  Page, Button, Card, CardHeader, Chip, Kpi, KpiGrid, KpiSkeletons, Popover, Skeleton, EmptyState, Overline,
  Table, Th, Td, Tr, EmptyRow, RowSkeletons, Modal, ModalSpacer, inputCls, cx,
} from '@/components/admin/ui';

const STATUS = {
  unpaid: ['danger', 'Unpaid'],
  partial: ['warn', 'Partial'],
  paid: ['ok', 'Paid'],
  void: ['off', 'Void'],
};
const date = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const isOpen = (inv) => inv.status === 'unpaid' || inv.status === 'partial';
// Unpaid or part-paid, and the due date has passed.
const overdue = (inv) => Boolean(inv.dueDate) && isOpen(inv) && new Date(inv.dueDate) < new Date();

function BackLink() {
  return <Button href="/admin/dashboard/customers" variant="ghost" size="sm" icon="chevLeft" className="self-start -ml-2">Customers</Button>;
}

export default function CustomerDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const custForm = useFormValidation(customerSchema, form);
  const [printing, setPrinting] = useState(false);
  const [stmt, setStmt] = useState(null); // { data, mode } while a statement is being printed
  const stmtRef = useRef(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => fetchJson(`/api/admin/customers/${id}`),
  });

  const updateMutation = useMutation({
    mutationFn: (payload) => fetchJson(`/api/admin/customers/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    onSuccess: () => { notify.success('Customer updated'); qc.invalidateQueries({ queryKey: ['customer', id] }); qc.invalidateQueries({ queryKey: ['customers'] }); setEditing(false); },
    onError: (err) => {
      if (err?.details && typeof err.details === 'object' && !Array.isArray(err.details)) custForm.setServerErrors(err.details);
      notify.error(err, { title: 'Could not update the customer' });
    },
  });

  // Statement: owing invoices only, or every invoice — fetched fresh, then
  // printed from a hidden iframe like the receipts.
  const printStatement = async (mode) => {
    setPrinting(true);
    try {
      const fresh = await qc.fetchQuery({
        queryKey: ['customer-statement', id, mode],
        queryFn: () => fetchJson(`/api/admin/customers/${id}/statement?status=${mode}`),
        staleTime: 0,
      });
      flushSync(() => setStmt({ data: fresh, mode }));
      const node = stmtRef.current;
      if (node) printHtml(node.innerHTML, `${RECEIPT_CSS}\n.st-inv { break-inside: avoid; } .st-head { font-size: 12.5px; }`);
    } catch (err) {
      notify.error(err, { title: 'Could not prepare the statement' });
    } finally { setPrinting(false); }
  };

  const startEdit = () => {
    setForm({ name: data.customer.name, phone: data.customer.phone, address: data.customer.address || '' });
    custForm.reset();
    setEditing(true);
  };

  const submitEdit = (e) => {
    e.preventDefault();
    if (!custForm.check() || updateMutation.isPending) return;
    custForm.setServerErrors(null);
    updateMutation.mutate({ name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() || null });
  };

  if (isLoading) {
    return (
      <Page narrow>
        <BackLink />
        <Skeleton className="h-14 w-2/3 rounded-lg" />
        <KpiSkeletons count={3} min={210} />
        <Card><RowSkeletons rows={4} /></Card>
      </Page>
    );
  }
  if (isError || !data) {
    return (
      <Page narrow>
        <BackLink />
        <Card>
          <EmptyState icon="customers" title="Customer not found" action={<Button href="/admin/dashboard/customers" variant="soft" size="sm">Back to customers</Button>}>
            This account may not exist.
          </EmptyState>
        </Card>
      </Page>
    );
  }

  const { customer, owedBalance, invoices } = data;
  // Counts come from the server; the history list is capped at the 50 most recent.
  const invoiceCount = data.invoiceCount ?? invoices.length;
  const openInvoices = data.openCount ?? invoices.filter(isOpen).length;
  // Take payment opens the OLDEST open invoice in view (the list is newest first).
  const oldestOpen = [...invoices].reverse().find(isOpen);
  const invoiceHref = (inv) => `/admin/dashboard/customers/${customer.id}/invoices/${inv.id}`;

  return (
    <Page narrow className="!max-w-[1100px]">
      <StatementDoc ref={stmtRef} data={stmt?.data} mode={stmt?.mode} />
      <BackLink />

      <div className="flex items-end gap-3.5 flex-wrap">
        <div className="flex flex-col gap-1 flex-[1_1_260px] min-w-0">
          <Overline>Customer account</Overline>
          <h2 className="m-0 text-2xl font-semibold tracking-[-.02em] leading-tight text-mq-ink break-words">{customer.name}</h2>
          <p className="m-0 text-[13px] text-mq-on-tint">
            <span className="font-mq-mono">{customer.phone}</span>{customer.address ? ` · ${customer.address}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Popover
            width={260}
            align="right"
            trigger={({ open, toggle }) => (
              <Button variant="secondary" size="lg" icon="print" iconRight="chevDown" onClick={toggle} disabled={printing} aria-haspopup="menu" aria-expanded={open}>
                {printing ? 'Preparing…' : 'Print statement'}
              </Button>
            )}
          >
            {({ close }) => (
              <div role="menu">
                {[['open', 'Owing only', 'Unpaid and part-paid invoices'], ['all', 'All invoices', 'Every invoice, paid or not']].map(([mode, title, text]) => (
                  <button
                    key={mode}
                    type="button"
                    role="menuitem"
                    onClick={() => { close(); printStatement(mode); }}
                    className="w-full flex flex-col items-start gap-0.5 px-2.5 py-2 rounded-lg text-left hover:bg-mq-soft"
                  >
                    <span className="text-[13.5px] font-semibold text-mq-ink">{title}</span>
                    <span className="text-xs text-mq-on-tint">{text}</span>
                  </button>
                ))}
              </div>
            )}
          </Popover>
          <IfCan page="customers">
            <Button variant="secondary" size="lg" icon="pen" onClick={startEdit}>Edit details</Button>
          </IfCan>
          {oldestOpen ? (
            <Button variant="primary" size="lg" href={`${invoiceHref(oldestOpen)}#pay`}>Take payment</Button>
          ) : (
            <IfCan page="pos"><Button variant="primary" size="lg" icon="pos" href={`/admin/dashboard/pos?customer=${customer.id}`}>Open in Register</Button></IfCan>
          )}
        </div>
      </div>

      <KpiGrid min={210}>
        <Kpi
          label="Owed balance"
          value={<span className={owedBalance > 0 ? 'text-mq-danger-ink' : undefined}>{money(owedBalance)}</span>}
          foot={owedBalance > 0 ? 'currently outstanding' : 'all settled'}
        />
        <Kpi label="Invoices" value={invoiceCount.toLocaleString('en-US')} foot={`${openInvoices} still open`} />
        <Kpi label="Customer since" value={<span className="font-mq text-xl font-semibold tracking-[-.01em]">{date(customer.createdAt)}</span>} foot="account created" />
      </KpiGrid>

      <Card className="overflow-hidden">
        <CardHeader title="Invoice history" sub={invoiceCount > invoices.length ? `Most recent ${invoices.length} of ${invoiceCount}` : 'Most recent 50 invoices'} />
        <Table maxH={460} minW={620} label="Invoice history">
          <thead>
            <tr><Th>Invoice</Th><Th align="right">Total</Th><Th align="right">Balance</Th><Th>Status</Th><Th>Due</Th><Th align="right"><span className="sr-only">Open</span></Th></tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <EmptyRow cols={6}>No invoices yet. Invoices appear here once this customer buys on account at the Register.</EmptyRow>
            ) : invoices.map((inv) => {
              const [tone, label] = STATUS[inv.status] || STATUS.unpaid;
              const late = overdue(inv);
              return (
                <Tr key={inv.id} onClick={() => router.push(invoiceHref(inv))} tone={late ? 'danger' : undefined} dim={inv.status === 'void'} label={`Open invoice ${inv.id}`}>
                  <Td>
                    <span className="flex flex-col gap-px">
                      <span className="font-mq-mono font-semibold text-mq-ink">#{inv.id}</span>
                      <span className="text-xs text-mq-on-tint">{date(inv.createdAt)}</span>
                    </span>
                  </Td>
                  <Td money>{money(inv.total)}</Td>
                  <Td money className={Number(inv.balance) > 0 && inv.status !== 'void' ? '!text-mq-danger-ink' : '!text-mq-muted'}>{money(inv.balance)}</Td>
                  <Td><Chip tone={tone} small strike={inv.status === 'void'}>{label}</Chip></Td>
                  <Td className="whitespace-nowrap">
                    <span className="flex flex-col gap-px">
                      <span className={cx(late && 'text-mq-danger-ink font-medium')}>{inv.dueDate ? date(inv.dueDate) : '—'}</span>
                      {late && <span className="text-[11.5px] font-semibold text-mq-danger-ink">Overdue</span>}
                    </span>
                  </Td>
                  <Td align="right"><span className="text-[12.5px] font-semibold text-mq-cta">Open</span></Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      {editing && (
        <Modal
          title={customer.name}
          eyebrow="Edit customer"
          icon="pen"
          onClose={() => setEditing(false)}
          busy={updateMutation.isPending}
          footer={(
            <>
              <ModalSpacer />
              <Button variant="secondary" size="lg" onClick={() => setEditing(false)} disabled={updateMutation.isPending}>Cancel</Button>
              <Button variant="primary" size="lg" type="submit" form="customer-edit" disabled={updateMutation.isPending || !custForm.valid}>{updateMutation.isPending ? 'Saving…' : 'Save changes'}</Button>
            </>
          )}
        >
          <form id="customer-edit" noValidate onSubmit={submitEdit} className="grid grid-cols-1 tab:grid-cols-2 gap-3.5">
            <Field label="Name" required {...custForm.fieldProps('name')}><input className={inputCls({ size: 'lg' })} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Phone" required {...custForm.fieldProps('phone')}><input className={inputCls({ size: 'lg', mono: true })} type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field className="tab:col-span-2" label="Address (optional)" {...custForm.fieldProps('address')}><input className={inputCls({ size: 'lg' })} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          </form>
        </Modal>
      )}
    </Page>
  );
}
