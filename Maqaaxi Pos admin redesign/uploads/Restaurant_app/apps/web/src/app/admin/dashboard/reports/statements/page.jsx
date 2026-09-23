'use client';

import { Fragment, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { useFormValidation } from '@/lib/formValidation';
import Field from '@/components/admin/Field';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';
import { printHtml, useBusiness } from '@/components/admin/printShared';
import { Card, ErrorNote, Kpi, money } from '@/components/admin/reports/ReportKit';
import Modal from '@/components/admin/Modal';
import YearView, { Callout, ViewSwitch } from '@/components/admin/statements/YearView';
import Readiness, { blockedMessage, missingTitle, monthChecklist } from '@/components/admin/statements/Readiness';
import StatementDoc, { STATEMENT_CSS, kindName, monthLabel } from '@/components/admin/statements/StatementDoc';

const JSON_H = { 'Content-Type': 'application/json' };
const acct = (a) => (a.kind === 'cash' ? 'Cash' : a.label);
const signed = (n) => (Number(n) < 0 ? '-' : '+') + money(Math.abs(Number(n)));
const STATUS = { closed: ['Closed', 'pill-green'], open: ['Open', 'pill-amber'], running: ['Running', 'pill-sky'] };
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const PrintIc = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>;

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
      <div className="toolbar rpt-noprint">
        <ViewSwitch view="month" />
        <select className="input rpt-preset stm-month" value={month || ''} onChange={(e) => pick(e.target.value)} aria-label="Month" disabled={!list.length}>
          {list.map((m) => <option key={m.month} value={m.month}>{monthLabel(m.month)} · {STATUS[m.status]?.[0] || m.status}</option>)}
        </select>
        {d && <span className={`pill ${STATUS[d.status]?.[1] || 'pill-ghost'}`}><span className="pdot" />{STATUS[d.status]?.[0]}</span>}
        <div className="grow" />
        {ready && <button className="btn btn-ghost" onClick={print}>{PrintIc}Print (A4)</button>}
        {d && !closed && <button className="btn btn-primary" onClick={() => setClosing(true)} disabled={!d.canClose} title={closeTitle}>Close month</button>}
        {closed && <button className="btn btn-ghost" onClick={() => setReopening(true)}>Reopen month</button>}
      </div>

      {months.isError && <ErrorNote error={months.error} />}
      {stmt.isError && <ErrorNote error={stmt.error} />}
      {months.isSuccess && list.length === 0 && <Callout tone="info">No months to show yet. Statements start at the opening balances date.</Callout>}

      {(months.isLoading || stmt.isLoading) && <><KpiRowSkeleton count={3} style={{ marginBottom: 16 }} /><RowsSkeleton rows={8} /></>}

      {d && st?.blocked === 'needs-opening' && (
        <Callout tone="warn">The opening balances have not been set, so there is nothing to report yet. <Link className="cash-link" href="/admin/dashboard/settings/money">Set them in Settings &rsaquo; Money →</Link></Callout>
      )}
      {d && st?.blocked === 'before-opening' && (
        <Callout tone="info">{monthLabel(month)} is before the opening balances date{st.openingDate ? ` (${st.openingDate})` : ''}. Books start from that day, so there are no statements for this month.</Callout>
      )}

      {closed && <Callout tone="ok">Closed {when(d.closedAt)}. Every day of the month is locked and these figures are frozen.</Callout>}
      {d && !closed && d.reopened && <Callout tone="info">This month was reopened{d.reopened.reason ? `: ${d.reopened.reason}` : ''}. Figures are live until you close it again.</Callout>}
      {d && !closed && st?.blocked && st.blocked !== 'needs-opening' && st.blocked !== 'before-opening' && (
        <Callout tone="warn">{monthLabel(month)} cannot be closed or reported yet.</Callout>
      )}
      {d && !closed && !st?.blocked && <Readiness items={checklist} />}

      {ready && <StatementBody st={st} warnings={ownWarnings(st.warnings, d.checks)} />}

      {ready && <StatementDoc ref={docRef} business={business.name} month={month} statement={st} closedAt={closed ? d.closedAt : null} />}

      {closing && <CloseDialog month={month} onClose={() => setClosing(false)} onDone={(data) => { setClosing(false); notify.success(`${monthLabel(month)} closed`); afterChange(data); }} />}
      {reopening && <ReopenDialog month={month} onClose={() => setReopening(false)} onDone={() => { setReopening(false); notify.success(`${monthLabel(month)} reopened`); afterChange(null); }} />}
    </>
  );
}

