'use client';

import { Suspense, useState } from 'react';
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
import { ActiveFilters, FilterSelect, FiltersButton } from '@/components/admin/reports/ReportKit';
import {
  Page, Toolbar, Button, Card, Chip, Segmented, EmptyState, Skeleton, NoAccess, Alert,
  Modal, ModalSpacer, inputCls, selectCls, cx,
} from '@/components/admin/ui';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin — full access' },
  { value: 'manager', label: 'Manager — full access' },
  { value: 'cashier', label: 'Cashier — POS, orders, inventory' },
  { value: 'waiter', label: 'Waiter — Register + performance' },
];
// Same ranking as the API (users.controller.ts): nobody hands out or edits a role above their own.
const RANK = { waiter: 1, cashier: 2, manager: 3, admin: 4 };
const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', cashier: 'Cashier', waiter: 'Waiter', user: 'User' };
const ROLE_TONE = { admin: 'brand', manager: 'brand', cashier: 'info', waiter: 'warn', user: 'off' };
const ROLE_FILTERS = [['all', 'All roles'], ['manager', 'Managers'], ['cashier', 'Cashiers'], ['waiter', 'Waiters']];

const initials = (s) => (s || '').trim().split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '·';
const emptyForm = { role: 'cashier', name: '', phone: '', email: '', password: '', isActive: true, monthlySalary: '' };
const TABS = [['team', 'Team'], ['payroll', 'Payroll']];

function StaffPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  // Team and Payroll each follow their own permission (Settings › Staff access).
  const { canView, canAct, role: myRole } = useAccess();
  const tabs = TABS.filter(([k]) => canView(k === 'team' ? 'staff' : 'payroll'));
  const wanted = useSearchParams().get('tab') === 'payroll' ? 'payroll' : 'team';
  const tab = tabs.some(([k]) => k === wanted) ? wanted : tabs[0]?.[0] || 'team';
  const canEditStaff = canAct('staff');
  const { confirm, dialog } = useConfirm();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [salaryOf, setSalaryOf] = useState(null);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => fetchJson('/api/auth/me'), staleTime: 5 * 60 * 1000 });
  const currentUserId = me?.userId ?? null;
  const myRank = RANK[myRole] ?? 0;
  const roleOptions = ROLE_OPTIONS.filter((r) => RANK[r.value] <= myRank);

  const { staff: logins, isLoading, denied } = useStaffList();
  // This month in the business time zone (the salary dialog can't start earlier).
  const { data: payrollNow } = useQuery({ queryKey: ['payroll', 'current'], queryFn: () => fetchJson('/api/admin/payroll'), enabled: !denied && canView('payroll') });

  const rows = roleFilter === 'all' ? logins : logins.filter((r) => r.role === roleFilter || (roleFilter === 'manager' && r.role === 'admin'));
  const activeCount = logins.filter((r) => r.isActive).length;
  const countOf = (k) => (k === 'all' ? logins.length : logins.filter((r) => r.role === k || (k === 'manager' && r.role === 'admin')).length);

  // Payment numbers: the staff member's own number for each business wallet
  // (A/C, E/d…), printed on the bills they serve. Waiters and cashiers only;
  // only wallets switched to "Show in staff accounts" in Settings › Money.
  const takesPayments = form.role === 'waiter' || form.role === 'cashier';
  const { accounts: allAccounts } = useMoneyAccounts({ enabled: showForm && takesPayments });
  const wallets = allAccounts.filter((a) => a.kind === 'wallet' && a.staffNumbers);
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

  const afterStaffChange = () => {
    qc.invalidateQueries({ queryKey: STAFF_LIST_KEY });
    qc.invalidateQueries({ queryKey: ['payroll'] });
  };

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
    onSuccess: () => { notify.success(editing ? 'Saved' : 'Created', { title: 'Could not save the staff member' }); afterStaffChange(); qc.invalidateQueries({ queryKey: ['staff-accounts'] }); qc.invalidateQueries({ queryKey: ['orders-all'] }); reset(); },
    onError: (e) => {
      const partial = e instanceof Error && e.message.startsWith(PARTIAL);
      if (partial) { qc.invalidateQueries({ queryKey: STAFF_LIST_KEY }); reportSaveError(e, { setBanner: setFormError, title: 'Could not save the staff member' }); return; }
      reportSaveError(e, { form: v, setBanner: setFormError, title: 'Could not save the staff member', guess: { email: /email/i } });
    },
  });
  // Deactivate / Reactivate: the everyday way to take someone off (history kept).
  const setActive = useMutation({
    mutationFn: ({ id, isActive }) => fetchJson(`/api/users/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) }),
    onSuccess: (_r, { isActive }) => { notify.success(isActive ? 'Reactivated' : 'Deactivated'); afterStaffChange(); qc.invalidateQueries({ queryKey: ['orders-all'] }); reset(); },
    onError: (e) => notify.error(e, { title: 'Could not change the account' }),
  });
  const del = useMutation({
    mutationFn: (id) => fetchJson(`/api/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => { notify.success('Removed'); afterStaffChange(); reset(); },
    onError: (e) => notify.error(e, { title: 'Could not remove the staff member' }),
  });

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
  const toggleActive = async (u) => {
    const name = u.name || u.email;
    if (u.isActive && !(await confirm({ title: `Deactivate ${name}?`, body: 'They can no longer sign in. Their sales, salary history and payments are kept, and you can reactivate them any time.', confirmLabel: 'Deactivate' }))) return;
    setActive.mutate({ id: u.id, isActive: !u.isActive });
  };
  const remove = async (u) => {
    if (await confirm({ title: `Delete ${u.name || u.email} for good?`, body: 'The login is deleted permanently. Deactivate instead if you only want to stop them signing in.', confirmLabel: 'Delete account' })) del.mutate(u.id);
  };
  const setTab = (t) => router.replace(t === 'team' ? pathname : `${pathname}?tab=${t}`, { scroll: false });

  if (!isLoading && denied && !canView('payroll')) {
    return <Page narrow><NoAccess what="Staff" role={myRole} /></Page>;
  }

  const busy = save.isPending || setActive.isPending || del.isPending;
  const isSelfEditing = editing && editing.id === currentUserId;
  const canManageEditing = editing && (RANK[editing.role] ?? 0) <= myRank;

  return (
    <Page>
      {dialog}
      <Toolbar>
        {tabs.length > 1 && <Segmented label="Staff" options={tabs.map(([k, l]) => ({ value: k, label: l }))} value={tab} onChange={setTab} />}
        {/* Role is an extra filter: it lives in the one Filters control, not its own row. */}
        {tab === 'team' && (
          <FiltersButton active={roleFilter === 'all' ? 0 : 1} onClear={() => setRoleFilter('all')}>
            <FilterSelect
              label="Role"
              value={roleFilter === 'all' ? '' : roleFilter}
              options={ROLE_FILTERS.filter(([k]) => k !== 'all').map(([k, l]) => ({ value: k, label: `${l} (${countOf(k)})` }))}
              onChange={(v) => setRoleFilter(v || 'all')}
              all={`All roles (${countOf('all')})`}
            />
          </FiltersButton>
        )}
        <span className="flex-1" />
        {tab === 'team' && (
          <>
            <span className="text-[12.5px] text-mq-muted"><b className="font-mq-mono font-semibold text-mq-ink">{activeCount}</b> active of <span className="font-mq-mono">{logins.length}</span></span>
            {canEditStaff && <Button variant="primary" icon="plus" onClick={() => { reset(); setShowForm(true); }}>Add staff</Button>}
          </>
        )}
      </Toolbar>

      {tab === 'payroll' ? <PayrollPanel /> : (
        <>
          <ActiveFilters
            items={roleFilter === 'all' ? [] : [{ key: 'role', label: `Role: ${ROLE_FILTERS.find(([k]) => k === roleFilter)?.[1] || roleFilter}`, onRemove: () => setRoleFilter('all') }]}
          />

          {isLoading ? (
            <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px,100%), 1fr))' }} aria-busy="true" aria-label="Loading">
              {[1, 2, 3].map((n) => (
                <Card key={n} pad className="flex flex-col gap-3">
                  <div className="flex items-center gap-3"><Skeleton className="w-11 h-11 !rounded-xl" /><div className="flex-1 flex flex-col gap-2"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3 w-3/4" /></div></div>
                  <Skeleton className="h-14" />
                </Card>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <Card>
              <EmptyState icon="staff" title="No staff here" action={canEditStaff && <Button variant="soft" size="sm" icon="plus" onClick={() => { reset(); setShowForm(true); }}>Add staff</Button>}>
                {roleFilter === 'all' ? 'Add a staff account to get started.' : 'Nobody has this role yet.'}
              </EmptyState>
            </Card>
          ) : (
            <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px,100%), 1fr))' }}>
              {rows.map((u) => (
                <StaffCard key={u.id} u={u} isSelf={u.id === currentUserId} canEdit={canEditStaff && (RANK[u.role] ?? 0) <= myRank} onEdit={() => startEdit(u)} />
              ))}
            </div>
          )}
        </>
      )}

      {showForm && (
        <Modal
          title={editing ? `Edit ${editing.name || editing.email}` : 'Add a staff member'}
          eyebrow={editing ? 'Staff' : 'New staff'}
          icon="user"
          onClose={reset}
          busy={busy}
          width={560}
          footer={(
            <>
              {editing && canManageEditing && !isSelfEditing && (
                editing.isActive
                  ? <Button variant="danger-soft" size="lg" onClick={() => toggleActive(editing)} disabled={busy}>Deactivate</Button>
                  : <Button variant="soft" size="lg" onClick={() => toggleActive(editing)} disabled={busy}>Reactivate</Button>
              )}
              <ModalSpacer />
              <Button variant="secondary" size="lg" onClick={reset} disabled={busy}>Cancel</Button>
              <Button variant="primary" size="lg" type="submit" form="staff-form" disabled={busy || !v.valid}>{save.isPending ? 'Saving…' : (editing ? 'Save changes' : 'Create staff')}</Button>
            </>
          )}
        >
          <form id="staff-form" onSubmit={submit} noValidate className="flex flex-col gap-3.5">
            {editing && !editing.isActive && <Alert tone="warn" title="Inactive">This account can’t sign in. Reactivate it to let them back in.</Alert>}
            <div className="grid grid-cols-1 tab:grid-cols-2 gap-3.5">
              <Field label="Name" {...v.fieldProps('name')}><input className={inputCls({ size: 'lg' })} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Amina M." /></Field>
              <Field label="Phone" {...v.fieldProps('phone')}><input className={inputCls({ size: 'lg', mono: true })} type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            </div>
            <Field label="Email" required {...v.fieldProps('email')}><input className={inputCls({ size: 'lg' })} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="off" /></Field>
            {!editing && <Field label="Password" required {...v.fieldProps('password')}><input className={inputCls({ size: 'lg' })} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" autoComplete="new-password" /></Field>}
            <Field label="Role" required {...v.fieldProps('role')}>
              <select className={selectCls({ size: 'lg' })} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {/* Editing someone whose role isn't in my list (shouldn't happen — the card hides Edit) keeps it selectable. */}
                {(roleOptions.some((r) => r.value === form.role) ? roleOptions : [...roleOptions, ROLE_OPTIONS.find((r) => r.value === form.role)].filter(Boolean)).map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            {editing ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[.09em] text-mq-muted">Monthly salary</span>
                <div className="flex items-center gap-3 flex-wrap bg-mq-cream border border-mq-line rounded-lg px-3 py-2.5">
                  <span className="flex-1 font-mq-mono text-sm font-medium text-mq-ink">{editing.salary > 0 ? `${money(editing.salary)} / month` : 'Not set'}</span>
                  {canView('payroll') && <Button variant="soft" size="xs" onClick={() => setSalaryOf({ staffId: editing.id, name: editing.name || editing.email })} disabled={!payrollNow}>{editing.salary > 0 ? 'Change / raise' : 'Set salary'}</Button>}
                </div>
                <span className="text-xs text-mq-muted">A change starts from a month you pick; earlier months keep what they were.</span>
              </div>
            ) : (
              <Field label="Monthly salary (optional)" hint="Starts this month. Raise it later from Payroll." {...v.fieldProps('monthlySalary')}><input className={inputCls({ size: 'lg', mono: true })} type="number" min="0" step="0.01" inputMode="decimal" value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} placeholder="e.g. 250" /></Field>
            )}
            {takesPayments && (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[.09em] text-mq-muted">Payment numbers</span>
                {wallets.length === 0 ? <span className="text-xs text-mq-muted">No accounts are open to staff yet — turn on “Show in staff accounts” in Settings › Money.</span> : wallets.map((w) => (
                  <div key={w.id} className="grid grid-cols-[90px_minmax(0,1fr)] gap-2.5 items-start">
                    <label htmlFor={`st-num-${w.id}`} className="leading-[42px] text-[13.5px] font-medium text-mq-body truncate">{w.label}</label>
                    <Field htmlFor={`st-num-${w.id}`} {...v.fieldProps(`num_${w.id}`)}><input className={inputCls({ size: 'lg', mono: true })} type="tel" inputMode="tel" maxLength={40} value={numberOf(w.id)} onChange={(e) => setNumDraft({ ...numDraft, [w.id]: e.target.value })} placeholder="e.g. 61 000 0000" /></Field>
                  </div>
                ))}
                <span className="text-xs text-mq-muted">Printed on the bills and delivery receipts they handle so customers know where to send money. Leave blank to clear.</span>
              </div>
            )}
            {formError && <Alert tone="danger">{formError}</Alert>}
            {/* Hard delete is admin-only; everyone else deactivates. */}
            {editing && myRole === 'admin' && !isSelfEditing && (
              <div className="flex items-center gap-3 flex-wrap border border-mq-danger-line bg-mq-danger-bg/50 rounded-[10px] px-3.5 py-3 mt-1">
                <div className="flex-1 min-w-[180px]">
                  <div className="text-[13.5px] font-semibold text-mq-danger-ink">Danger zone</div>
                  <div className="text-xs text-mq-danger-ink/90">Delete this login permanently. Usually you want Deactivate.</div>
                </div>
                <Button variant="danger-soft" size="sm" icon="trash" onClick={() => remove(editing)} disabled={busy}>Delete account</Button>
              </div>
            )}
          </form>
        </Modal>
      )}
      {salaryOf && payrollNow && <SalaryDialog people={[salaryOf]} thisMonth={payrollNow.month} onClose={() => { setSalaryOf(null); reset(); }} />}
    </Page>
  );
}

