'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson, parseApiError } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import useConfirm from '@/hooks/useConfirm';
import { RowsSkeleton } from '@/components/admin/Skeletons';
import { ROLE_LABEL, day, money } from './payrollUi';

/** Side sheet: one person's salary over time and the months they were paid. */
export default function SalaryHistory({ staffId, onClose, onChangeSalary }) {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['payroll-staff', staffId],
    queryFn: () => fetchJson(`/api/admin/payroll/staff/${staffId}`),
  });
  const cancel = useMutation({
    mutationFn: (id) => fetchJson(`/api/admin/payroll/rates/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify.success('Upcoming salary change cancelled');
      qc.invalidateQueries({ queryKey: ['payroll-staff'] });
      qc.invalidateQueries({ queryKey: ['payroll'] });
      qc.invalidateQueries({ queryKey: ['staff-list'] });
    },
    onError: (e) => notify.error(e, { title: 'Could not cancel the change' }),
  });
  const askCancel = async (r) => {
    if (await confirm({ title: `Cancel the change from ${r.label}?`, body: `${data.person.name} stays on ${money(data.salary)} a month.`, confirmLabel: 'Cancel change' })) cancel.mutate(r.id);
  };

  return (
    <>
      {dialog}
      <div className="sheet-bk open" onClick={onClose} />
      <aside className="sheet open pr-sheet" role="dialog" aria-modal="true" aria-label="Salary history">
        <div className="sheet-h">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow">Salary history</div>
            <div className="h-2">{data?.person.name || '…'}</div>
            {data && <div className="sub">{ROLE_LABEL[data.person.role] || data.person.role} · now {data.salary > 0 ? `${money(data.salary)} / month` : 'no salary'}</div>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </div>
        <div className="sheet-b">
          {isLoading ? <RowsSkeleton rows={4} /> : isError ? <div className="adm-error-banner">{parseApiError(error)}</div> : (
            <>
              <button type="button" className="btn btn-primary btn-block" onClick={() => onChangeSalary(data.person)}>Change salary</button>

              <div className="pr-sec">Salary</div>
              {data.rates.length === 0 ? <div className="sub">No salary set yet.</div> : (
                <ol className="pr-timeline">
                  {data.rates.map((r, i) => {
                    const prev = data.rates[i + 1];
                    return (
                      <li key={r.id}>
                        <span className="pr-dot" aria-hidden="true" />
                        <div className="pr-tl-main">
                          <div><b className="mono">{money(r.amount)}</b> / month{prev && r.amount !== prev.amount && <span className={`pill pill-xs ${r.amount > prev.amount ? 'pill-green' : 'pill-rose'}`}>{r.amount > prev.amount ? '↑' : '↓'} {money(Math.abs(r.amount - prev.amount))}</span>}</div>
                          <div className="sub">{r.label === 'From the start' ? 'From the start' : `${r.upcoming ? 'Starts' : 'From'} ${r.label}`}{r.setBy ? ` · set by ${r.setBy}` : ''}</div>
                        </div>
                        {r.upcoming && <button type="button" className="btn btn-ghost btn-sm" onClick={() => askCancel(r)} disabled={cancel.isPending}>Cancel</button>}
                      </li>
                    );
                  })}
                </ol>
              )}

              <div className="pr-sec">Paid</div>
              {data.payments.length === 0 ? <div className="sub">No salary paid yet.</div> : data.payments.map((p) => (
                <div className="pr-paid-row" key={p.id}>
                  <div><div className="strong">{p.label}</div><div className="sub">{day(p.paidAt)}{p.paidBy ? ` · by ${p.paidBy}` : ''}{p.note ? ` · ${p.note}` : ''}</div></div>
                  <span className="mono strong">{money(p.amount)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
