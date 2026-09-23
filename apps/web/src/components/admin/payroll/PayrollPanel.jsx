'use client';

import { useState } from 'react';
import { flushSync } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import useConfirm from '@/hooks/useConfirm';
import useAccess from '@/hooks/useAccess';
import ReceiptDoc from '@/components/admin/ReceiptDoc';
import { usePrintDoc } from '@/components/admin/printShared';
import {
  Button, IconButton, Card, Chip, Kpi, KpiGrid, KpiSkeletons, Table, Th, Td, Tr, EmptyState, RowSkeletons, ErrorState, cx,
} from '@/components/admin/ui';
import SalaryDialog from './SalaryDialog';
import PayDialog from './PayDialog';
import SalaryHistory from './SalaryHistory';
import { ROLE_LABEL, day, initials, money, shiftMonth } from './payrollUi';

/**
 * Staff › Payroll. Pick a month; everyone's salary FOR THAT MONTH (salary
 * history — a raise applies from its month on), paid or not. Select people to
 * raise or pay them together, or act on one row. Paying records a "Salaries"
 * expense; Undo removes it. A paid row prints an 80mm payslip.
 */
export default function PayrollPanel() {
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const { canAct } = useAccess();
  const canPay = canAct('payroll');
  const [month, setMonth] = useState(null); // null = this month (the server decides, in the business time zone)
  const [thisMonth, setThisMonth] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [salaryFor, setSalaryFor] = useState(null); // [] people | null closed | 'all'
  const [payFor, setPayFor] = useState(null);
  const [historyOf, setHistoryOf] = useState(null);
  const [slip, setSlip] = useState(null);
  const [, printDoc] = usePrintDoc('payslip');

  const { data, isLoading, isError, error, refetch } = useQuery({
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
  // Render the payslip with this person's data, then print it (hidden iframe).
  const printSlip = (p) => {
    flushSync(() => setSlip(p));
    printDoc('payslip');
  };
  const slipFromRow = (r) => ({ name: r.name, role: r.role, monthLabel: data.label, salary: r.salary, payment: r.payment });

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="inline-flex items-center gap-2.5" role="group" aria-label="Month">
          <IconButton icon="chevLeft" label="Previous month" size={44} iconSize={18} onClick={() => go(shiftMonth(shown, -1))} disabled={!shown} />
          <span className="min-w-[130px] text-center text-[15px] font-semibold text-mq-ink">{data?.label || '…'}</span>
          <IconButton icon="chevRight" label="Next month" size={44} iconSize={18} onClick={() => go(shiftMonth(shown, 1))} disabled={!shown || shown >= current} />
          {shown && current && shown !== current && <Button variant="ghost" size="sm" onClick={() => go(null)}>This month</Button>}
        </div>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" href="/admin/dashboard/expenses?q=Salaries">Salaries in Expenses</Button>
      </div>

      {isLoading ? <KpiSkeletons count={3} /> : s && (
        <div className="flex flex-col gap-1.5">
          <KpiGrid min={210}>
            <Kpi label={`Payroll · ${data.label}`} value={money(s.due)} foot={`${s.people} ${s.people === 1 ? 'person' : 'people'} on salary`} />
            <Kpi label="Paid" value={money(s.paid)} foot={`${s.people - s.unpaidCount} of ${s.people} paid`} tone="bg-mq-ok" />
            <Kpi label="Outstanding" value={money(s.remaining)} foot={s.unpaidCount ? `${s.unpaidCount} ${s.unpaidCount === 1 ? 'salary' : 'salaries'} to pay` : 'Everyone is paid'} tone={s.unpaidCount ? 'bg-mq-warn' : undefined} />
          </KpiGrid>
          {data.withoutSalary > 0 && (
            <p className="m-0 text-xs text-mq-muted">
              <span className="font-mq-mono">{data.withoutSalary}</span> active {data.withoutSalary === 1 ? 'person has' : 'people have'} no salary set — they’re not counted above.
            </p>
          )}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className={cx('flex items-center gap-2.5 flex-wrap px-4 py-2.5 border-b border-mq-line', selected.size ? 'bg-mq-soft' : 'bg-mq-cream')}>
          {selected.size > 0 ? (
            <>
              <span className="text-[13px] text-mq-ink"><b className="font-mq-mono">{selected.size}</b> selected</span>
              <Button variant="ghost" size="xs" onClick={() => setSelected(new Set())}>Clear</Button>
              <span className="flex-1" />
              {canPay && <Button variant="soft" size="sm" icon="arrowUp" onClick={() => setSalaryFor(chosen.map(pick))}>Change salary</Button>}
              {canPay && <Button variant="primary" size="sm" icon="cash" disabled={!unpaidChosen.length} onClick={() => setPayFor(unpaidChosen.map(pick))}>Pay selected{unpaidChosen.length ? ` · ${unpaidChosen.length}` : ''}</Button>}
            </>
          ) : (
            <>
              <span className="text-[12.5px] text-mq-muted">{canPay ? 'Select people to raise or pay them together' : `${rows.length} on the team`}</span>
              <span className="flex-1" />
              {canPay && <Button variant="soft" size="sm" icon="arrowUp" onClick={() => setSalaryFor('all')} disabled={!rows.length}>Raise everyone</Button>}
              {canPay && (
                <Button variant="primary" size="sm" icon="cash" disabled={!unpaidAll.length} onClick={() => setPayFor(unpaidAll.map(pick))}>
                  {unpaidAll.length ? `Pay all remaining · ${money(unpaidAll.reduce((t, r) => t + r.salary, 0))}` : 'All paid'}
                </Button>
              )}
            </>
          )}
        </div>

        {isLoading ? <RowSkeletons rows={4} /> : isError ? <div className="p-4"><ErrorState error={error} onRetry={refetch} /></div> : rows.length === 0 ? (
          <EmptyState icon="staff" title="No staff yet">Add staff in the Team tab, with a monthly salary.</EmptyState>
        ) : (
          <Table label="Payroll" minW={canPay ? 660 : 600} maxH={560}>
            <thead>
              <tr>
                {canPay && (
                  <Th className="w-[52px]">
                    <label className="inline-grid place-items-center w-11 h-11 -m-3 cursor-pointer" title={allOn ? 'Clear selection' : 'Select everyone'}>
                      <input type="checkbox" className="w-[18px] h-[18px] accent-mq-primary cursor-pointer" checked={allOn} ref={(el) => { if (el) el.indeterminate = selected.size > 0 && !allOn; }} onChange={toggleAll} aria-label="Select everyone" />
                    </label>
                  </Th>
                )}
                <Th>Person</Th>
                <Th align="right">Monthly salary</Th>
                <Th>{data.label}</Th>
                <Th align="right"><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.staffId} selected={selected.has(r.staffId)} tone={r.payment ? undefined : r.salary > 0 ? 'warn' : undefined}>
                  {canPay && (
                    <Td className="w-[52px]">
                      <label className="inline-grid place-items-center w-11 h-11 -m-3 cursor-pointer">
                        <input type="checkbox" className="w-[18px] h-[18px] accent-mq-primary cursor-pointer" checked={selected.has(r.staffId)} onChange={() => toggle(r.staffId)} aria-label={`Select ${r.name}`} />
                      </label>
                    </Td>
                  )}
                  <Td>
                    <span className="inline-flex items-center gap-3 min-w-0">
                      <span className={cx('grid place-items-center w-9 h-9 rounded-[10px] flex-none text-[12.5px] font-semibold', r.isActive ? 'bg-mq-deep text-mq-cream' : 'bg-mq-chip text-mq-chip-ink')} aria-hidden="true">{initials(r.name)}</span>
                      <span className="flex flex-col gap-px min-w-0">
                        <span className="flex items-center gap-1.5 font-semibold text-mq-ink">{r.name}{!r.isActive && <Chip tone="off" small dot={false}>Inactive</Chip>}</span>
                        <span className="text-[11.5px] text-mq-muted">{ROLE_LABEL[r.role] || r.role}</span>
                      </span>
                    </span>
                  </Td>
                  <Td align="right">
                    {r.salary > 0 ? <span className="font-mq-mono tabular-nums font-medium text-mq-ink">{money(r.salary)}</span> : <span className="text-mq-muted">Not set</span>}
                    {r.changedFrom != null && (
                      <div className={cx('text-[11.5px] font-semibold', r.salary >= r.changedFrom ? 'text-mq-ok-ink' : 'text-mq-danger-ink')}>
                        {r.salary >= r.changedFrom ? '↑' : '↓'} from <span className="font-mq-mono">{money(r.changedFrom)}</span>
                      </div>
                    )}
                    {r.next && <div className="text-[11.5px] text-mq-muted"><span className="font-mq-mono">{money(r.next.amount)}</span> from {r.next.label}</div>}
                  </Td>
                  <Td>
                    {r.payment ? (
                      <>
                        <Chip tone="ok" small>Paid <span className="font-mq-mono">{money(r.payment.amount)}</span></Chip>
                        <div className="text-[11.5px] text-mq-muted mt-0.5">{day(r.payment.paidAt)}{r.payment.paidBy ? ` · ${r.payment.paidBy}` : ''}</div>
                      </>
                    ) : r.salary > 0 ? <Chip tone="warn" small>Unpaid</Chip> : <Chip tone="off" small>No salary</Chip>}
                  </Td>
                  <Td align="right">
                    <div className="inline-flex items-center gap-1.5 justify-end flex-wrap">
                      {r.payment ? (
                        <>
                          <Button variant="secondary" size="xs" icon="print" onClick={() => printSlip(slipFromRow(r))}>Payslip</Button>
                          {canPay && <Button variant="ghost" size="xs" onClick={() => askUndo(r)} disabled={undo.isPending}>Undo</Button>}
                        </>
                      ) : canPay && (r.salary > 0
                        ? <Button variant="primary" size="xs" onClick={() => setPayFor([pick(r)])}>Pay</Button>
                        : <Button variant="soft" size="xs" onClick={() => setSalaryFor([pick(r)])}>Set salary</Button>)}
                      <Button variant="ghost" size="xs" onClick={() => setHistoryOf(r.staffId)}>History</Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {salaryFor && current && <SalaryDialog people={salaryFor === 'all' ? null : salaryFor} thisMonth={current} onClose={() => { setSalaryFor(null); setSelected(new Set()); }} />}
      {payFor && <PayDialog people={payFor} month={data.month} label={data.label} onClose={() => { setPayFor(null); setSelected(new Set()); }} />}
      {historyOf && (
        <SalaryHistory
          staffId={historyOf}
          canChange={canPay}
          onClose={() => setHistoryOf(null)}
          onChangeSalary={(p) => { setHistoryOf(null); setSalaryFor([{ staffId: p.id, name: p.name }]); }}
          onPayslip={printSlip}
        />
      )}
      <ReceiptDoc kind="payslip" payslip={slip} />
    </div>
  );
}
