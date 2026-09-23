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
import Readiness, { blockedMessage, missingTitle, yearChecklist } from './Readiness';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';
import { printHtml, useBusiness } from '@/components/admin/printShared';
import { Card, ErrorNote, Kpi, money } from '@/components/admin/reports/ReportKit';
import Modal from '@/components/admin/Modal';
import { monthLabel } from './StatementDoc';
import AnnualStatementDoc, { ANNUAL_CSS } from './AnnualStatementDoc';

const JSON_H = { 'Content-Type': 'application/json' };
const acct = (a) => (a.kind === 'cash' ? 'Cash' : a.label);
const signed = (n) => (Number(n) < 0 ? '-' : '+') + money(Math.abs(Number(n)));
const shortMonth = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short' });
const STATUS = { closed: ['Closed', 'pill-green'], open: ['Open', 'pill-amber'], running: ['Running', 'pill-sky'] };
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const PrintIc = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>;
const DownIc = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>;
const PACK = [['sales', 'Sales'], ['cashbook', 'Cash book'], ['expenses', 'Expenses'], ['payroll', 'Payroll'], ['stockcounts', 'Stock counts']];

export function Callout({ tone = 'info', title, children }) {
  return <div className={`stm-callout tone-${tone}`} role={tone === 'warn' ? 'alert' : undefined}>{title && <b className="stm-callout-t">{title}</b>}{children}</div>;
}

/** Month | Year switch, kept in the URL (?view=year). */
export function ViewSwitch({ view }) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (v) => router.replace(`${pathname}?view=${v}`, { scroll: false });
  return (
    <div className="seg" role="group" aria-label="Statement period">
      <button type="button" className={view === 'month' ? 'active' : ''} aria-pressed={view === 'month'} onClick={() => go('month')}>Month</button>
      <button type="button" className={view === 'year' ? 'active' : ''} aria-pressed={view === 'year'} onClick={() => go('year')}>Year</button>
    </div>
  );
}

