'use client';

import { Fragment, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson, parseApiError } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { reportSaveError } from '@/lib/saveError';
import { useFormValidation } from '@/lib/formValidation';
import { dayCountSchema, reopenSchema } from '@/lib/schemas/cash';
import Field from '@/components/admin/Field';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';
import { printHtml, useBusiness } from '@/components/admin/printShared';
import useStaffList from '@/hooks/useStaffList';
import ZReportDoc, { Z_CSS, Z_CSS_A4 } from './ZReportDoc';
import { money } from '@/lib/money';
import {
  Alert, Button, Card, Chip, Dot, ErrorState, Modal, ModalSpacer, Overline,
  Table, Th, Td, Tr, TotalRow, inputCls, textareaCls, cx,
} from '@/components/admin/ui';

const signed = (n) => (Number(n) < 0 ? '−' : '+') + money(Math.abs(Number(n)));
const round2 = (n) => Math.round(n * 100) / 100;
const acctName = (a) => (a.kind === 'cash' ? 'Cash' : a.label);
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dayChip = (s) => parseDay(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
const dayLong = (s) => parseDay(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const diffTone = (d) => (d < 0 ? 'text-mq-danger-ink' : d > 0 ? 'text-mq-ok-ink' : 'text-mq-muted');

// Every query a close/reopen can change.
function useRefreshAfterClose() {
  const qc = useQueryClient();
  return () => {
    ['day-close', 'day-close-list', 'day-close-overview', 'account-balances', 'account-entries', 'collections', 'overview']
      .forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
}

const OpeningPrompt = () => (
  <Alert tone="info" title="Set the opening balances first" action={<Button href="/admin/dashboard/settings/money" variant="primary" size="sm">Set opening balances</Button>}>
    Days are closed from the opening date on (Settings › Money).
  </Alert>
);

// ── The tab ─────────────────────────────────────────────────────────────
export default function DayCloseTab({ dayParam, onDay }) {
  const list = useQuery({ queryKey: ['day-close-list'], queryFn: () => fetchJson('/api/admin/day-close'), staleTime: 15 * 1000 });
  if (list.isLoading) return <RowsSkeleton rows={3} height={48} />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} title="Couldn’t load days to close" />;
  const { today, openingDate, unclosed } = list.data;
  if (!openingDate) return <OpeningPrompt />;

  const day = dayParam || unclosed[0] || null;
  const chips = [...unclosed];
  if (day && !chips.includes(day) && day !== today) chips.push(day); // e.g. a closed day opened from the archive
  chips.push(today);

  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Days">
        {chips.map((d) => {
          const isToday = d === today;
          const toClose = unclosed.includes(d);
          const on = d === day;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onDay(d)}
              title={d}
              className={cx(
                'flex flex-col items-start gap-0.5 min-h-12 min-w-[116px] px-3.5 py-2 rounded-[10px] border text-left transition-colors flex-none',
                on ? 'bg-mq-soft border-mq-soft-line text-mq-primary' : 'bg-white border-mq-line text-mq-ink hover:bg-mq-canvas',
              )}
            >
              <span className="font-mq-mono font-semibold text-[15px] tabular-nums">{dayChip(d)}</span>
              <span className={cx('text-[11.5px] font-semibold', isToday ? 'text-mq-info-ink' : toClose ? 'text-mq-warn-ink' : 'text-mq-ok-ink')}>
                {isToday ? 'Today · running' : toClose ? 'To close' : 'Closed'}
              </span>
            </button>
          );
        })}
      </div>
      {unclosed.length === 0 && !dayParam && (
        <Alert tone="ok" title="All caught up">
          Every finished day is closed. Today closes after the day ends. Past closes are in{' '}
          <Link className="font-semibold underline" href="/admin/dashboard/reports/day-closes">Reports › Day closes</Link>.
        </Alert>
      )}
      {day && <DayDetail key={day} day={day} />}
    </>
  );
}