/** One team card: who, role, 7-day sales / voids (managers), salary, actions. */
function StaffCard({ u, isSelf, canEdit, onEdit }) {
  const name = u.name || u.email;
  const meta = [u.email !== name ? u.email : null, u.phone].filter(Boolean).join(' · ');
  return (
    <Card className={cx('flex flex-col gap-3.5 p-[18px]', !u.isActive && 'bg-mq-cream')}>
      <div className="flex items-center gap-3 min-w-0">
        <span className={cx('grid place-items-center w-11 h-11 rounded-xl flex-none text-[15px] font-semibold', u.isActive ? 'bg-mq-deep text-mq-cream' : 'bg-mq-chip text-mq-chip-ink')} aria-hidden="true">{initials(name)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-base font-semibold tracking-[-.01em] text-mq-ink truncate">{name}</span>
            {isSelf && <span className="flex-none text-[10.5px] font-semibold uppercase tracking-[.08em] bg-mq-soft text-mq-primary border border-mq-soft-line rounded-full px-1.5 py-px">You</span>}
          </div>
          {meta && <div className="text-[12.5px] text-mq-on-tint truncate">{meta}</div>}
        </div>
        <div className="flex flex-col items-end gap-1 flex-none">
          <Chip tone={ROLE_TONE[u.role] || 'off'} dot={false} small>{ROLE_LABEL[u.role] || u.role}</Chip>
          {!u.isActive && <Chip tone="off" small>Inactive</Chip>}
        </div>
      </div>
      {u.stats7d && (
        <div className="flex gap-2">
          <div className="flex-1 flex flex-col gap-px bg-mq-cream border border-mq-chip rounded-[10px] px-3 py-2.5">
            <span className="font-mq-mono text-lg font-semibold tabular-nums text-mq-ink">{money(u.stats7d.sales)}</span>
            <span className="text-[11.5px] text-mq-muted">sales · 7 days · <span className="font-mq-mono">{u.stats7d.orders}</span></span>
          </div>
          <div className="flex-1 flex flex-col gap-px bg-mq-cream border border-mq-chip rounded-[10px] px-3 py-2.5">
            <span className={cx('font-mq-mono text-lg font-semibold tabular-nums', u.stats7d.voids > 0 ? 'text-mq-danger-ink' : 'text-mq-ink')}>{u.stats7d.voids}</span>
            <span className="text-[11.5px] text-mq-muted">voids · 7 days</span>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 pt-3 border-t border-mq-chip">
        <span className="flex-1 text-[12.5px] text-mq-on-tint">{u.salary > 0 ? <><span className="font-mq-mono text-mq-ink">{money(u.salary)}</span> / month</> : 'No salary set'}</span>
        <Button variant="ghost" size="xs" href={`/admin/dashboard/reports/employees/${u.id}`}>Performance</Button>
        {canEdit && <Button variant="secondary" size="xs" onClick={onEdit}>Edit</Button>}
      </div>
    </Card>
  );
}

export default function StaffPageRoute() {
  return <Suspense fallback={null}><StaffPage /></Suspense>;
}