function StatementBody({ st, warnings = [] }) {
  const p = st.pnl;
  const cf = st.cashFlow;
  const pos = st.position;
  const [open, setOpen] = useState(() => new Set());
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const gap = pos.check ? Math.abs(pos.check.unexplained) >= 0.01 : false;

  return (
    <>
      {warnings.length > 0 && <Callout tone="warn"><ul className="stm-list">{warnings.map((w) => <li key={w}>{w}</li>)}</ul></Callout>}
      <div className="kpi-row rpt-kpis">
        <Kpi label="Net sales" tone="green" value={money(p.sales.net)} foot={`${p.sales.count} sales`} />
        <Kpi label="Gross profit" tone="green" value={money(p.grossProfit)} foot={p.foodCostPct != null ? `food cost ${p.foodCostPct}%` : 'no closing stock count'} />
        <Kpi label="Net profit" tone={p.netProfit >= 0 ? 'green' : 'rose'} value={money(p.netProfit)} foot="after all costs" />
      </div>

      <Card eyebrow="Profit & loss" title="What the month earned">
        <table className="table rpt-pnl stm-pnl">
          <tbody>
            <tr><td>Sales ({p.sales.count})</td><td className="num">{money(p.sales.gross)}</td></tr>
            <tr className="stm-sub"><td>Less discounts</td><td className="num">−{money(p.sales.discounts)}</td></tr>
            <tr className="stm-sub"><td>Less refunds ({p.sales.refundCount})</td><td className="num">−{money(p.sales.refunds)}</td></tr>
            <tr className="strong"><td>Net sales</td><td className="num">{money(p.sales.net)}</td></tr>

            <tr className="stm-sub"><td>Opening stock</td><td className="num">{money(p.openingStock)}</td></tr>
            <tr className="stm-sub"><td>Plus purchases</td><td className="num">{money(p.purchases)}</td></tr>
            <tr className="stm-sub"><td>Less closing stock</td><td className="num">{p.closingStock == null ? <span className="pill pill-amber">not counted</span> : `−${money(p.closingStock)}`}</td></tr>
            <tr><td>Cost of goods</td><td className="num">−{money(p.cogs)}</td></tr>
            <tr className="strong"><td>Gross profit{p.foodCostPct != null && <span className="pill pill-ghost" style={{ marginLeft: 8 }}>food cost {p.foodCostPct}%</span>}</td><td className="num">{money(p.grossProfit)}</td></tr>

            <tr><td>Operating expenses <Link className="rpt-noprint" href="/admin/dashboard/expenses">see each one →</Link></td><td className="num">−{money(p.operating.total)}</td></tr>
            {p.operating.byCategory.map((c) => <tr key={c.category} className="stm-sub"><td style={{ textTransform: 'capitalize' }}>{c.category}</td><td className="num">{money(c.amount)}</td></tr>)}
            <tr><td>Payroll <Link className="rpt-noprint" href="/admin/dashboard/users?tab=payroll">salaries →</Link></td><td className="num">−{money(p.payroll)}</td></tr>
            <tr><td>Cash over / short</td><td className="num">{signed(p.overShort)}</td></tr>
            <tr className="strong rpt-net"><td>Net profit</td><td className="num" style={{ color: p.netProfit < 0 ? 'var(--rose)' : undefined }}>{money(p.netProfit)}</td></tr>
          </tbody>
        </table>
      </Card>

      <Card eyebrow="Cash flow" title="Money in each account" flush>
        <div className="table-wrap">
          <table className="table stm-cf">
            <thead><tr><th>Account</th><th className="num">Opening</th><th className="num">In</th><th className="num">Out</th><th className="num">Closing</th></tr></thead>
            <tbody>
              {cf.accounts.map((a) => {
                const kinds = Object.entries(a.byKind || {}).filter(([, v]) => Number(v) !== 0);
                const on = open.has(a.accountId);
                return (
                  <Fragment key={a.accountId}>
                    <tr>
                      <td className="strong">
                        {kinds.length > 0
                          ? <button className="stm-x" aria-expanded={on} onClick={() => toggle(a.accountId)}><span aria-hidden="true">{on ? '▾' : '▸'}</span> {acct(a)}</button>
                          : acct(a)}
                      </td>
                      <td className="num">{money(a.opening)}</td><td className="num">{money(a.moneyIn)}</td><td className="num">{money(a.moneyOut)}</td><td className="num strong">{money(a.closing)}</td>
                    </tr>
                    {on && kinds.map(([k, v]) => (
                      <tr key={k} className="stm-sub"><td colSpan={4} style={{ paddingLeft: 34 }}>{kindName(k)}</td><td className="num">{signed(v)}</td></tr>
                    ))}
                  </Fragment>
                );
              })}
              <tr className="strong stm-total"><td>Total</td><td className="num">{money(cf.total.opening)}</td><td className="num">{money(cf.total.moneyIn)}</td><td className="num">{money(cf.total.moneyOut)}</td><td className="num">{money(cf.total.closing)}</td></tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card eyebrow="Business position" title="What the business is worth on the last day">
        <table className="table rpt-pnl stm-pnl">
          <tbody>
            <tr><td>Business money <Link className="rpt-noprint" href="/admin/dashboard/cash">accounts →</Link></td><td className="num">{money(pos.money)}</td></tr>
            <tr><td>Stock value</td><td className="num">{money(pos.stock)}</td></tr>
            <tr><td>Customers owe us <Link className="rpt-noprint" href="/admin/dashboard/customers">customers →</Link></td><td className="num">{money(pos.customersOwe)}</td></tr>
            <tr><td>Suppliers are owed <Link className="rpt-noprint" href="/admin/dashboard/expenses?tab=suppliers">suppliers →</Link></td><td className="num">−{money(pos.suppliersOwed)}</td></tr>
            <tr><td>Salaries unpaid</td><td className="num">−{money(pos.salariesUnpaid)}</td></tr>
            <tr className="strong rpt-net"><td>Net position</td><td className="num">{money(pos.net)}</td></tr>
          </tbody>
        </table>

        {pos.check ? (
          <div className="stm-check">
            <div className="stm-h" style={{ marginTop: 14 }}>Check against last month</div>
            <dl className="dc-kv">
              <dt>Last month&rsquo;s net position</dt><dd>{money(pos.check.previous)}</dd>
              <dt>Change vs last month</dt><dd>{signed(pos.check.change)}</dd>
              <dt>Explained by profit ({money(p.netProfit)}) and owner money (in {money(pos.ownerIn)}, out {money(pos.ownerOut)})</dt><dd>{signed(pos.check.expected)}</dd>
              <dt className={gap ? 'stm-gap' : ''}>Unexplained</dt><dd className={gap ? 'stm-gap' : ''}>{signed(pos.check.unexplained)}</dd>
            </dl>
            {gap
              ? <p className="stm-gap-note">Something changed the business&rsquo;s worth that is not profit or owner money. Look for stock adjustments, unrecorded expenses or corrections in the cash book.</p>
              : <p className="note" style={{ marginTop: 8 }}>The change is fully explained.</p>}
          </div>
        ) : <p className="note" style={{ marginTop: 12 }}>There is no earlier closed month to compare with.</p>}
      </Card>
    </>
  );
}

const reopenSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason for reopening — at least 3 characters') });

function CloseDialog({ month, onClose, onDone }) {
  const close = useMutation({
    mutationFn: () => fetchJson(`/api/admin/statements/month/${month}`, { method: 'POST' }),
    onSuccess: onDone,
    onError: (e) => notify.error(e, { title: 'Could not close the month' }),
  });
  return (
    <Modal eyebrow="Close month" title={`Close ${monthLabel(month)}?`} onClose={onClose} busy={close.isPending}>
      <div className="modal-b">
        <p className="stm-p">Closing the month:</p>
        <ul className="stm-list">
          <li>Locks every day of the month. Sales, expenses and the cash book for those days can no longer be changed.</li>
          <li>Freezes these statements as they are now.</li>
          <li>Makes this month&rsquo;s closing balances the next month&rsquo;s opening balances.</li>
        </ul>
        <p className="stm-p">A mistake can still be fixed by reopening the newest closed month, with a reason.</p>
      </div>
      <div className="modal-f">
        <button className="btn btn-ghost" onClick={onClose} disabled={close.isPending}>Cancel</button>
        <button className="btn btn-primary" onClick={() => close.mutate()} disabled={close.isPending}>{close.isPending ? 'Closing…' : 'Close month'}</button>
      </div>
    </Modal>
  );
}

function ReopenDialog({ month, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const form = useFormValidation(reopenSchema, { reason });
  const reopen = useMutation({
    mutationFn: (body) => fetchJson(`/api/admin/statements/month/${month}/reopen`, { method: 'POST', headers: JSON_H, body: JSON.stringify(body) }),
    onSuccess: onDone,
    onError: (e) => notify.error(e, { title: 'Could not reopen the month' }),
  });
  const submit = (e) => {
    e.preventDefault();
    if (!form.check() || reopen.isPending) return;
    reopen.mutate({ reason: form.data.reason });
  };
  return (
    <Modal eyebrow="Reopen month" title={`Reopen ${monthLabel(month)}?`} onClose={onClose} busy={reopen.isPending}>
      <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
        <div className="modal-b">
          <p className="stm-p">The days of this month unlock and the frozen statements are replaced when you close it again. Only the newest closed month can be reopened. The reason is kept on record.</p>
          <Field label="Reason" required {...form.fieldProps('reason')}>
            <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs correcting?" autoFocus />
          </Field>
        </div>
        <div className="modal-f">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={reopen.isPending}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!form.valid || reopen.isPending}>{reopen.isPending ? 'Reopening…' : 'Reopen month'}</button>
        </div>
      </form>
    </Modal>
  );
}