function DayDetail({ day }) {
  const q = useQuery({ queryKey: ['day-close', day], queryFn: () => fetchJson(`/api/admin/day-close/${day}`) });
  if (q.isLoading) return <><KpiRowSkeleton count={3} /><RowsSkeleton rows={4} /></>;
  if (q.isError) return <ErrorState error={{ message: parseApiError(q.error) }} onRetry={() => q.refetch()} />;
  const p = q.data;
  if (p.needsOpening) return <OpeningPrompt />;
  if (p.beforeOpening) return <Alert tone="info" title="Before the opening date">{dayLong(day)} is before the opening date, so it isn’t part of the books and doesn’t need closing.</Alert>;
  if (p.status === 'closed') return <ClosedView day={day} preview={p} />;
  return <CloseForm day={day} preview={p} />;
}

// ── Shared, read-only sections ──────────────────────────────────────────
function Section({ eyebrow, title, note, children }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-0.5 px-4 py-[13px] bg-mq-cream border-b border-mq-line">
        {eyebrow && <Overline className="text-[10.5px]">{eyebrow}</Overline>}
        <h3 className="m-0 text-sm font-semibold tracking-[-.01em] text-mq-ink">{title}</h3>
        {note && <p className="m-0 text-xs text-mq-muted">{note}</p>}
      </div>
      {children}
    </Card>
  );
}

