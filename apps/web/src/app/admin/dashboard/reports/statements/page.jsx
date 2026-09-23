'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { money } from '@/lib/money';
import { printHtml, useBusiness } from '@/components/admin/printShared';
import { ErrorNote } from '@/components/admin/reports/ReportKit';
import { Button, Dot, Kpi, KpiGrid, KpiSkeletons, RowSkeletons, cx } from '@/components/admin/ui';
import YearView, {
  Callout, CashFlowTable, CloseDialog, Line, LineTable, PeriodSelect, ReopenDialog, StatusChip, StmCard, ViewSwitch,
  signed, statusName, whenLong,
} from '@/components/admin/statements/YearView';
import Readiness, { blockedMessage, missingTitle, monthChecklist } from '@/components/admin/statements/Readiness';
import StatementDoc, { STATEMENT_CSS, monthLabel } from '@/components/admin/statements/StatementDoc';

const LINK = 'rpt-noprint font-semibold text-[12.5px] text-mq-cta hover:text-mq-primary';

/**
 * Warnings worth showing in the statement itself: not the "previous month is
 * not closed" one when the checklist already asks for exactly that (checks.prevMonth).
 */
const ownWarnings = (warnings, checks) => (warnings || []).filter((w) => !(checks?.prevMonth && w.startsWith(`${checks.prevMonth} `)));

export default function StatementsPage() {
  const view = useSearchParams().get('view');
  return view === 'year' ? <YearView /> : <MonthView />;
}

