'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, parseApiError } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import useConfirm from '@/hooks/useConfirm';
import { RowsSkeleton } from '@/components/admin/Skeletons';
import SalaryDialog from './SalaryDialog';
import PayDialog from './PayDialog';
import SalaryHistory from './SalaryHistory';
import { ROLE_LABEL, day, initials, money, shiftMonth } from './payrollUi';

const Ico = {
  prev: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m15 18-6-6 6-6" /></svg>,
  next: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m9 18 6-6-6-6" /></svg>,
  up: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M7 17 17 7M9 7h8v8" /></svg>,
  cash: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></svg>,
};

/**
 * Staff › Payroll. Pick a month; everyone's salary FOR THAT MONTH (salary
 * history — a raise applies from its month on), paid or not. Select people to
 * raise or pay them together, or act on one row. Paying records a "Salaries"
 * expense; Undo removes it.
 */
export default function PayrollPanel() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [month, setMonth] = useState(null); // null = this month (the server decides, in the business time zone)
  const [thisMonth, setThisMonth] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [salaryFor, setSalaryFor] = useState(null); // [] people | null closed | 'all'
  const [payFor, setPayFor] = useState(null);
  const [historyOf, setHistoryOf] = useState(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['payroll', month || 'current'],
    queryFn: async () => {
      const r = await fetchJson(`/api/admin/payroll${month ? `?month=${month}` : ''}`);
      if (!month) setThisMonth(r.month);
      return r;
    },
    placeholderData: (prev) => prev,
  });
  const shown = data?.month || month;
  const current = thisMonth || data?.month;

  const undo = useMutation({
    mutationFn: (id) => fetchJson(`/api/admin/payroll/${id}`, { method: 'DELETE' }),
    onSuccess: () => { notify.success('Salary payment undone'); qc.invalidateQueries({ queryKey: ['payroll'] }); qc.invalidateQueries({ queryKey: ['expenses'] }); },
    onError: (e) => notify.error(e, { title: 'Could not undo the payment' }),
  });

  const rows = data?.rows || [];
  const s = data?.summary;
  const pick = (r) => ({ staffId: r.staffId, name: r.name, salary: r.salary });
  const chosen = rows.filter((r) => selected.has(r.staffId));
  const unpaidChosen = chosen.filter((r) => !r.payment);
  const unpaidAll = rows.filter((r) => !r.payment && r.salary > 0);
  const allOn = rows.length > 0 && selected.size === rows.length;

  const go = (m) => { setMonth(m); setSelected(new Set()); };
  const toggle = (id) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.staffId)));
  const askUndo = async (r) => {
    if (await confirm({ title: `Undo ${r.name}’s ${data.label} salary?`, body: `The ${money(r.payment.amount)} salary expense is deleted and the month shows as unpaid again.`, confirmLabel: 'Undo payment' })) undo.mutate(r.payment.id);
  };

  return (
    <div className="pr">
      {dialog}
      <div className="pr-head">
        <div className="pr-month" role="group" aria-label="Month">
          <button type="button" className="icon-btn" onClick={() => go(shiftMonth(shown, -1))} disabled={!shown} aria-label="Previous month">{Ico.prev}</button>
          <div className="pr-month-l"><div className="eyebrow">Payroll</div><div className="h-2">{data?.label || '…'}</div></div>
          <button type="button" className="icon-btn" onClick={() => go(shiftMonth(shown, 1))} disabled={!shown || shown >= current} aria-label="Next month">{Ico.next}</button>
          {shown && current && shown !== current && <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(null)}>This month</button>}
        </div>
        <Link className="btn btn-ghost btn-sm" href="/admin/dashboard/expenses?q=Salaries">Salaries in Expenses</Link>
      </div>

      <div className="kpi-row pr-kpis">
        <div className="kpi"><div className="kpi-top"><span className="kpi-dot ink" /><span className="kpi-k">Due for {data?.label || 'the month'}</span></div><div className="kpi-v is-text mono">{s ? money(s.due) : '—'}</div><div className="kpi-foot"><span>{s ? `${s.people} on payroll` : ''}</span></div></div>
        <div className="kpi"><div className="kpi-top"><span className="kpi-dot green" /><span className="kpi-k">Paid</span></div><div className="kpi-v is-text mono">{s ? money(s.paid) : '—'}</div><div className="kpi-foot"><span>{s ? `${s.people - s.unpaidCount} of ${s.people} people` : ''}</span></div></div>
        <div className="kpi"><div className="kpi-top"><span className="kpi-dot amber" /><span className="kpi-k">Still to pay</span></div><div className="kpi-v is-text mono">{s ? money(s.remaining) : '—'}</div><div className="kpi-foot"><span>{s ? (s.unpaidCount ? `${s.unpaidCount} ${s.unpaidCount === 1 ? 'person' : 'people'}` : 'Everyone is paid') : ''}</span></div></div>
        <div className="kpi"><div className="kpi-top"><span className="kpi-dot sky" /><span className="kpi-k">No salary set</span></div><div className="kpi-v is-text mono">{data ? data.withoutSalary : '—'}</div><div className="kpi-foot"><span>active staff</span></div></div>
      </div>

      <div className="card pr-card">
        <div className="pr-bar">
          <label className="pr-check" title={allOn ? 'Clear selection' : 'Select everyone'}>
            <input type="checkbox" checked={allOn} ref={(el) => { if (el) el.indeterminate = selected.size > 0 && !allOn; }} onChange={toggleAll} disabled={!rows.length} aria-label="Select everyone" />
          </label>
          {selected.size > 0 ? (
            <>
              <span className="pr-bar-l"><b>{selected.size}</b> selected</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
              <div className="grow" />
              <button type="button" className="btn btn-soft" onClick={() => setSalaryFor(chosen.map(pick))}>{Ico.up}Change salary</button>
              <button type="button" className="btn btn-primary" disabled={!unpaidChosen.length} onClick={() => setPayFor(unpaidChosen.map(pick))}>
                {Ico.cash}Pay {unpaidChosen.length || ''}
              </button>
            </>
          ) : (
            <>
              <span className="pr-bar-l sub">Select people to raise or pay them together</span>
              <div className="grow" />
              <button type="button" className="btn btn-soft" onClick={() => setSalaryFor('all')} disabled={!rows.length}>{Ico.up}Raise everyone</button>
              <button type="button" className="btn btn-primary" disabled={!unpaidAll.length} onClick={() => setPayFor(unpaidAll.map(pick))}>
                {Ico.cash}{unpaidAll.length ? `Pay all remaining · ${money(unpaidAll.reduce((t, r) => t + r.salary, 0))}` : 'All paid'}
              </button>
            </>
          )}
        </div>

        {isLoading ? <RowsSkeleton className="card-pad" rows={4} height={44} /> : isError ? <div className="card-pad adm-error-banner">{parseApiError(error)}</div> : rows.length === 0 ? (
          <div className="empty"><p className="empty-title">No staff yet</p><p className="empty-sub">Add staff in the Team tab, with a monthly salary.</p></div>
        ) : (
          <table className="table pr-table">
            <thead><tr><th className="pr-c-check"><span className="sr-only">Select</span></th><th>Person</th><th className="num">Salary</th><th>{data.label}</th><th className="num"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.staffId} className={selected.has(r.staffId) ? 'on' : ''}>
                  <td className="pr-c-check"><label className="pr-check"><input type="checkbox" checked={selected.has(r.staffId)} onChange={() => toggle(r.staffId)} aria-label={`Select ${r.name}`} /></label></td>
                  <td className="pr-c-person">
                    <div className="pr-person">
                      <span className={`pr-av role-${r.role}`} aria-hidden="true">{initials(r.name)}</span>
                      <div><div className="strong">{r.name}{!r.isActive && <span className="pill pill-xs pill-ghost">inactive</span>}</div><div className="sub">{ROLE_LABEL[r.role] || r.role}</div></div>
                    </div>
                  </td>
                  <td className="num pr-c-salary" data-l="Salary">
                    {r.salary > 0 ? <span className="mono strong">{money(r.salary)}</span> : <span className="sub">Not set</span>}
                    {r.changedFrom != null && <div><span className={`pill pill-xs ${r.salary >= r.changedFrom ? 'pill-green' : 'pill-rose'}`}>{r.salary >= r.changedFrom ? '↑' : '↓'} from {money(r.changedFrom)}</span></div>}
                    {r.next && <div className="sub pr-next">{money(r.next.amount)} from {r.next.label}</div>}
                  </td>
                  <td className="pr-c-status" data-l="Status">
                    {r.payment ? (
                      <><span className="pill pill-xs pill-green">Paid {money(r.payment.amount)}</span><div className="sub">{day(r.payment.paidAt)}{r.payment.paidBy ? ` · ${r.payment.paidBy}` : ''}</div></>
                    ) : r.salary > 0 ? <span className="pill pill-xs pill-amber">Unpaid</span> : <span className="pill pill-xs pill-ghost">No salary</span>}
                  </td>
                  <td className="num pr-c-acts">
                    <div className="pr-acts">
                      {r.payment
                        ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => askUndo(r)} disabled={undo.isPending}>Undo</button>
                        : r.salary > 0
                          ? <button type="button" className="btn btn-primary btn-sm" onClick={() => setPayFor([pick(r)])}>Pay</button>
                          : <button type="button" className="btn btn-soft btn-sm" onClick={() => setSalaryFor([pick(r)])}>Set salary</button>}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHistoryOf(r.staffId)}>History</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {salaryFor && current && <SalaryDialog people={salaryFor === 'all' ? null : salaryFor} thisMonth={current} onClose={() => { setSalaryFor(null); setSelected(new Set()); }} />}
      {payFor && <PayDialog people={payFor} month={data.month} label={data.label} onClose={() => { setPayFor(null); setSelected(new Set()); }} />}
      {historyOf && <SalaryHistory staffId={historyOf} onClose={() => setHistoryOf(null)} onChangeSalary={(p) => { setHistoryOf(null); setSalaryFor([{ staffId: p.id, name: p.name }]); }} />}
    </div>
  );
}