function KV({ rows, small }) {
  return (
    <dl className={cx('m-0 grid grid-cols-[1fr_auto] gap-x-4', small ? 'gap-y-1 text-[12.5px]' : 'gap-y-1.5 text-[13px]')}>
      {rows.filter(Boolean).map(([k, v, strong, tone]) => (
        <Fragment key={k}>
          <dt className={strong ? 'font-semibold text-mq-ink' : 'text-mq-on-tint'}>{k}</dt>
          <dd className={cx('m-0 text-right font-mq-mono tabular-nums', strong && 'font-semibold', tone || 'text-mq-ink')}>{v}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function LineList({ items }) {
  return (
    <ul className="m-0 p-0 list-none flex flex-col divide-y divide-mq-chip border border-mq-chip rounded-lg">
      {items.map(([key, left, right, tone]) => (
        <li key={key} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
          <span className="min-w-0">{left}</span>
          <span className={cx('font-mq-mono tabular-nums whitespace-nowrap', tone || 'text-mq-ink')}>{right}</span>
        </li>
      ))}
    </ul>
  );
}

function ChecksBody({ report, carry, onCarry, carriedOver }) {
  const { openTabs, pendingOnline } = report.checks || { openTabs: [], pendingOnline: 0 };
  const blockers = openTabs.length + pendingOnline;
  if (carriedOver) {
    return <p className="m-0 p-4 text-[13px] text-mq-body">Closed with {carriedOver.openTabs} unpaid {carriedOver.openTabs === 1 ? 'tab' : 'tabs'} and {carriedOver.pendingOnline} online {carriedOver.pendingOnline === 1 ? 'order' : 'orders'} carried over to the next day.</p>;
  }
  if (!blockers) return <p className="m-0 p-4 flex items-center gap-2 text-[13px] text-mq-ok-ink"><Dot tone="ok" /> No unpaid tabs and no online orders waiting.</p>;
  return (
    <div className="p-4 flex flex-col gap-3">
      {openTabs.length > 0 && <LineList items={openTabs.map((t) => [t.id, t.table ? `Table ${t.table}` : `Order #${t.id}`, money(t.total)])} />}
      {pendingOnline > 0 && <p className="m-0 text-[13px] text-mq-warn-ink">{pendingOnline} online {pendingOnline === 1 ? 'order is' : 'orders are'} still waiting to be accepted or declined.</p>}
      <div><Button href="/admin/dashboard/orders" variant="secondary" size="sm" iconRight="arrowRight">Open Orders to settle them</Button></div>
      {onCarry && (
        <label className="flex items-center gap-3 min-h-11 px-3 py-2 rounded-[10px] border border-mq-line bg-mq-cream cursor-pointer text-[13.5px] text-mq-ink">
          <input type="checkbox" className="w-5 h-5 accent-mq-primary flex-none" checked={carry} onChange={(e) => onCarry(e.target.checked)} />
          <span>Close anyway — carry them over to the next day</span>
        </label>
      )}
    </div>
  );
}

function CollectionsBody({ col }) {
  if (!col || !col.rows?.length) return <p className="m-0 p-4 text-[13px] text-mq-muted">No staff member took payments on this day.</p>;
  return (
    <Table minW={360 + col.accounts.length * 100} label="Collected by each person">
      <thead><tr><Th>Person</Th>{col.accounts.map((a) => <Th key={a.id} align="right">{acctName(a)}</Th>)}<Th align="right">Total</Th></tr></thead>
      <tbody>
        {col.rows.map((r) => (
          <Tr key={r.staffId}>
            <Td strong><span className="inline-flex items-center gap-2">{r.name}<Chip tone="plain" dot={false} small className="capitalize">{r.role}</Chip></span></Td>
            {col.accounts.map((a) => <Td key={a.id} money>{r.byAccount?.[a.id] != null ? money(r.byAccount[a.id]) : <span className="text-mq-muted">—</span>}</Td>)}
            <Td money>{money(r.total)}</Td>
          </Tr>
        ))}
      </tbody>
      <tfoot>
        <TotalRow>
          <Td>Total</Td>
          {col.accounts.map((a) => <Td key={a.id} money>{money(col.totals?.[a.id])}</Td>)}
          <Td money>{money(col.total)}</Td>
        </TotalRow>
      </tfoot>
    </Table>
  );
}

function SalesBody({ report }) {
  const s = report.sales;
  const voids = report.voids || [];
  return (
    <div className="p-4 flex flex-col gap-4 max-w-[560px]">
      <KV rows={[
        [`Sales (${s.count})`, money(s.gross)],
        ['Discounts given', money(s.discounts)],
        [`Refunds (${s.refundCount})`, s.refunds > 0 ? `−${money(s.refunds)}` : money(0)],
        ['Net sales', money(s.net), true],
        [`Billed on account (${s.onAccount.count})`, money(s.onAccount.total)],
      ]} />
      {s.byAccount.length > 0 && (
        <div className="flex flex-col gap-2">
          <Overline>By account</Overline>
          <KV rows={s.byAccount.map((a) => [acctName(a), money(a.sales)])} />
        </div>
      )}
      {voids.length > 0 && (
        <div className="flex flex-col gap-2">
          <Overline>Voided sales ({voids.length})</Overline>
          <LineList items={voids.map((v) => [v.orderId, (
            <>
              <Link className="font-semibold text-mq-cta hover:text-mq-primary" href={`/admin/dashboard/sales/${v.orderId}`}>{v.table ? `Table ${v.table}` : `Order #${v.orderId}`}</Link>
              <span className="text-mq-muted"> — {v.reason || 'no reason given'}</span>
            </>
          ), money(v.total)])} />
        </div>
      )}
    </div>
  );
}

// ── Open day: count and close ───────────────────────────────────────────
function diffText(diff, day) {
  if (diff === 0) return 'Matches what the books expect.';
  const amt = money(Math.abs(diff));
  return diff < 0
    ? `Short by ${amt} — less than expected. A Count difference of ${signed(diff)} is posted to this account's cash book on ${day}.`
    : `Over by ${amt} — more than expected. A Count difference of ${signed(diff)} is posted to this account's cash book on ${day}.`;
}

function CloseForm({ day, preview }) {
  const { report, lines } = preview;
  const running = preview.status === 'running';
  const refresh = useRefreshAfterClose();
  const qc = useQueryClient();
  const [counted, setCounted] = useState({});
  const [carry, setCarry] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const blockers = report.checks.openTabs.length + report.checks.pendingOnline;
  const entered = lines.map((l) => {
    const raw = counted[l.accountId];
    const has = raw != null && raw !== '';
    const amount = has ? Number(raw) : null;
    const valid = has && Number.isFinite(amount) && amount >= 0;
    return { ...l, has, valid, amount: valid ? amount : null, diff: valid ? round2(amount - l.expected) : null };
  });
  // "Count the cash" + every typed amount 0 or more (lib/schemas/cash.js).
  const countSchema = useMemo(() => dayCountSchema(lines), [lines]);
  const countValues = useMemo(() => Object.fromEntries(lines.map((l) => [`c_${l.accountId}`, counted[l.accountId] ?? ''])), [lines, counted]);
  const form = useFormValidation(countSchema, countValues);
  const blocked = blockers > 0 && !carry;
  const canClose = !running && form.valid && !blocked;

  const close = useMutation({
    mutationFn: () => fetchJson(`/api/admin/day-close/${day}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ counted: entered.filter((l) => l.valid).map((l) => ({ accountId: l.accountId, amount: l.amount })), ...(carry ? { carryOver: true } : {}) }),
    }),
    onSuccess: (closed) => {
      qc.setQueryData(['day-close', day], closed);
      notify.success(`${day} is closed`, { title: `Could not close ${day}` });
      setConfirm(false);
      refresh();
    },
    onError: (e) => {
      notify.error(e, { title: `Could not close ${day}` });
      // Something changed under us (e.g. a tab was opened) — show the fresh checks.
      if (e.code === 'DAY_HAS_OPEN_WORK') qc.invalidateQueries({ queryKey: ['day-close', day] });
    },
  });
  const differences = entered.filter((l) => l.diff != null && l.diff !== 0);
  const footNote = !form.valid
    ? (Object.values(form.errors)[0] === 'Count the cash' ? 'Count the cash to close the day.' : 'Fix the amounts marked above.')
    : blocked ? 'Tick “Close anyway” in Step 1 to carry the waiting work over.' : 'Sales and expenses for the day are locked once closed.';

  return (
    <>
      {running && (
        <Alert tone="info" title="Running — closes after the day ends">This is a live preview; counting opens once {dayLong(day)} is over.</Alert>
      )}
      {preview.reopened && (
        <Alert tone="warn" title={`Reopened${preview.reopened.at ? ` ${when(preview.reopened.at)}` : ''}`}>{preview.reopened.reason}. Count again and close it.</Alert>
      )}
      {!running && (
        <Alert tone="warn" title={`Count the till before closing ${dayLong(day)}`}>Closing a day locks its sales and expenses. Reopening needs a manager and a reason.</Alert>
      )}

      <Section eyebrow="Step 1" title="Checks" note="Unpaid tabs and online orders still waiting on this day.">
        <ChecksBody report={report} carry={carry} onCarry={running ? null : setCarry} />
      </Section>

      <Section eyebrow="Step 2" title="Collected by each person" note="What each waiter and cashier must have handed over.">
        <CollectionsBody col={report.collections} />
      </Section>

      <Section eyebrow="Step 3" title="Count the accounts" note="Cash must be counted. For the others, enter the balance shown in the app or on the statement — or leave it blank.">
        <div className="grid gap-3.5 p-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))' }}>
          {entered.map((l) => {
            const isCash = l.kind === 'cash';
            return (
              <div key={l.accountId} className="flex flex-col gap-2.5 p-3.5 bg-white border border-mq-line rounded-xl">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-mq-ink truncate">{acctName(l)}</div>
                    {l.number && <div className="text-xs text-mq-muted font-mq-mono">{l.number}</div>}
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[11px] text-mq-muted">Expected</span>
                    <span className="font-mq-mono tabular-nums font-semibold text-mq-ink">{money(l.expected)}</span>
                  </div>
                </div>
                <KV small rows={[
                  ['Opening', money(l.opening)],
                  ['Money in', money(l.moneyIn), false, 'text-mq-ok-ink'],
                  ['Money out', money(l.moneyOut), false, 'text-mq-danger-ink'],
                ]} />
                <Field label={isCash ? 'Cash counted ($)' : 'Balance in the app / statement ($)'} required={isCash} {...form.fieldProps(`c_${l.accountId}`)}>
                  <input
                    className={inputCls({ size: 'lg', mono: true, className: 'text-right' })}
                    type="number" min="0" step="0.01" inputMode="decimal" placeholder={isCash ? 'Count the till' : 'Optional'}
                    value={counted[l.accountId] ?? ''} disabled={running}
                    onChange={(e) => setCounted({ ...counted, [l.accountId]: e.target.value })}
                  />
                </Field>
                {l.diff != null && (
                  <p className={cx('m-0 text-[12.5px] leading-snug', diffTone(l.diff))}>
                    <strong className="font-mq-mono tabular-nums">{l.diff === 0 ? '$0.00' : signed(l.diff)}</strong> {diffText(l.diff, day)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <p className="m-0 px-4 pb-4 text-xs text-mq-muted">To see whose money is short, compare the difference with each person’s collections in Step 2.</p>
      </Section>

      <Section eyebrow="Step 4" title="Sales summary">
        <SalesBody report={report} />
      </Section>

      {!running && (
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="primary" size="xl" disabled={!canClose} onClick={() => setConfirm(true)}>Close day {dayChip(day)}</Button>
          <span className="text-[12.5px] text-mq-on-tint">{footNote}</span>
        </div>
      )}

      {confirm && (
        <Modal
          title={`Close ${dayLong(day)}?`}
          eyebrow="Day close"
          icon="lock"
          tone="warn"
          onClose={() => setConfirm(false)}
          busy={close.isPending}
          footer={(
            <>
              <ModalSpacer />
              <Button variant="secondary" size="lg" onClick={() => setConfirm(false)} disabled={close.isPending}>Cancel</Button>
              <Button variant="primary" size="lg" onClick={() => close.mutate()} disabled={close.isPending}>{close.isPending ? 'Closing…' : 'Close day'}</Button>
            </>
          )}
        >
          <div className="flex flex-col gap-3 text-sm text-mq-body leading-relaxed">
            <p className="m-0">Closing locks <strong className="text-mq-ink">{day}</strong>. Its sales, expenses, payments and cash book can no longer be changed — corrections go into the open day instead. You can reopen it later (newest day first) with a reason.</p>
            {differences.length > 0 && (
              <LineList items={differences.map((l) => [l.accountId, acctName(l), `${l.diff < 0 ? 'short' : 'over'} ${money(Math.abs(l.diff))}`, diffTone(l.diff)])} />
            )}
            {blockers > 0 && <p className="m-0 text-[12.5px] text-mq-muted">{report.checks.openTabs.length} unpaid {report.checks.openTabs.length === 1 ? 'tab' : 'tabs'} and {report.checks.pendingOnline} online {report.checks.pendingOnline === 1 ? 'order' : 'orders'} will be carried over.</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

// ── Closed day: frozen Z-report ─────────────────────────────────────────
function ClosedView({ day, preview }) {
  const { report } = preview;
  const business = useBusiness();
  const { staff } = useStaffList();
  const refresh = useRefreshAfterClose();
  const qc = useQueryClient();
  const docRef = useRef(null);
  const [variant, setVariant] = useState('80mm');
  const [reopen, setReopen] = useState(false);
  const [reason, setReason] = useState('');
  const reopenForm = useFormValidation(reopenSchema, { reason });

  const closer = staff.find((u) => u.id === preview.closedById);
  const closedBy = closer ? (closer.name?.trim() || closer.email) : null;
  // The frozen snapshot carries labels + counts; fall back to the stored lines.
  const lines = Array.isArray(report.lines) && report.lines.length ? report.lines : preview.lines;
  const totalDiff = round2(lines.reduce((s, l) => s + (l.counted == null ? 0 : Number(l.difference ?? l.counted - l.expected)), 0));

  const print = (v) => {
    flushSync(() => setVariant(v));
    const node = docRef.current;
    if (!node) return;
    printHtml(node.innerHTML, v === 'a4' ? Z_CSS_A4 : Z_CSS);
  };

  const undo = useMutation({
    mutationFn: () => fetchJson(`/api/admin/day-close/${day}/reopen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }) }),
    onSuccess: (reopened) => { qc.setQueryData(['day-close', day], reopened); notify.success(`${day} reopened`, { title: `Could not reopen ${day}` }); setReopen(false); setReason(''); reopenForm.reset(); refresh(); },
    onError: (e) => reportSaveError(e, { form: reopenForm, title: `Could not reopen ${day}`, guess: { reason: /reason/i } }),
  });

  return (
    <>
      <Card pad className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-[240px] flex flex-col gap-1">
          <Overline>Z-report</Overline>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="m-0 text-xl font-semibold tracking-[-.02em] text-mq-ink">{dayLong(day)} is closed</h2>
            <Chip tone="ok" small>Closed</Chip>
          </div>
          <p className="m-0 text-[13px] text-mq-on-tint">
            Locked {when(preview.closedAt)}{closedBy ? ` by ${closedBy}` : ''}. Net sales <span className="font-mq-mono tabular-nums">{money(report.sales.net)}</span>
            {totalDiff !== 0 ? <> · <span className={diffTone(totalDiff)}>{totalDiff < 0 ? 'short' : 'over'} {money(Math.abs(totalDiff))}</span></> : ' · counts match'}.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="primary" size="lg" icon="print" onClick={() => print('80mm')}>Print Z-report (80mm)</Button>
          <Button variant="secondary" size="lg" icon="print" onClick={() => print('a4')}>Print (A4)</Button>
          <Button variant="secondary" size="lg" icon="refresh" onClick={() => { reopenForm.reset(); setReopen(true); }}>Reopen day</Button>
        </div>
      </Card>

      <Section eyebrow="Accounts" title="Expected vs counted">
        <Table minW={720} label="Expected vs counted">
          <thead>
            <tr><Th>Account</Th><Th align="right">Opening</Th><Th align="right">In</Th><Th align="right">Out</Th><Th align="right">Expected</Th><Th align="right">Counted</Th><Th align="right">Difference</Th></tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const diff = l.counted == null ? null : Number(l.difference ?? round2(l.counted - l.expected));
              return (
                <Tr key={l.accountId}>
                  <Td strong>{l.label ? acctName(l) : `Account ${l.accountId}`}</Td>
                  <Td money>{money(l.opening)}</Td>
                  <Td money>{money(l.moneyIn)}</Td>
                  <Td money>{money(l.moneyOut)}</Td>
                  <Td money>{money(l.expected)}</Td>
                  <Td money>{l.counted == null ? <span className="font-mq font-normal text-mq-muted">not counted</span> : money(l.counted)}</Td>
                  <Td money className={cx('font-semibold', diff == null ? 'text-mq-muted' : diffTone(diff))}>{diff == null ? '—' : diff === 0 ? '$0.00' : signed(diff)}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Section>
      <Section eyebrow="Checks" title="Open work at close"><ChecksBody report={report} carriedOver={report.carriedOver} /></Section>
      <Section eyebrow="People" title="Collected by each person"><CollectionsBody col={report.collections} /></Section>
      <Section eyebrow="Sales" title="Sales summary"><SalesBody report={report} /></Section>

      <ZReportDoc ref={docRef} business={business.name} day={day} report={{ ...report, lines }} closedAt={preview.closedAt} closedBy={closedBy} variant={variant} />

      {reopen && (
        <Modal
          title={`Reopen ${dayLong(day)}`}
          eyebrow="Day close"
          sub="Reopening unlocks the day and reverses its count differences. Only the newest closed day can be reopened. The reason is recorded in the audit log."
          icon="refresh"
          tone="warn"
          onClose={() => setReopen(false)}
          busy={undo.isPending}
          footer={(
            <>
              <ModalSpacer />
              <Button variant="secondary" size="lg" onClick={() => setReopen(false)} disabled={undo.isPending}>Cancel</Button>
              <Button variant="primary" size="lg" type="submit" form="dc-reopen" disabled={undo.isPending || !reopenForm.valid}>{undo.isPending ? 'Reopening…' : 'Reopen day'}</Button>
            </>
          )}
        >
          <form id="dc-reopen" noValidate onSubmit={(e) => { e.preventDefault(); if (!reopenForm.check() || undo.isPending) return; reopenForm.setServerErrors(null); undo.mutate(); }}>
            <Field label="Reason" required {...reopenForm.fieldProps('reason')}>
              <textarea className={textareaCls()} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. A payment was missed" />
            </Field>
          </form>
        </Modal>
      )}
    </>
  );
}
