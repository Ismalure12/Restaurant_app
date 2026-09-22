'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson, parseApiError } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import Field from '@/components/admin/Field';
import { useFormValidation } from '@/lib/formValidation';
import { reportSaveError } from '@/lib/saveError';
import { editStaffSchema, newStaffSchema } from '@/lib/schemas/staff';
import useConfirm from '@/hooks/useConfirm';
import useAccess from '@/hooks/useAccess';
import useStaffList, { STAFF_LIST_KEY } from '@/hooks/useStaffList';
import useMoneyAccounts from '@/hooks/useMoneyAccounts';
import PayrollPanel from '@/components/admin/payroll/PayrollPanel';
import SalaryDialog from '@/components/admin/payroll/SalaryDialog';
import { money } from '@/lib/money';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin — full access' },
  { value: 'manager', label: 'Manager — full access' },
  { value: 'cashier', label: 'Cashier — POS, orders, inventory' },
  { value: 'waiter', label: 'Waiter — Register + performance' },
];
const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', cashier: 'Cashier', waiter: 'Waiter', user: 'User' };
// Role identity, drawn from the token layer so it follows the theme. Admin and
// manager share the brand; the rest take distinct categorical slots.
const GRAD = {
  admin:   ['var(--brand-700)', 'var(--brand-900)'],
  manager: ['var(--brand-700)', 'var(--brand-900)'],
  cashier: ['var(--chart-3)', 'var(--chart-3)'],
  waiter:  ['var(--chart-2)', 'var(--chart-2)'],
  user:    ['var(--muted)', 'var(--muted)'],
};

const initials = (s) => (s || '').trim().split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || 'HJ';
const emptyForm = { role: 'cashier', name: '', phone: '', email: '', password: '', isActive: true, monthlySalary: '' };
const TABS = [['team', 'Team'], ['payroll', 'Payroll']];

function StaffPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  // Team and Payroll each follow their own permission (Settings › Staff access).
  const { canView, canAct } = useAccess();
  const tabs = TABS.filter(([k]) => canView(k === 'team' ? 'staff' : 'payroll'));
  const wanted = useSearchParams().get('tab') === 'payroll' ? 'payroll' : 'team';
  const tab = tabs.some(([k]) => k === wanted) ? wanted : tabs[0]?.[0] || 'team';
  const canEditStaff = canAct('staff');
  const { confirm, dialog } = useConfirm();
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [salaryOf, setSalaryOf] = useState(null);

  useEffect(() => { fetch('/api/auth/me').then((r) => r.json()).then((d) => { if (d.userId) setCurrentUserId(d.userId); }).catch(() => {}); }, []);

  const { staff: logins, isLoading, denied } = useStaffList();
  // This month in the business time zone (the salary dialog can't start earlier).
  const { data: payrollNow } = useQuery({ queryKey: ['payroll', 'current'], queryFn: () => fetchJson('/api/admin/payroll'), enabled: !denied });

  const rows = roleFilter === 'all' ? logins : logins.filter((r) => r.role === roleFilter);
  const activeCount = logins.filter((r) => r.isActive).length;

  // Payment numbers: the staff member's own number for each business wallet
  // (A/C, E/d…), printed on the bills they serve. Waiters and cashiers only.
  const takesPayments = form.role === 'waiter' || form.role === 'cashier';
  const { accounts: allAccounts } = useMoneyAccounts({ enabled: showForm && takesPayments });
  const wallets = allAccounts.filter((a) => a.kind === 'wallet');
  const { data: savedNumbers } = useQuery({
    queryKey: ['staff-accounts', editing?.id],
    queryFn: () => fetchJson(`/api/admin/staff/${editing.id}/accounts`),
    enabled: Boolean(showForm && editing && takesPayments),
  });
  const [numDraft, setNumDraft] = useState({});
  const numberOf = (accountId) => numDraft[accountId] ?? (savedNumbers || []).find((n) => n.accountId === accountId)?.number ?? '';
  const numbersPayload = () => wallets.filter((w) => numDraft[w.id] !== undefined).map((w) => ({ accountId: w.id, number: numDraft[w.id].trim() || null }));

  // Validation values: the visible fields plus one `num_<walletId>` per payment number.
  const values = { name: form.name, phone: form.phone, email: form.email, role: form.role, ...(editing ? {} : { password: form.password, monthlySalary: form.monthlySalary }) };
  if (takesPayments) for (const w of wallets) values[`num_${w.id}`] = numberOf(w.id);
  const v = useFormValidation(editing ? editStaffSchema : newStaffSchema, values);
  const PARTIAL = 'Saved, but';

  const save = useMutation({
    mutationFn: async ({ id, payload }) => {
      const user = await fetchJson(id ? `/api/users/${id}` : '/api/users', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const numbers = takesPayments ? numbersPayload() : [];
      const staffId = id || user?.id;
      if (numbers.length && staffId) {
        try {
          await fetchJson(`/api/admin/staff/${staffId}/accounts`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ numbers }) });
        } catch (e) {
          // The account itself is saved — say exactly what is left to redo.
          throw Object.assign(new Error(`${PARTIAL} the payment numbers were not: ${parseApiError(e)}`), { kind: e?.kind });
        }
      }
      return user;
    },
    onSuccess: () => { notify.success(editing ? 'Saved' : 'Created', { title: 'Could not save the staff member' }); qc.invalidateQueries({ queryKey: STAFF_LIST_KEY }); qc.invalidateQueries({ queryKey: ['payroll'] }); qc.invalidateQueries({ queryKey: ['staff-accounts'] }); qc.invalidateQueries({ queryKey: ['orders-all'] }); reset(); },
    onError: (e) => {
      const partial = e instanceof Error && e.message.startsWith(PARTIAL);
      if (partial) { qc.invalidateQueries({ queryKey: STAFF_LIST_KEY }); reportSaveError(e, { setBanner: setFormError, title: 'Could not save the staff member' }); return; }
      reportSaveError(e, { form: v, setBanner: setFormError, title: 'Could not save the staff member', guess: { email: /email/i } });
    },
  });
  const del = useMutation({ mutationFn: (id) => fetchJson(`/api/users/${id}`, { method: 'DELETE' }), onSuccess: () => { notify.success('Removed'); qc.invalidateQueries({ queryKey: STAFF_LIST_KEY }); qc.invalidateQueries({ queryKey: ['payroll'] }); }, onError: (e) => notify.error(e, { title: 'Could not remove the staff member' }) });

  const reset = () => { setNumDraft({}); setForm(emptyForm); setEditing(null); setShowForm(false); setFormError(''); v.reset(); };
  const submit = (e) => {
    e.preventDefault(); setFormError(''); v.setServerErrors({});
    if (!v.check()) return;
    const base = { email: form.email.trim(), role: form.role, name: form.name.trim() || null, phone: form.phone.trim() || null, isActive: form.isActive };
    if (editing) { save.mutate({ id: editing.id, payload: base }); return; }
    const salary = form.monthlySalary.trim() === '' ? null : Number(form.monthlySalary);
    save.mutate({ id: null, payload: { ...base, monthlySalary: salary, password: form.password } });
  };
  const startEdit = (u) => {
    v.reset();
    setForm({ role: u.role, name: u.name ?? '', phone: u.phone ?? '', email: u.email ?? '', password: '', isActive: u.isActive, monthlySalary: '' });
    setEditing(u); setShowForm(true); setFormError('');
  };
  const remove = async (u) => { if (await confirm({ title: `Remove ${u.name || u.email}?`, body: 'This account will no longer be able to sign in.', confirmLabel: 'Remove' })) del.mutate(u.id); };
  const setTab = (t) => router.replace(t === 'team' ? pathname : `${pathname}?tab=${t}`, { scroll: false });

  if (!isLoading && denied) {
    return <div className="card card-pad-lg" style={{ maxWidth: 720 }}><div className="empty"><div className="empty-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></div><p className="empty-title">Managers only</p><p className="empty-sub">You don’t have permission to manage staff.</p></div></div>;
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      {dialog}
      <div className="toolbar staff-tabs">
        <div className="seg" role="tablist" aria-label="Staff">
          {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        <div style={{ flex: 1 }} />
        {tab === 'team' && (
          <>
            <span className="sub staff-count">{activeCount} active of {logins.length}</span>
            {canEditStaff && <button className="btn btn-primary" onClick={() => { reset(); setShowForm(true); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>Add staff</button>}
          </>
        )}
      </div>

      {tab === 'payroll' ? <PayrollPanel /> : (
        <>
          <div className="seg staff-roles">{['all', 'manager', 'cashier', 'waiter'].map((r) => <button key={r} className={roleFilter === r ? 'active' : ''} onClick={() => setRoleFilter(r)} style={{ textTransform: 'capitalize' }}>{r === 'all' ? 'All roles' : r + 's'}</button>)}</div>

          {isLoading ? (
            <div className="staff-grid">{[1, 2, 3].map((n) => <div key={n} className="sc"><div className="sk" style={{ height: 48, width: 48, borderRadius: 14 }} /><div className="sk" style={{ height: 14, marginTop: 12 }} /></div>)}</div>
          ) : rows.length === 0 ? (
            <div className="card card-pad-lg"><div className="empty"><div className="empty-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg></div><p className="empty-title">No staff here</p><p className="empty-sub">Add a staff account to get started.</p></div></div>
          ) : (
            <div className="staff-grid">
              {rows.map((u) => {
                const isSelf = u.id === currentUserId;
                const g = GRAD[u.role] || GRAD.user;
                const name = u.name || u.email;
                return (
                  <div className="sc" key={u.id}>
                    <div className="sc-top">
                      <div className="sc-av" style={{ background: `linear-gradient(135deg,${g[0]},${g[1]})` }}>{initials(name)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}><div className="sc-name">{name}{isSelf && <span className="pill pill-ghost" style={{ marginLeft: 6, fontSize: 9.5 }}>You</span>}</div><div className="sc-meta">{u.email}{u.phone ? ` · ${u.phone}` : ''}</div></div>
                      <span className={`pill role-${u.role}`}>{ROLE_LABEL[u.role] || u.role}</span>
                    </div>
                    <div className="sc-stats">
                      <div className="sc-stat"><div className="v">{u.salary > 0 ? money(u.salary) : '—'}</div><div className="k">Salary / month</div></div>
                      <div className="sc-stat"><div className="v" style={{ fontSize: 13 }}>{u.isActive ? 'Active' : 'Inactive'}</div><div className="k">Status</div></div>
                    </div>
                    <div className="sc-foot">
                      <Link href={`/admin/dashboard/reports/employees/${u.id}`} className="btn btn-ghost btn-sm">Performance</Link>
                      {canEditStaff && <button className="btn btn-ghost btn-sm" onClick={() => startEdit(u)}>Edit</button>}
                      {canEditStaff && !isSelf && <button className="btn btn-danger btn-sm" onClick={() => remove(u)} disabled={del.isPending}>Remove</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {showForm && (
        <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget) reset(); }}>
          <div className="modal">
            <div className="modal-h"><div className="mt"><div className="h-1">{editing ? 'Edit staff' : 'New staff'}</div></div><button className="icon-btn" onClick={reset} aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
            <form onSubmit={submit} noValidate>
              <div className="modal-b">
                <div className="ff-row" style={{ gap: 12, alignItems: 'flex-start' }}><Field className="g1-grow" label="Name" {...v.fieldProps('name')}><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Amina M." /></Field><Field className="g1-grow" label="Phone" {...v.fieldProps('phone')}><input className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field></div>
                <Field label="Email" required {...v.fieldProps('email')}><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" /></Field>
                {!editing && <Field label="Password" required {...v.fieldProps('password')}><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" autoComplete="new-password" /></Field>}
                {editing ? (
                  <div className="ff">
                    <label>Monthly salary</label>
                    <div className="staff-salary">
                      <span className="mono strong">{editing.salary > 0 ? `${money(editing.salary)} / month` : 'Not set'}</span>
                      <button type="button" className="btn btn-soft btn-sm" onClick={() => setSalaryOf({ staffId: editing.id, name: editing.name || editing.email })} disabled={!payrollNow}>{editing.salary > 0 ? 'Change / raise' : 'Set salary'}</button>
                    </div>
                    <div className="note">A change starts from a month you pick; earlier months keep what they were.</div>
                  </div>
                ) : (
                  <Field label="Monthly salary (optional)" hint="Starts this month. Raise it later from Payroll." {...v.fieldProps('monthlySalary')}><input className="input" type="number" min="0" step="0.01" value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} placeholder="e.g. 250" /></Field>
                )}
                <Field label="Role" required {...v.fieldProps('role')}><select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></Field>
                {takesPayments && (
                  <div className="ff">
                    <label>Payment numbers</label>
                    {wallets.length === 0 ? <div className="note">No mobile wallets yet — add them in Settings › Business accounts.</div> : wallets.map((w) => (
                      <div key={w.id} style={{ display: 'grid', gridTemplateColumns: '90px minmax(0,1fr)', gap: 10, alignItems: 'start', marginBottom: 8 }}>
                        <label htmlFor={`st-num-${w.id}`} style={{ margin: 0, lineHeight: '42px' }}>{w.label}</label>
                        <Field htmlFor={`st-num-${w.id}`} {...v.fieldProps(`num_${w.id}`)}><input className="input" type="tel" inputMode="tel" maxLength={40} value={numberOf(w.id)} onChange={(e) => setNumDraft({ ...numDraft, [w.id]: e.target.value })} placeholder="e.g. 61 000 0000" /></Field>
                      </div>
                    ))}
                    <div className="note">Printed on the unpaid bills and delivery receipts they handle so customers know where to send money. Leave blank to clear.</div>
                  </div>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
                {formError && <div className="adm-error-banner">{formError}</div>}
              </div>
              <div className="modal-f"><button type="button" className="btn btn-ghost" onClick={reset}>Cancel</button><button type="submit" className="btn btn-primary" disabled={save.isPending || !v.valid}>{save.isPending ? 'Saving…' : (editing ? 'Save changes' : 'Create staff')}</button></div>
            </form>
          </div>
        </div>
      )}
      {salaryOf && payrollNow && <SalaryDialog people={[salaryOf]} thisMonth={payrollNow.month} onClose={() => { setSalaryOf(null); reset(); }} />}
    </div>
  );
}

export default function StaffPageRoute() {
  return <Suspense fallback={null}><StaffPage /></Suspense>;
}