function MonthView() {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const business = useBusiness();
  const docRef = useRef(null);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);

  const months = useQuery({ queryKey: ['statement-months'], queryFn: () => fetchJson('/api/admin/statements/months') });
  const list = months.data?.months || [];
  // Default: the latest month that has ended (the one you would close next).
  const fallback = (list.find((m) => m.status !== 'running') || list[0])?.month;
  const urlMonth = sp.get('month');
  const month = list.some((m) => m.month === urlMonth) ? urlMonth : fallback;
  const pick = (m) => router.replace(`${pathname}?month=${m}`, { scroll: false });
  const running = list.find((m) => m.status === 'running')?.month;

  const stmt = useQuery({ queryKey: ['statement', month], queryFn: () => fetchJson(`/api/admin/statements/month/${month}`), enabled: !!month });
  const d = stmt.data;
  const st = d?.statement;
  const closed = d?.status === 'closed';
  const ready = st && !st.blocked;
  const checklist = monthChecklist(d?.checks);
  const closeTitle = d?.canClose ? undefined : blockedMessage(st?.blocked) || missingTitle(checklist);

  const afterChange = (data) => {
    if (data) qc.setQueryData(['statement', month], data);
    ['statement', 'statement-months', 'day-close', 'day-close-list', 'account-balances', 'overview'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
  const print = () => {
    const node = docRef.current;
    if (node) printHtml(node.innerHTML, STATEMENT_CSS);
  };

  return (
    <>
      <div className="flex items-center gap-2.5 flex-wrap rpt-noprint">
        <ViewSwitch view="month" />
        <PeriodSelect label="Month" value={month} onChange={pick} options={list.map((m) => ({ value: m.month, label: `${monthLabel(m.month)} · ${statusName(m.status)}` }))} />
        {/* The month list says "running" for the current month; the statement itself only knows open/closed. */}
        {d && <StatusChip status={closed ? 'closed' : list.find((m) => m.month === month)?.status || d.status} />}
        <span className="flex-1" />
        {ready && <Button variant="secondary" size="md" icon="print" onClick={print}>Print (A4)</Button>}
        {d && !closed && <Button variant="primary" size="md" onClick={() => setClosing(true)} disabled={!d.canClose} title={closeTitle}>Close month</Button>}
        {closed && <Button variant="secondary" size="md" onClick={() => setReopening(true)}>Reopen month</Button>}
      </div>

      {running && running !== month && <LiveBanner month={running} onOpen={() => pick(running)} />}

      {months.isError && <ErrorNote error={months.error} />}
      {stmt.isError && <ErrorNote error={stmt.error} />}
      {months.isSuccess && list.length === 0 && <Callout tone="info">No months to show yet. Statements start at the opening balances date.</Callout>}

      {(months.isLoading || stmt.isLoading) && <><KpiSkeletons count={3} min={210} /><RowSkeletons rows={8} /></>}

      {d && st?.blocked === 'needs-opening' && (
        <Callout tone="warn">The opening balances have not been set, so there is nothing to report yet. <Link className={LINK} href="/admin/dashboard/settings/money">Set them in Settings › Money →</Link></Callout>
      )}
      {d && st?.blocked === 'before-opening' && (
        <Callout tone="info">{monthLabel(month)} is before the opening balances date{st.openingDate ? ` (${st.openingDate})` : ''}. Books start from that day, so there are no statements for this month.</Callout>
      )}

      {closed && <Callout tone="ok">Closed {whenLong(d.closedAt)}. Every day of the month is locked and these figures are frozen.</Callout>}
      {d && !closed && d.reopened && <Callout tone="info">This month was reopened{d.reopened.reason ? `: ${d.reopened.reason}` : ''}. Figures are live until you close it again.</Callout>}
      {d && !closed && st?.blocked && st.blocked !== 'needs-opening' && st.blocked !== 'before-opening' && (
        <Callout tone="warn">{monthLabel(month)} cannot be closed or reported yet.</Callout>
      )}
      {d && !closed && !st?.blocked && <Readiness items={checklist} title={`Before ${monthLabel(month)} can be closed`} />}

      {ready && <StatementBody st={st} warnings={ownWarnings(st.warnings, d.checks)} />}

      {ready && <StatementDoc ref={docRef} business={business.name} month={month} statement={st} closedAt={closed ? d.closedAt : null} />}

      {closing && (
        <CloseDialog
          what={monthLabel(month)} url={`/api/admin/statements/month/${month}`}
          points={[
            'Locks every day of the month. Sales, expenses and the cash book for those days can no longer be changed.',
            'Freezes these statements as they are now.',
            'Makes this month’s closing balances the next month’s opening balances.',
          ]}
          onClose={() => setClosing(false)} onDone={(data) => { setClosing(false); notify.success(`${monthLabel(month)} closed`); afterChange(data); }}
        />
      )}
      {reopening && (
        <ReopenDialog
          what={monthLabel(month)} url={`/api/admin/statements/month/${month}/reopen`}
          note="The days of this month unlock and the frozen statements are replaced when you close it again. Only the newest closed month can be reopened."
          onClose={() => setReopening(false)} onDone={() => { setReopening(false); notify.success(`${monthLabel(month)} reopened`); afterChange(null); }}
        />
      )}
    </>
  );
}

/**
 * The running month, always live, while another month is on screen. Same
 * query key/shape as the month statement, so opening it is instant.
 */
function LiveBanner({ month, onOpen }) {
  const { data } = useQuery({ queryKey: ['statement', month], queryFn: () => fetchJson(`/api/admin/statements/month/${month}`) });
  const p = data?.statement && !data.statement.blocked ? data.statement.pnl : null;
  const [y, m] = month.split('-').map(Number);
  const daysIn = new Date(y, m, 0).getDate();
  const now = new Date();
  const today = now.getFullYear() === y && now.getMonth() + 1 === m ? now.getDate() : daysIn;
  const fig = (label, v) => (
    <span className="flex flex-col gap-px">
      <span className="text-[11.5px] text-mq-info-ink">{label}</span>
      <span className="font-mq-mono text-[17px] font-semibold tabular-nums">{p ? money(v) : '…'}</span>
    </span>
  );
  if (data && !p) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rpt-noprint w-full text-left flex items-center gap-4 flex-wrap border border-mq-info-line bg-mq-info-bg hover:border-mq-info rounded-xl px-4 py-3.5 text-mq-ink transition-colors focus-visible:outline-none focus-visible:shadow-mq-focus"
    >
      <span className="flex flex-col gap-0.5 min-w-0" style={{ flex: '1 1 200px' }}>
        <span className="inline-flex items-center gap-[7px] text-[11px] font-bold uppercase tracking-[.1em] text-mq-info-ink"><Dot tone="info" pulse />This month so far · always live</span>
        <span className="text-[15px] font-semibold">{monthLabel(month)} · running, {today} of {daysIn} days</span>
      </span>
      <span className="flex gap-[22px] flex-wrap">
        {fig('Net sales', p?.sales.net)}
        {fig('Gross profit', p?.grossProfit)}
        {fig('Net profit', p?.netProfit)}
      </span>
      <span className="text-[12.5px] font-semibold text-mq-info-ink whitespace-nowrap">Open statement →</span>
    </button>
  );
}

