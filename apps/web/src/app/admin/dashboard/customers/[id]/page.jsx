'use client';

import { useEffect, useState, useRef } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { useFormValidation } from '@/lib/formValidation';
import { customerSchema } from '@/lib/schemas/customers';
import Field from '@/components/admin/Field';
import StatementDoc from '@/components/admin/StatementDoc';
import { printHtml } from '@/components/admin/printShared';
import { RECEIPT_CSS } from '@/components/admin/receiptCss';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';
import { money } from '@/lib/money';


const STATUS_PILL = {
  unpaid: { cls: 'pill-rose', label: 'Unpaid' },
  partial: { cls: 'pill-amber', label: 'Partial' },
  paid: { cls: 'pill-green', label: 'Paid' },
  void: { cls: 'pill-ghost', label: 'Void' },
};

function Crumb({ name }) {
  return (
    <nav className="adm-crumb">
      <Link href="/admin/dashboard/customers">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
        Customers
      </Link>
      <span className="sep">/</span>
      <span>{name}</span>
    </nav>
  );
}

// Unpaid or part-paid, and the due date has passed.
const overdue = (inv) => Boolean(inv.dueDate) && (inv.status === 'unpaid' || inv.status === 'partial') && new Date(inv.dueDate) < new Date();

export default function CustomerDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const custForm = useFormValidation(customerSchema, form);
  const [menuOpen, setMenuOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [stmt, setStmt] = useState(null); // { data, mode } while a statement is being printed
  const stmtRef = useRef(null);
  const menuRef = useRef(null);

  // The statement menu closes on a click/tap outside it or on Escape.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setMenuOpen(false);
      menuRef.current?.querySelector('button')?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

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
    setMenuOpen(false);
    setPrinting(true);
    try {
      const data = await qc.fetchQuery({
        queryKey: ['customer-statement', id, mode],
        queryFn: () => fetchJson(`/api/admin/customers/${id}/statement?status=${mode}`),
        staleTime: 0,
      });
      flushSync(() => setStmt({ data, mode }));
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
      <div className="wrap-narrow">
        <Crumb name="Loading…" />
        <div className="sk" style={{ height: 58, marginBottom: 16 }} />
        <KpiRowSkeleton count={3} style={{ marginBottom: 16 }} />
        <div className="card card-pad"><RowsSkeleton rows={4} /></div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="wrap-narrow">
        <Crumb name="Not found" />
        <div className="card card-pad-lg">
          <div className="empty">
            <div className="empty-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /></svg></div>
            <p className="empty-title">Customer not found</p>
            <p className="empty-sub">This account may not exist. Go back to the customer list.</p>
          </div>
        </div>
      </div>
    );
  }

  const { customer, owedBalance, invoices } = data;
  // Counts come from the server; the history list is capped at the 50 most recent.
  const invoiceCount = data.invoiceCount ?? invoices.length;
  const openInvoices = data.openCount ?? invoices.filter((i) => i.status === 'unpaid' || i.status === 'partial').length;

  return (
    <div className="wrap-narrow">
      <StatementDoc ref={stmtRef} data={stmt?.data} mode={stmt?.mode} />
      <Crumb name={customer.name} />

      <div className="detail-h">
        <div>
          <div className="eyebrow">Customer account</div>
          <div className="h-1">{customer.name}</div>
          <div className="sub"><span className="mono">{customer.phone}</span>{customer.address ? ` · ${customer.address}` : ''}</div>
        </div>
        <div className="acts">
          <div className="g3-menu-wrap" ref={menuRef}>
            <button type="button" className="btn btn-ghost" onClick={() => setMenuOpen((o) => !o)} disabled={printing} aria-haspopup="menu" aria-expanded={menuOpen}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>{printing ? 'Preparing…' : 'Print statement'}
            </button>
            {menuOpen && (
              <div className="g3-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => printStatement('open')}><b>Owing only</b><span>Unpaid and part-paid invoices</span></button>
                <button type="button" role="menuitem" onClick={() => printStatement('all')}><b>All invoices</b><span>Every invoice, paid or not</span></button>
              </div>
            )}
          </div>
          <button className="btn btn-ghost" onClick={startEdit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>Edit details
          </button>
        </div>
      </div>

      <div className="kpi-row reveal" style={{ marginBottom: 16 }}>
        <div className="kpi">
          <div className="kpi-top"><div className={`kpi-ic ${owedBalance > 0 ? 'rose' : 'green'}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div><span className="kpi-k">Owed balance</span></div>
          <div className="kpi-v"><small>$</small>{Number(owedBalance).toFixed(2)}</div>
          <div className="kpi-foot"><span>{owedBalance > 0 ? 'currently outstanding' : 'all settled'}</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ic amber"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg></div><span className="kpi-k">Invoices</span></div>
          <div className="kpi-v">{invoiceCount}</div>
          <div className="kpi-foot"><span>{openInvoices} still open</span></div>
        </div>
        <div className="kpi">
          <div className="kpi-top"><div className="kpi-ic ink"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg></div><span className="kpi-k">Customer since</span></div>
          <div className="kpi-v is-text">{new Date(customer.createdAt).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })}</div>
          <div className="kpi-foot"><span>account created</span></div>
        </div>
      </div>

      <div className="card reveal" style={{ overflow: 'hidden', animationDelay: '.08s' }}>
        <div className="card-h">
          <div><div className="ttl">Invoice history</div><div className="note">Most recent 50 invoices</div></div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Invoice</th><th className="num">Total</th><th className="num">Balance</th><th>Status</th><th>Due</th><th /></tr></thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr><td colSpan={6} className="td-empty">No invoices yet</td></tr>
              ) : invoices.map((inv) => {
                const st = STATUS_PILL[inv.status] || STATUS_PILL.unpaid;
                return (
                  <tr key={inv.id}>
                    <td><span className="mono strong">#{inv.id}</span><div className="note">{new Date(inv.createdAt).toLocaleDateString()}</div></td>
                    <td className="num">{money(inv.total)}</td>
                    <td className="num" style={{ color: Number(inv.balance) > 0 ? 'var(--rose)' : 'var(--muted)' }}>{money(inv.balance)}</td>
                    <td><span className={`pill ${st.cls}`}><span className="pdot" />{st.label}</span></td>
                    <td className={overdue(inv) ? 'rose' : 'muted'}>{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}{overdue(inv) && <div className="note" style={{ color: 'var(--rose)' }}>overdue</div>}</td>
                    <td className="act"><Link href={`/admin/dashboard/customers/${customer.id}/invoices/${inv.id}`} className="btn btn-ghost btn-sm">Open</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget) setEditing(false); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Edit customer">
            <div className="modal-h">
              <div className="mt"><div className="eyebrow">Edit customer</div><div className="h-1" style={{ marginTop: 3 }}>{customer.name}</div></div>
              <button className="icon-btn" onClick={() => setEditing(false)} aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div>
            <form noValidate onSubmit={submitEdit} style={{ display: 'contents' }}>
              <div className="modal-b">
                <Field label="Name" required {...custForm.fieldProps('name')}><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="Phone" required {...custForm.fieldProps('phone')}><input className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
                <Field label="Address (optional)" {...custForm.fieldProps('address')}><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
              </div>
              <div className="modal-f">
                <button type="button" onClick={() => setEditing(false)} disabled={updateMutation.isPending} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={updateMutation.isPending || !custForm.valid} className="btn btn-primary">{updateMutation.isPending ? 'Saving…' : 'Save changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