export default function YearView() {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const business = useBusiness();
  const docRef = useRef(null);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);

  const years = useQuery({ queryKey: ['statement-years'], queryFn: () => fetchJson('/api/admin/statements/years') });
  const list = years.data?.years || [];
  const fallback = (list.find((y) => y.status !== 'running') || list[0])?.year;
  const urlYear = sp.get('year');
  const fy = list.some((y) => y.year === urlYear) ? urlYear : fallback;
  const pick = (y) => router.replace(`${pathname}?view=year&year=${y}`, { scroll: false });

  const q = useQuery({ queryKey: ['statement-year', fy], queryFn: () => fetchJson(`/api/admin/statements/year/${fy}`), enabled: !!fy });
  const d = q.data;
  const st = d?.statement;
  const closed = d?.status === 'closed';
  const ready = !!st && !d?.blocked;
  // Built only from the API's structured checks — never from blocker text.
  const checklist = yearChecklist(d?.checks);
  const closeTitle = d?.canClose ? undefined : blockedMessage(d?.blocked) || missingTitle(checklist);

  const afterChange = (data) => {
    if (data) qc.setQueryData(['statement-year', fy], data);
    ['statement-year', 'statement-years', 'statement', 'statement-months', 'day-close', 'day-close-list', 'account-balances', 'overview'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
  const print = () => { const node = docRef.current; if (node) printHtml(node.innerHTML, ANNUAL_CSS); };

  return (
    <>
      <div className="toolbar rpt-noprint">
        <ViewSwitch view="year" />
        <select className="input rpt-preset stm-month" value={fy || ''} onChange={(e) => pick(e.target.value)} aria-label="Financial year" disabled={!list.length}>
          {list.map((y) => <option key={y.year} value={y.year}>{y.year} · {STATUS[y.status]?.[0] || y.status}</option>)}
        </select>
        {d && <span className={`pill ${STATUS[d.status]?.[1] || 'pill-ghost'}`}><span className="pdot" />{STATUS[d.status]?.[0]}</span>}
        <div className="grow" />
        {ready && <button className="btn btn-ghost" onClick={print}>{PrintIc}Print annual statements (PDF)</button>}
        {d && !closed && <button className="btn btn-primary" onClick={() => setClosing(true)} disabled={!d.canClose} title={closeTitle}>Close year</button>}
        {closed && <button className="btn btn-ghost" onClick={() => setReopening(true)}>Reopen year</button>}
      </div>

      {years.isError && <ErrorNote error={years.error} />}
      {q.isError && <ErrorNote error={q.error} />}
      {years.isSuccess && list.length === 0 && (
        <Callout tone="warn">There are no financial years yet because the opening balances have not been set. <Link className="cash-link" href="/admin/dashboard/settings/money">Set them in Settings &rsaquo; Money →</Link></Callout>
      )}
      {(years.isLoading || q.isLoading) && <><KpiRowSkeleton count={3} style={{ marginBottom: 16 }} /><RowsSkeleton rows={8} /></>}

      {d?.blocked === 'needs-opening' && (
        <Callout tone="warn">The opening balances have not been set, so there is nothing to report yet. <Link className="cash-link" href="/admin/dashboard/settings/money">Set them in Settings &rsaquo; Money →</Link></Callout>
      )}
      {d?.blocked === 'before-opening' && (
        <Callout tone="info">{d.year} ends before the opening balances date. Books start from that day, so there are no statements for this year. <Link className="cash-link" href="/admin/dashboard/settings/money">Settings &rsaquo; Money →</Link></Callout>
      )}

      {closed && <Callout tone="ok">Closed {when(d.closedAt)}. Every month of the year is locked and these figures are frozen.</Callout>}
      {d && !closed && d.reopened && <Callout tone="info">This year was reopened{d.reopened.reason ? `: ${d.reopened.reason}` : ''}. Figures are live until you close it again.</Callout>}
      {d && !closed && !d.blocked && <Readiness items={checklist} />}
      {d && !closed && !d.blocked && !st && d.months?.length > 0 && (
        <Callout tone="info">No month of this year is closed yet, so the annual figures are empty. The statements are built from the closed months.</Callout>
      )}

      {ready && <YearBody st={st} />}
      {ready && <YearPack fy={fy} />}

      {ready && <AnnualStatementDoc ref={docRef} business={business.name} year={fy} statement={st} closedAt={closed ? d.closedAt : null} />}

      {closing && <CloseDialog fy={fy} onClose={() => setClosing(false)} onDone={(data) => { setClosing(false); notify.success(`${fy} closed`); afterChange(data); }} />}
      {reopening && <ReopenDialog fy={fy} onClose={() => setReopening(false)} onDone={() => { setReopening(false); notify.success(`${fy} reopened`); afterChange(null); }} />}
    </>
  );
}

function YearBody({ st }) {
  const p = st.pnl;
  const cf = st.cashFlow;
  const pos = st.position;
  const ow = st.owner;
  const [open, setOpen] = useState(() => new Set());
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // [label, key in each month row, year total, shown negative, bold, signed]
  const cols = [
    ['Net sales', 'net', p.sales.net], ['Cost of goods', 'cogs', p.cogs, true], ['Gross profit', 'grossProfit', p.grossProfit, false, true],
    ['Operating expenses', 'operating', p.operating.total, true], ['Payroll', 'payroll', p.payroll, true], ['Over / short', 'overShort', p.overShort, false, false, true],
    ['Net profit', 'netProfit', p.netProfit, false, true],
  ];
  const cell = (v, neg, sgn) => (sgn ? signed(v) : neg ? `−${money(v)}` : money(v));

  return (
    <>
      <div className="kpi-row rpt-kpis">
        <Kpi label="Net sales" tone="green" value={money(p.sales.net)} foot={`${p.sales.count} sales`} />
        <Kpi label="Gross profit" tone="green" value={money(p.grossProfit)} foot={p.foodCostPct != null ? `food cost ${p.foodCostPct}%` : 'no closing stock count'} />
        <Kpi label="Net profit" tone={p.netProfit >= 0 ? 'green' : 'rose'} value={money(p.netProfit)} foot="after all costs" />
      </div>

      <Card eyebrow="Profit & loss" title="Profit & loss for the year" flush>
        <div className="table-wrap">
          <table className="table yr-months">
            <thead><tr><th>&nbsp;</th>{st.months.map((x) => <th key={x.month} className="num" title={monthLabel(x.month)}>{shortMonth(x.month)}</th>)}<th className="num">Total</th></tr></thead>
            <tbody>
              {cols.map(([label, key, total, neg, strong, sgn]) => (
                <tr key={key} className={strong ? 'strong' : ''}>
                  <td className="yr-k">{label}</td>
                  {st.months.map((x) => <td key={x.month} className="num">{cell(x[key], neg, sgn)}</td>)}
                  <td className="num strong">{cell(total, neg, sgn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note yr-foot">
          {p.foodCostPct != null ? `Food cost for the year: ${p.foodCostPct}%` : 'Food cost is not available because there is no closing stock count'} · discounts {money(p.sales.discounts)} · refunds {money(p.sales.refunds)}
        </p>
      </Card>

      <Card eyebrow="Operating expenses" title="Where the year's costs went" action={<Link className="btn btn-ghost btn-sm rpt-noprint" href="/admin/dashboard/expenses">Expenses →</Link>}>
        {p.operating.byCategory.length === 0 ? <div className="sub">No operating expenses this year.</div> : (
          <table className="table rpt-pnl stm-pnl">
            <tbody>
              {p.operating.byCategory.map((c) => <tr key={c.category}><td style={{ textTransform: 'capitalize' }}>{c.category}</td><td className="num">{money(c.amount)}</td></tr>)}
              <tr className="strong rpt-net"><td>Total operating expenses</td><td className="num">{money(p.operating.total)}</td></tr>
            </tbody>
          </table>
        )}
      </Card>

      <Card eyebrow="Cash flow" title="Cash flow per account for the year" flush>
        <div className="table-wrap">
          <table className="table stm-cf">
            <thead><tr><th>Account</th><th className="num">Opening (day 1)</th><th className="num">In</th><th className="num">Out</th><th className="num">Closing (last day)</th></tr></thead>
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
                    {on && kinds.map(([k, v]) => <tr key={k} className="stm-sub"><td colSpan={4} style={{ paddingLeft: 34, textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</td><td className="num">{signed(v)}</td></tr>)}
                  </Fragment>
                );
              })}
              <tr className="strong stm-total"><td>Total</td><td className="num">{money(cf.total.opening)}</td><td className="num">{money(cf.total.moneyIn)}</td><td className="num">{money(cf.total.moneyOut)}</td><td className="num">{money(cf.total.closing)}</td></tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid2 rpt-grid">
        <Card eyebrow="Business position" title="Position at year end">
          <table className="table rpt-pnl stm-pnl">
            <tbody>
              <tr><td>Business money <Link className="rpt-noprint" href="/admin/dashboard/cash">accounts →</Link></td><td className="num">{money(pos.end.money)}</td></tr>
              <tr><td>Stock value</td><td className="num">{money(pos.end.stock)}</td></tr>
              <tr><td>Customers owe us <Link className="rpt-noprint" href="/admin/dashboard/customers">customers →</Link></td><td className="num">{money(pos.end.customersOwe)}</td></tr>
              <tr><td>Suppliers are owed</td><td className="num">−{money(pos.end.suppliersOwed)}</td></tr>
              <tr><td>Salaries unpaid</td><td className="num">−{money(pos.end.salariesUnpaid)}</td></tr>
              <tr className="strong rpt-net"><td>Net position</td><td className="num">{money(pos.end.net)}</td></tr>
            </tbody>
          </table>
          {pos.startNet != null ? (
            <dl className="dc-kv yr-kv">
              <dt>Net position at the start of the year</dt><dd>{money(pos.startNet)}</dd>
              <dt>Change over the year</dt><dd>{signed(pos.end.net - pos.startNet)}</dd>
            </dl>
          ) : <p className="note" style={{ marginTop: 12 }}>This is the first year, so there is no earlier position to compare with.</p>}
        </Card>

        <Card eyebrow="Owner" title="Owner summary">
          <table className="table rpt-pnl stm-pnl">
            <tbody>
              <tr><td>Profit for the year</td><td className="num" style={{ color: ow.profit < 0 ? 'var(--rose)' : undefined }}>{money(ow.profit)}</td></tr>
              <tr className="stm-sub"><td>Owner capital put in</td><td className="num">+{money(ow.ownerIn)}</td></tr>
              <tr className="stm-sub"><td>Drawings taken out</td><td className="num">−{money(ow.ownerOut)}</td></tr>
              <tr className="strong rpt-net"><td>Result carried forward</td><td className="num">{money(ow.carriedForward)}</td></tr>
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

function YearPack({ fy }) {
  return (
    <Card eyebrow="Year pack" title="Records for the accountant or tax office">
      <p className="stm-p">One CSV per record over the whole financial year. The statements themselves print from the button at the top (PDF).</p>
      <div className="yr-pack rpt-noprint">
        {PACK.map(([k, label]) => (
          <a key={k} className="btn btn-ghost" href={`/api/admin/statements/year/${fy}/export?dataset=${k}`} download>{DownIc}{label} CSV</a>
        ))}
      </div>
    </Card>
  );
}

const reopenSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason for reopening — at least 3 characters') });

function CloseDialog({ fy, onClose, onDone }) {
  const close = useMutation({
    mutationFn: () => fetchJson(`/api/admin/statements/year/${fy}`, { method: 'POST' }),
    onSuccess: onDone,
    onError: (e) => notify.error(e, { title: 'Could not close the year' }),
  });
  return (
    <Modal eyebrow="Close year" title={`Close ${fy}?`} onClose={onClose} busy={close.isPending}>
      <div className="modal-b">
        <p className="stm-p">Closing the year:</p>
        <ul className="stm-list">
          <li>Locks the year and every month in it. Nothing in it can be changed, and its months cannot be reopened until the year is.</li>
          <li>Freezes these annual statements as they are now.</li>
          <li>Makes the year-end closing balances the next year&rsquo;s opening balances.</li>
        </ul>
        <p className="stm-p">A mistake can still be fixed by reopening the newest closed year, with a reason.</p>
      </div>
      <div className="modal-f">
        <button className="btn btn-ghost" onClick={onClose} disabled={close.isPending}>Cancel</button>
        <button className="btn btn-primary" onClick={() => close.mutate()} disabled={close.isPending}>{close.isPending ? 'Closing…' : 'Close year'}</button>
      </div>
    </Modal>
  );
}

function ReopenDialog({ fy, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const form = useFormValidation(reopenSchema, { reason });
  const reopen = useMutation({
    mutationFn: (body) => fetchJson(`/api/admin/statements/year/${fy}/reopen`, { method: 'POST', headers: JSON_H, body: JSON.stringify(body) }),
    onSuccess: onDone,
    onError: (e) => notify.error(e, { title: 'Could not reopen the year' }),
  });
  const submit = (e) => {
    e.preventDefault();
    if (!form.check() || reopen.isPending) return;
    reopen.mutate({ reason: form.data.reason });
  };
  return (
    <Modal eyebrow="Reopen year" title={`Reopen ${fy}?`} onClose={onClose} busy={reopen.isPending}>
      <form onSubmit={submit} noValidate style={{ display: 'contents' }}>
        <div className="modal-b">
          <p className="stm-p">The year unlocks and its frozen annual statements are replaced when you close it again. Only the newest closed year can be reopened. The reason is kept on record.</p>
          <Field label="Reason" required {...form.fieldProps('reason')}>
            <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs correcting?" autoFocus />
          </Field>
        </div>
        <div className="modal-f">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={reopen.isPending}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!form.valid || reopen.isPending}>{reopen.isPending ? 'Reopening…' : 'Reopen year'}</button>
        </div>
      </form>
    </Modal>
  );
}
