'use client';

import { Fragment, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { fetchJson } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { useFormValidation } from '@/lib/formValidation';
import { money } from '@/lib/money';
import Field from '@/components/admin/Field';
import Modal from '@/components/admin/Modal';
import { printHtml, useBusiness } from '@/components/admin/printShared';
import { ErrorNote } from '@/components/admin/reports/ReportKit';
import {
  Alert, Button, Card, CardHeader, Chip, Icon, Kpi, KpiGrid, KpiSkeletons, ModalSpacer, RowSkeletons, Segmented, Table, Th,
  cx, selectCls, textareaCls,
} from '@/components/admin/ui';
import Readiness, { blockedMessage, missingTitle, yearChecklist } from './Readiness';
import { kindName, monthLabel } from './StatementDoc';
import AnnualStatementDoc, { ANNUAL_CSS } from './AnnualStatementDoc';

// ── Pieces shared by the month and year statements ──────────────────────────
const JSON_H = { 'Content-Type': 'application/json' };
export const acct = (a) => (a.kind === 'cash' ? 'Cash' : a.label);
export const signed = (n) => (Number(n) < 0 ? '-' : '+') + money(Math.abs(Number(n)));
export const whenLong = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const shortMonth = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short' });
const STATUS = { closed: ['Closed', 'ok'], open: ['Open', 'warn'], running: ['Running', 'info'] };
export const statusName = (s) => STATUS[s]?.[0] || s;
const PACK = [['sales', 'Sales'], ['cashbook', 'Cash book'], ['expenses', 'Expenses'], ['payroll', 'Payroll'], ['stockcounts', 'Stock counts']];
const LINK = 'rpt-noprint font-semibold text-[12.5px] text-mq-cta hover:text-mq-primary';

/** Inline note in a status tone (ok / warn / info / danger). */
export function Callout({ tone = 'info', title, children }) {
  return <Alert tone={tone} title={title}>{children}</Alert>;
}

/** Open (warn) · Running (info) · Closed (ok). */
export function StatusChip({ status }) {
  const [label, tone] = STATUS[status] || [status, 'off'];
  return <Chip tone={tone} pulse={status === 'running'}>{label}</Chip>;
}

/** Month | Year switch, kept in the URL (?view=year). */
export function ViewSwitch({ view }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Segmented
      label="Statement period"
      value={view}
      onChange={(v) => router.replace(`${pathname}?view=${v}`, { scroll: false })}
      options={[{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }]}
    />
  );
}

