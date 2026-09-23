'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { useFormValidation } from '@/lib/formValidation';
import { supplierFormSchema, supplierPaymentSchema } from '@/lib/schemas/inventory';
import Field from '@/components/admin/Field';
import AccountField from './AccountField';
import { reportSaveError } from '@/lib/saveError';
import { defaultPaidFrom } from '@/components/admin/AccountSelect';
import useMoneyAccounts from '@/hooks/useMoneyAccounts';
import useSuppliers from '@/hooks/useSuppliers';
import useAccess from '@/hooks/useAccess';
import IfCan from '@/components/admin/IfCan';
import { money } from '@/lib/money';
import {
  Toolbar, Button, Card, CardHeader, Chip, Kpi, KpiGrid, KpiSkeletons, Drawer, Overline, Alert,
  Table, Th, Td, Tr, EmptyRow, RowSkeletons, ErrorState, Modal, ModalSpacer, inputCls,
} from '@/components/admin/ui';

const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const JSON_H = { 'Content-Type': 'application/json' };

/** Expenses > Suppliers: who we owe, credit purchases, supplier payments. */
export default function SuppliersTab() {
  const { suppliers, totalOwed, isLoading, isError, error, refetch } = useSuppliers();
  const { canAct } = useAccess();
  const canEdit = canAct('expenses');
  const [editing, setEditing] = useState(null); // null | 'new' | supplier
  const [openId, setOpenId] = useState(null);
  const [paying, setPaying] = useState(null); // supplier row being paid from the table
  const owing = suppliers.filter((s) => s.owed > 0).length;
  const active = suppliers.filter((s) => s.isActive).length;

  return (
    <>
      {isLoading ? <KpiSkeletons count={3} min={210} /> : (
        <KpiGrid min={210}>
          <Kpi
            label="We owe suppliers"
            value={<span className={totalOwed > 0 ? 'text-mq-warn-ink' : undefined}>{money(totalOwed)}</span>}
            foot={owing ? `across ${owing} ${owing === 1 ? 'supplier' : 'suppliers'}` : 'nothing owed'}
          />
          <Kpi label="Suppliers owed" value={owing} foot="with purchases on credit to pay" />
          <Kpi label="Active suppliers" value={active} foot={suppliers.length > active ? `${suppliers.length - active} inactive` : 'offered when buying stock'} />
        </KpiGrid>
      )}

      <Toolbar>
        <p className="m-0 flex-[1_1_320px] text-[12.5px] text-mq-muted leading-normal">
          Stock bought on credit is owed to the supplier until you pay them here. Paying comes out of a business account.
        </p>
        <IfCan page="expenses">
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>Add supplier</Button>
        </IfCan>
      </Toolbar>

      <Card className="overflow-hidden">
        <CardHeader title="Suppliers" count={isLoading ? undefined : suppliers.length} />
        {isError ? (
          <div className="p-4"><ErrorState error={error} onRetry={refetch ? () => refetch() : undefined} /></div>
        ) : isLoading ? <RowSkeletons rows={4} /> : (
          <Table maxH={480} minW={600} label="Suppliers">
            <thead><tr><Th>Supplier</Th><Th>Phone</Th><Th align="right">Owed</Th><Th align="right"><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {suppliers.length === 0 ? (
                <EmptyRow cols={4}>No suppliers yet. Add the people you buy stock from, so purchases on credit can be tracked and paid.</EmptyRow>
              ) : suppliers.map((s) => (
                <Tr key={s.id} onClick={() => setOpenId(s.id)} dim={!s.isActive} label={`Open ${s.name}`}>
                  <Td strong>
                    <span className="inline-flex items-center gap-2">{s.name}{!s.isActive && <Chip tone="off" small dot={false}>Inactive</Chip>}</span>
                  </Td>
                  <Td mono>{s.phone || '—'}</Td>
                  <Td money className={s.owed > 0 ? '!text-mq-warn-ink' : '!text-mq-muted'}>{money(s.owed)}</Td>
                  <Td align="right" className="whitespace-nowrap" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <span className="inline-flex items-center gap-3">
                      {canEdit && s.owed > 0 && <Button variant="link" size="xs" onClick={() => setPaying(s)}>Pay</Button>}
                      {canEdit && <Button variant="link" size="xs" onClick={() => setEditing(s)}>Edit</Button>}
                      <Button variant="link" size="xs" onClick={() => setOpenId(s.id)}>Open</Button>
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {editing && <SupplierForm supplier={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <SupplierDetail id={openId} onClose={() => setOpenId(null)} canEdit={canEdit} onEdit={(s) => setEditing(s)} />
      {paying && <PayDialog supplier={paying} onClose={() => setPaying(null)} />}
    </>
  );
}

/** Add / edit dialog. Also used from the Inventory purchase form (onSaved gets the API response). */
export function SupplierForm({ supplier, onClose, onSaved }) {
  const qc = useQueryClient();
  const [name, setName] = useState(supplier?.name || '');
  const [phone, setPhone] = useState(supplier?.phone || '');
  const [error, setError] = useState('');
  const values = useMemo(() => ({ name, phone }), [name, phone]);
  const fv = useFormValidation(supplierFormSchema, values);

  const done = (d, msg) => {
    notify.success(msg);
    qc.invalidateQueries({ queryKey: ['suppliers'] });
    if (supplier) qc.invalidateQueries({ queryKey: ['supplier', supplier.id] });
    onSaved?.(d);
    onClose();
  };

  const save = useMutation({
    mutationFn: () => fetchJson(supplier ? `/api/admin/suppliers/${supplier.id}` : '/api/admin/suppliers', {
      method: supplier ? 'PUT' : 'POST', headers: JSON_H,
      body: JSON.stringify(supplier ? { name: name.trim(), phone: phone.trim() || null } : { name: name.trim(), phone: phone.trim() || undefined }),
    }),
    onSuccess: (d) => done(d, supplier ? 'Supplier updated' : 'Supplier added'),
    onError: (e) => reportSaveError(e, { title: supplier ? 'Could not save the supplier' : 'Could not add the supplier', form: fv, setBanner: setError }),
  });

  // Deactivate instead of delete: purchases and payments keep their supplier.
  const toggleActive = useMutation({
    mutationFn: () => fetchJson(`/api/admin/suppliers/${supplier.id}`, { method: 'PUT', headers: JSON_H, body: JSON.stringify({ isActive: !supplier.isActive }) }),
    onSuccess: (d) => done(d, supplier.isActive ? `${supplier.name} deactivated` : `${supplier.name} reactivated`),
    onError: (e) => reportSaveError(e, { title: supplier.isActive ? 'Could not deactivate the supplier' : 'Could not reactivate the supplier', setBanner: setError }),
  });

  const busy = save.isPending || toggleActive.isPending;
  const submit = (e) => {
    e.preventDefault(); setError('');
    if (!fv.check()) return;
    fv.setServerErrors({});
    save.mutate();
  };

  return (
    <Modal
      eyebrow={supplier ? 'Edit supplier' : 'New supplier'}
      title={supplier ? supplier.name : 'Add supplier'}
      icon="user"
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          {supplier && (
            <Button variant={supplier.isActive ? 'danger-soft' : 'soft'} size="lg" onClick={() => { setError(''); toggleActive.mutate(); }} disabled={busy}>
              {toggleActive.isPending ? 'Saving…' : supplier.isActive ? 'Deactivate' : 'Reactivate'}
            </Button>
          )}
          <ModalSpacer />
          <Button variant="secondary" size="lg" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" size="lg" type="submit" form="supplier-form" disabled={busy || !fv.valid}>
            {save.isPending ? 'Saving…' : supplier ? 'Save changes' : 'Add supplier'}
          </Button>
        </>
      )}
    >
      <form id="supplier-form" onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <Field label="Name" required {...fv.fieldProps('name')}>
          <input className={inputCls({ size: 'lg' })} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Phone (optional)" {...fv.fieldProps('phone')}>
          <input className={inputCls({ size: 'lg', mono: true })} type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        {supplier && !supplier.isActive && (
          <p className="m-0 text-[12.5px] text-mq-muted">Inactive suppliers aren’t offered when buying stock. Their history stays.</p>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Modal>
  );
}

function SupplierDetail({ id, onClose, canEdit, onEdit }) {
  const { data: s, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['supplier', id],
    queryFn: () => fetchJson(`/api/admin/suppliers/${id}`),
    enabled: id != null,
  });
  const [paying, setPaying] = useState(false);

  return (
    <>
      <Drawer
        name="supplier"
        open={id != null}
        onClose={onClose}
        eyebrow="Supplier"
        title={s?.name || '…'}
        footer={canEdit && s && (
          <>
            <Button variant="secondary" size="sm" icon="pen" onClick={() => onEdit(s)}>Edit</Button>
            <span className="flex-1" />
            <Button variant="primary" size="sm" onClick={() => setPaying(true)} disabled={!(s.owed > 0)}>Pay supplier</Button>
          </>
        )}
      >
        {isLoading ? <RowSkeletons rows={5} /> : isError ? <div className="p-4"><ErrorState error={error} onRetry={() => refetch()} /></div> : s && (
          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-1 rounded-xl border border-mq-line bg-mq-cream px-4 py-3.5">
              <span className="text-[12.5px] font-medium text-mq-muted">We owe {s.name}</span>
              <span className={`font-mq-mono text-[26px] font-medium tracking-[-.03em] tabular-nums ${s.owed > 0 ? 'text-mq-warn-ink' : 'text-mq-ink'}`}>{money(s.owed)}</span>
              <span className="flex items-center gap-2 text-xs text-mq-muted">
                {s.phone && <span className="font-mq-mono">{s.phone}</span>}
                {s.isActive === false && <Chip tone="off" small dot={false}>Inactive</Chip>}
              </span>
            </div>

            <section className="flex flex-col gap-2">
              <Overline as="h3" className="m-0">Bought on credit</Overline>
              {s.purchases.length === 0 ? <p className="m-0 text-[12.5px] text-mq-muted">No purchases on credit yet.</p> : (
                <div className="border border-mq-line rounded-xl overflow-hidden">
                  <Table label="Purchases on credit">
                    <thead><tr><Th>Date</Th><Th>Item</Th><Th align="right">Cost</Th></tr></thead>
                    <tbody>{s.purchases.map((p) => (
                      <Tr key={p.id}>
                        <Td mono className="whitespace-nowrap">{day(p.at)}</Td>
                        <Td>
                          <span className="text-mq-ink font-medium">{p.item}</span> <span className="text-mq-muted">· {p.quantity} {p.unit}</span>
                          {p.note && <div className="text-xs text-mq-muted">{p.note}</div>}
                        </Td>
                        <Td money>{money(p.cost)}</Td>
                      </Tr>
                    ))}</tbody>
                  </Table>
                </div>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <Overline as="h3" className="m-0">Payments made</Overline>
              {s.payments.length === 0 ? <p className="m-0 text-[12.5px] text-mq-muted">Nothing paid yet.</p> : (
                <div className="border border-mq-line rounded-xl overflow-hidden">
                  <Table label="Supplier payments">
                    <thead><tr><Th>Date</Th><Th>Paid from</Th><Th align="right">Amount</Th></tr></thead>
                    <tbody>{s.payments.map((p) => (
                      <Tr key={p.id}>
                        <Td mono className="whitespace-nowrap">{day(p.at)}</Td>
                        <Td>
                          {p.account}{p.by && <span className="text-mq-muted"> · {p.by}</span>}
                          {p.note && <div className="text-xs text-mq-muted">{p.note}</div>}
                        </Td>
                        <Td money>{money(p.amount)}</Td>
                      </Tr>
                    ))}</tbody>
                  </Table>
                </div>
              )}
            </section>
          </div>
        )}
      </Drawer>
      {paying && s && <PayDialog supplier={s} onClose={() => setPaying(false)} />}
    </>
  );
}

function PayDialog({ supplier, onClose }) {
  const qc = useQueryClient();
  const { accounts } = useMoneyAccounts();
  const [amount, setAmount] = useState(String(supplier.owed));
  const [accountId, setAccountId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const paidFrom = accountId || defaultPaidFrom(accounts);
  const schema = useMemo(() => supplierPaymentSchema(supplier.owed), [supplier.owed]);
  const values = useMemo(() => ({ amount, accountId: paidFrom, note }), [amount, paidFrom, note]);
  const fv = useFormValidation(schema, values);

  const pay = useMutation({
    mutationFn: (body) => fetchJson(`/api/admin/suppliers/${supplier.id}/payments`, { method: 'POST', headers: JSON_H, body: JSON.stringify(body) }),
    onSuccess: () => {
      notify.success('Payment recorded', { title: 'Could not record the payment' });
      ['suppliers', 'supplier', 'account-balances', 'account-entries'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    },
    // 409 = more than is owed: the API message says how much is left.
    onError: (e) => reportSaveError(e, { title: 'Could not record the payment', form: fv, setBanner: setError }),
  });

  const submit = (e) => {
    e.preventDefault(); setError('');
    if (!fv.check()) return;
    fv.setServerErrors({});
    pay.mutate({ amount: Number(amount), accountId: Number(paidFrom), note: note.trim() || undefined });
  };

  const amt = Number(amount);
  return (
    <Modal
      eyebrow="Pay supplier"
      title={supplier.name}
      icon="cash"
      onClose={onClose}
      busy={pay.isPending}
      width={460}
      footer={(
        <>
          <ModalSpacer />
          <Button variant="secondary" size="lg" onClick={onClose} disabled={pay.isPending}>Cancel</Button>
          <Button variant="primary" size="lg" type="submit" form="supplier-pay" disabled={pay.isPending || !fv.valid}>
            {pay.isPending ? 'Paying…' : amt > 0 ? `Pay ${money(amt)}` : 'Record payment'}
          </Button>
        </>
      )}
    >
      <form id="supplier-pay" onSubmit={submit} noValidate className="flex flex-col gap-3.5">
        <Alert tone="warn">Owed to {supplier.name}: <b className="font-mq-mono">{money(supplier.owed)}</b>. You cannot pay more than this.</Alert>
        <Field label="Amount ($)" required {...fv.fieldProps('amount')}>
          <input className={inputCls({ size: 'lg', mono: true })} type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <AccountField value={paidFrom} onChange={setAccountId} {...fv.fieldProps('accountId')} />
        <Field label="Note (optional)" {...fv.fieldProps('note')}>
          <input className={inputCls({ size: 'lg' })} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Receipt number, part payment..." />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
      </form>
    </Modal>
  );
}