function StatementBody({ st, warnings = [] }) {
  const p = st.pnl;
  const pos = st.position;
  const gap = pos.check ? Math.abs(pos.check.unexplained) >= 0.01 : false;

  return (
    <>
      {warnings.length > 0 && (
        <Callout tone="warn" title={warnings.length === 1 ? 'One thing to check' : `${warnings.length} things to check`}>
          <ul className="m-0 pl-4 list-disc">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </Callout>
      )}
      <KpiGrid min={210}>
        <Kpi label="Net sales" value={money(p.sales.net)} foot={`${p.sales.count} sales`} />
        <Kpi label="Gross profit" value={money(p.grossProfit)} foot={p.foodCostPct != null ? `food cost ${p.foodCostPct}%` : 'no closing stock count'} />
        <Kpi label="Net profit" value={money(p.netProfit)} foot="after all costs" />
      </KpiGrid>

      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
        <StmCard title="Profit & loss" sub="What the month earned">
          <LineTable label="Profit and loss">
            <Line k={`Sales (${p.sales.count})`} v={money(p.sales.gross)} />
            <Line sub k="Less discounts" v={`−${money(p.sales.discounts)}`} />
            <Line sub k={`Less refunds (${p.sales.refundCount})`} v={`−${money(p.sales.refunds)}`} />
            <Line strong k="Net sales" v={money(p.sales.net)} />

            <Line sub k="Opening stock" v={money(p.openingStock)} />
            <Line sub k="Plus purchases" v={money(p.purchases)} />
            <Line sub k="Less closing stock" v={p.closingStock == null ? <span className="font-mq text-xs font-semibold text-mq-warn-ink">not counted</span> : `−${money(p.closingStock)}`} />
            <Line k="Cost of goods" v={`−${money(p.cogs)}`} />
            <Line strong k={<>Gross profit{p.foodCostPct != null && <span className="ml-2 text-xs font-medium text-mq-muted">food cost {p.foodCostPct}%</span>}</>} v={money(p.grossProfit)} />

            <Line k={<>Operating expenses <Link className={LINK} href="/admin/dashboard/expenses">see each one →</Link></>} v={`−${money(p.operating.total)}`} />
            {p.operating.byCategory.map((c) => <Line key={c.category} sub k={<span className="capitalize">{c.category}</span>} v={money(c.amount)} />)}
            <Line k={<>Payroll <Link className={LINK} href="/admin/dashboard/users?tab=payroll">salaries →</Link></>} v={`−${money(p.payroll)}`} />
            <Line k="Cash over / short" v={signed(p.overShort)} />
            <Line net k="Net profit" v={money(p.netProfit)} negative={p.netProfit < 0} />
          </LineTable>
        </StmCard>

        <div className="flex flex-col gap-4 min-w-0">
          <StmCard title="Cash flow" sub="Money in each account">
            <CashFlowTable cf={st.cashFlow} />
          </StmCard>

          <StmCard title="Business position" sub="What the business is worth on the last day">
            <LineTable label="Business position">
              <Line k={<>Business money <Link className={LINK} href="/admin/dashboard/cash">accounts →</Link></>} v={money(pos.money)} />
              <Line k="Stock value" v={money(pos.stock)} />
              <Line k={<>Customers owe us <Link className={LINK} href="/admin/dashboard/customers">customers →</Link></>} v={money(pos.customersOwe)} />
              <Line k={<>Suppliers are owed <Link className={LINK} href="/admin/dashboard/expenses?tab=suppliers">suppliers →</Link></>} v={`−${money(pos.suppliersOwed)}`} />
              <Line k="Salaries unpaid" v={`−${money(pos.salariesUnpaid)}`} />
              <Line net k="Net position" v={money(pos.net)} negative={pos.net < 0} />
            </LineTable>

            <div className="px-4 py-3.5 flex flex-col gap-2 text-[13px] border-t border-mq-chip">
              {pos.check ? (
                <>
                  <h4 className="m-0 text-[11px] font-semibold uppercase tracking-[.1em] text-mq-muted">Check against last month</h4>
                  <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
                    <dt className="text-mq-on-tint">Last month’s net position</dt><dd className="m-0 font-mq-mono tabular-nums text-right">{money(pos.check.previous)}</dd>
                    <dt className="text-mq-on-tint">Change vs last month</dt><dd className="m-0 font-mq-mono tabular-nums text-right">{signed(pos.check.change)}</dd>
                    <dt className="text-mq-on-tint">Explained by profit ({money(p.netProfit)}) and owner money (in {money(pos.ownerIn)}, out {money(pos.ownerOut)})</dt>
                    <dd className="m-0 font-mq-mono tabular-nums text-right">{signed(pos.check.expected)}</dd>
                    <dt className={cx('font-semibold', gap ? 'text-mq-danger-ink' : 'text-mq-ink')}>Unexplained</dt>
                    <dd className={cx('m-0 font-mq-mono tabular-nums text-right font-semibold', gap ? 'text-mq-danger-ink' : 'text-mq-ink')}>{signed(pos.check.unexplained)}</dd>
                  </dl>
                  {gap
                    ? <Callout tone="danger">Something changed the business’s worth that is not profit or owner money. Look for stock adjustments, unrecorded expenses or corrections in the cash book.</Callout>
                    : <p className="m-0 text-mq-ok-ink">The change is fully explained.</p>}
                </>
              ) : <p className="m-0 text-mq-muted">There is no earlier closed month to compare with.</p>}
            </div>
          </StmCard>
        </div>
      </div>
    </>
  );
}