/** The month / year picker in the statements toolbar. */
export function PeriodSelect({ value, onChange, options, label }) {
  return (
    <select className={selectCls({ size: 'sm', className: 'w-auto max-w-full text-[13.5px]' })} value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={!options.length}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

const LINE = 'px-4 py-[9px] border-b border-mq-chip';
const NUM = 'text-right font-mq-mono tabular-nums whitespace-nowrap';

/** One label/value statement line: `strong` (cream subtotal), `sub` (indented), `net` (the bottom line). */
export function Line({ k, v, strong, sub, net, negative }) {
  const cell = cx(LINE, strong && 'bg-mq-cream font-bold text-mq-ink', sub && 'text-[13px] text-mq-on-tint', net && 'border-t-2 border-t-mq-ink font-bold text-[15px] text-mq-ink');
  return (
    <tr>
      <td className={cx(cell, sub && 'pl-[30px]')}>{k}</td>
      <td className={cx(cell, NUM, net && (negative ? 'text-mq-danger-ink' : 'text-mq-ok-ink'))}>{v}</td>
    </tr>
  );
}

/** Two-column statement table (P&L, position). */
export function LineTable({ label, children }) {
  return <Table label={label}><tbody>{children}</tbody></Table>;
}

/** A statement card with the cream header strip. */
export function StmCard({ title, sub, actions, children, className }) {
  return (
    <Card className={cx('overflow-hidden', className)}>
      {/* Report strip: "PROFIT & LOSS" overline above "What the month earned". */}
      {sub ? <CardHeader eyebrow={title} title={sub} actions={actions} /> : <CardHeader title={title} actions={actions} />}
      {children}
    </Card>
  );
}

/** Cash flow per account; an account with movements expands into its kinds. */
export function CashFlowTable({ cf, openingLabel = 'Opening', closingLabel = 'Closing' }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <Table minW={520} label="Cash flow per account">
      <thead><tr><Th>Account</Th><Th align="right">{openingLabel}</Th><Th align="right">In</Th><Th align="right">Out</Th><Th align="right">{closingLabel}</Th></tr></thead>
      <tbody>
        {cf.accounts.map((a) => {
          const kinds = Object.entries(a.byKind || {}).filter(([, v]) => Number(v) !== 0);
          const on = open.has(a.accountId);
          return (
            <Fragment key={a.accountId}>
              <tr className="hover:bg-mq-cream">
                <td className={cx(LINE, 'font-medium text-mq-ink')}>
                  {kinds.length > 0 ? (
                    <button type="button" aria-expanded={on} onClick={() => toggle(a.accountId)} className="inline-flex items-center gap-1.5 min-h-8 -my-1 text-left font-medium text-mq-ink hover:text-mq-primary">
                      <span className={cx('text-mq-muted transition-transform', !on && '-rotate-90')}><Icon name="chevDown" size={14} stroke={2.2} /></span>
                      {acct(a)}
                    </button>
                  ) : <span className="pl-5">{acct(a)}</span>}
                </td>
                <td className={cx(LINE, NUM)}>{money(a.opening)}</td>
                <td className={cx(LINE, NUM)}>{money(a.moneyIn)}</td>
                <td className={cx(LINE, NUM)}>{money(a.moneyOut)}</td>
                <td className={cx(LINE, NUM, 'font-semibold text-mq-ink')}>{money(a.closing)}</td>
              </tr>
              {on && kinds.map(([k, v]) => (
                <tr key={k}>
                  <td colSpan={4} className={cx(LINE, 'pl-[42px] text-[13px] text-mq-on-tint')}>{kindName(k)}</td>
                  <td className={cx(LINE, NUM, 'text-[13px] text-mq-on-tint')}>{signed(v)}</td>
                </tr>
              ))}
            </Fragment>
          );
        })}
        <tr className="bg-mq-cream font-bold text-mq-ink">
          <td className={LINE}>Total</td>
          <td className={cx(LINE, NUM)}>{money(cf.total.opening)}</td>
          <td className={cx(LINE, NUM)}>{money(cf.total.moneyIn)}</td>
          <td className={cx(LINE, NUM)}>{money(cf.total.moneyOut)}</td>
          <td className={cx(LINE, NUM)}>{money(cf.total.closing)}</td>
        </tr>
      </tbody>
    </Table>
  );
}

/** Close (after confirming what it does) or reopen (with a reason) a month or year. */
export function CloseDialog({ what, url, points, onClose, onDone }) {
  const close = useMutation({
    mutationFn: () => fetchJson(url, { method: 'POST' }),
    onSuccess: onDone,
    onError: (e) => notify.error(e, { title: `Could not close ${what}` }),
  });
  return (
    <Modal
      eyebrow="Close period" title={`Close ${what}?`} icon="lock" onClose={onClose} busy={close.isPending}
      footer={<>
        <ModalSpacer />
        <Button variant="secondary" size="lg" onClick={onClose} disabled={close.isPending}>Cancel</Button>
        <Button variant="primary" size="lg" onClick={() => close.mutate()} disabled={close.isPending}>{close.isPending ? 'Closing…' : `Close ${what}`}</Button>
      </>}
    >
      <p className="m-0 mb-2 text-sm text-mq-body">Closing {what}:</p>
      <ul className="m-0 pl-5 flex flex-col gap-1.5 text-[13.5px] text-mq-body list-disc">{points.map((p) => <li key={p}>{p}</li>)}</ul>
      <p className="m-0 mt-3 text-[13px] text-mq-muted">A mistake can still be fixed by reopening the newest closed period, with a reason.</p>
    </Modal>
  );
}

const reopenSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason for reopening — at least 3 characters') });

export function ReopenDialog({ what, url, note, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const form = useFormValidation(reopenSchema, { reason });
  const reopen = useMutation({
    mutationFn: (body) => fetchJson(url, { method: 'POST', headers: JSON_H, body: JSON.stringify(body) }),
    onSuccess: onDone,
    onError: (e) => notify.error(e, { title: `Could not reopen ${what}` }),
  });
  const submit = (e) => {
    e.preventDefault();
    if (!form.check() || reopen.isPending) return;
    reopen.mutate({ reason: form.data.reason });
  };
  return (
    <Modal
      eyebrow="Reopen period" title={`Reopen ${what}?`} icon="alert" tone="warn" onClose={onClose} busy={reopen.isPending}
      footer={<>
        <ModalSpacer />
        <Button variant="secondary" size="lg" onClick={onClose} disabled={reopen.isPending}>Cancel</Button>
        <Button type="submit" form="stm-reopen" variant="primary" size="lg" disabled={!form.valid || reopen.isPending}>{reopen.isPending ? 'Reopening…' : `Reopen ${what}`}</Button>
      </>}
    >
      <form id="stm-reopen" onSubmit={submit} noValidate className="flex flex-col gap-3">
        <p className="m-0 text-[13.5px] text-mq-body">{note} The reason is kept on record.</p>
        <Field label="Reason" required {...form.fieldProps('reason')}>
          <textarea className={textareaCls()} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs correcting?" />
        </Field>
      </form>
    </Modal>
  );
}

// ── The year ────────────────────────────────────────────────────────────────
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
  const settingsLink = <Link className={LINK} href="/admin/dashboard/settings/money">Set them in Settings › Money →</Link>;

  return (
    <>
      <div className="flex items-center gap-2.5 flex-wrap rpt-noprint">
        <ViewSwitch view="year" />
        <PeriodSelect label="Financial year" value={fy} onChange={pick} options={list.map((y) => ({ value: y.year, label: `${y.year} · ${statusName(y.status)}` }))} />
        {d && <StatusChip status={d.status} />}
        <span className="flex-1" />
        {ready && <Button variant="secondary" size="md" icon="print" onClick={print}>Print annual statements (PDF)</Button>}
        {d && !closed && <Button variant="primary" size="md" onClick={() => setClosing(true)} disabled={!d.canClose} title={closeTitle}>Close year</Button>}
        {closed && <Button variant="secondary" size="md" onClick={() => setReopening(true)}>Reopen year</Button>}
      </div>

      {years.isError && <ErrorNote error={years.error} />}
      {q.isError && <ErrorNote error={q.error} />}
      {years.isSuccess && list.length === 0 && (
        <Callout tone="warn" title="No financial years yet">The opening balances have not been set. {settingsLink}</Callout>
      )}
      {(years.isLoading || q.isLoading) && <><KpiSkeletons count={3} min={210} /><RowSkeletons rows={8} /></>}

      {d?.blocked === 'needs-opening' && <Callout tone="warn">The opening balances have not been set, so there is nothing to report yet. {settingsLink}</Callout>}
      {d?.blocked === 'before-opening' && (
        <Callout tone="info">{d.year} ends before the opening balances date. Books start from that day, so there are no statements for this year. <Link className={LINK} href="/admin/dashboard/settings/money">Settings › Money →</Link></Callout>
      )}

      {closed && <Callout tone="ok">Closed {whenLong(d.closedAt)}. Every month of the year is locked and these figures are frozen.</Callout>}
      {d && !closed && d.reopened && <Callout tone="info">This year was reopened{d.reopened.reason ? `: ${d.reopened.reason}` : ''}. Figures are live until you close it again.</Callout>}
      {d && !closed && !d.blocked && <Readiness items={checklist} title={`Before ${d.year} can be closed`} />}
      {d && !closed && !d.blocked && !st && d.months?.length > 0 && (
        <Callout tone="info">No month of this year is closed yet, so the annual figures are empty. The statements are built from the closed months.</Callout>
      )}

      {ready && <YearBody st={st} />}
      {ready && <YearPack fy={fy} />}

      {ready && <AnnualStatementDoc ref={docRef} business={business.name} year={fy} statement={st} closedAt={closed ? d.closedAt : null} />}

      {closing && (
        <CloseDialog
          what={fy} url={`/api/admin/statements/year/${fy}`}
          points={[
            'Locks the year and every month in it. Nothing in it can be changed, and its months cannot be reopened until the year is.',
            'Freezes these annual statements as they are now.',
            'Makes the year-end closing balances the next year’s opening balances.',
          ]}
          onClose={() => setClosing(false)} onDone={(data) => { setClosing(false); notify.success(`${fy} closed`); afterChange(data); }}
        />
      )}
      {reopening && (
        <ReopenDialog
          what={fy} url={`/api/admin/statements/year/${fy}/reopen`}
          note="The year unlocks and its frozen annual statements are replaced when you close it again. Only the newest closed year can be reopened."
          onClose={() => setReopening(false)} onDone={() => { setReopening(false); notify.success(`${fy} reopened`); afterChange(null); }}
        />
      )}
    </>
  );
}

function YearBody({ st }) {
  const p = st.pnl;
  const pos = st.position;
  const ow = st.owner;
  // [label, key in each month row, year total, shown negative, bold, signed]
  const cols = [
    ['Net sales', 'net', p.sales.net], ['Cost of goods', 'cogs', p.cogs, true], ['Gross profit', 'grossProfit', p.grossProfit, false, true],
    ['Operating expenses', 'operating', p.operating.total, true], ['Payroll', 'payroll', p.payroll, true], ['Over / short', 'overShort', p.overShort, false, false, true],
    ['Net profit', 'netProfit', p.netProfit, false, true],
  ];
  const cell = (v, neg, sgn) => (sgn ? signed(v) : neg ? `−${money(v)}` : money(v));

  return (
    <>
      <KpiGrid min={210}>
        <Kpi label="Net sales" value={money(p.sales.net)} foot={`${p.sales.count} sales`} />
        <Kpi label="Gross profit" value={money(p.grossProfit)} foot={p.foodCostPct != null ? `food cost ${p.foodCostPct}%` : 'no closing stock count'} />
        <Kpi label="Net profit" value={money(p.netProfit)} foot="after all costs" />
      </KpiGrid>

      <StmCard title="Profit & loss for the year" sub="Month by month">
        <Table minW={Math.max(560, 200 + st.months.length * 96)} label="Profit and loss by month">
          <thead><tr><Th><span className="sr-only">Line</span></Th>{st.months.map((x) => <Th key={x.month} align="right" title={monthLabel(x.month)}>{shortMonth(x.month)}</Th>)}<Th align="right">Total</Th></tr></thead>
          <tbody>
            {cols.map(([label, key, total, neg, strong, sgn]) => (
              <tr key={key} className={strong ? 'bg-mq-cream font-semibold text-mq-ink' : undefined}>
                <td className={cx(LINE, 'whitespace-nowrap')}>{label}</td>
                {st.months.map((x) => <td key={x.month} className={cx(LINE, NUM)}>{cell(x[key], neg, sgn)}</td>)}
                <td className={cx(LINE, NUM, 'font-semibold text-mq-ink')}>{cell(total, neg, sgn)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="m-0 px-4 py-2.5 text-xs text-mq-on-tint border-t border-mq-chip">
          {p.foodCostPct != null ? `Food cost for the year: ${p.foodCostPct}%` : 'Food cost is not available because there is no closing stock count'} · discounts {money(p.sales.discounts)} · refunds {money(p.sales.refunds)}
        </p>
      </StmCard>

      <StmCard title="Operating expenses" sub="Where the year’s costs went" actions={<Button href="/admin/dashboard/expenses" variant="ghost" size="xs" iconRight="arrowRight" className="rpt-noprint">Expenses</Button>}>
        {p.operating.byCategory.length === 0 ? <p className="m-0 p-4 text-[13px] text-mq-muted">No operating expenses this year.</p> : (
          <LineTable label="Operating expenses by category">
            {p.operating.byCategory.map((c) => <Line key={c.category} k={<span className="capitalize">{c.category}</span>} v={money(c.amount)} />)}
            <Line net k="Total operating expenses" v={money(p.operating.total)} negative />
          </LineTable>
        )}
      </StmCard>

      <StmCard title="Cash flow" sub="Per account for the year">
        <CashFlowTable cf={st.cashFlow} openingLabel="Opening (day 1)" closingLabel="Closing (last day)" />
      </StmCard>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))' }}>
        <StmCard title="Business position" sub="At year end">
          <LineTable label="Business position at year end">
            <Line k={<>Business money <Link className={LINK} href="/admin/dashboard/cash">accounts →</Link></>} v={money(pos.end.money)} />
            <Line k="Stock value" v={money(pos.end.stock)} />
            <Line k={<>Customers owe us <Link className={LINK} href="/admin/dashboard/customers">customers →</Link></>} v={money(pos.end.customersOwe)} />
            <Line k="Suppliers are owed" v={`−${money(pos.end.suppliersOwed)}`} />
            <Line k="Salaries unpaid" v={`−${money(pos.end.salariesUnpaid)}`} />
            <Line net k="Net position" v={money(pos.end.net)} negative={pos.end.net < 0} />
          </LineTable>
          <div className="px-4 py-3 text-[13px]">
            {pos.startNet != null ? (
              <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
                <dt className="text-mq-on-tint">Net position at the start of the year</dt><dd className="m-0 font-mq-mono tabular-nums text-right">{money(pos.startNet)}</dd>
                <dt className="text-mq-on-tint">Change over the year</dt><dd className="m-0 font-mq-mono tabular-nums text-right">{signed(pos.end.net - pos.startNet)}</dd>
              </dl>
            ) : <p className="m-0 text-mq-muted">This is the first year, so there is no earlier position to compare with.</p>}
          </div>
        </StmCard>

        <StmCard title="Owner summary" sub="Profit and owner money">
          <LineTable label="Owner summary">
            <Line k="Profit for the year" v={money(ow.profit)} />
            <Line sub k="Owner capital put in" v={`+${money(ow.ownerIn)}`} />
            <Line sub k="Drawings taken out" v={`−${money(ow.ownerOut)}`} />
            <Line net k="Result carried forward" v={money(ow.carriedForward)} negative={ow.carriedForward < 0} />
          </LineTable>
        </StmCard>
      </div>
    </>
  );
}

function YearPack({ fy }) {
  return (
    <StmCard title="Year pack" sub="Records for the accountant or tax office">
      <div className="p-4 flex flex-col gap-3">
        <p className="m-0 text-[13px] text-mq-on-tint">One CSV per record over the whole financial year. The statements themselves print from the button at the top (PDF).</p>
        <div className="flex flex-wrap gap-2 rpt-noprint">
          {PACK.map(([k, label]) => (
            <Button key={k} href={`/api/admin/statements/year/${fy}/export?dataset=${k}`} variant="secondary" size="sm" icon="download" download>{label} CSV</Button>
          ))}
        </div>
      </div>
    </StmCard>
  );
}
