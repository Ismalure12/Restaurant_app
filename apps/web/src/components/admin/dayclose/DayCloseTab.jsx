'use client';

import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchJson, parseApiError } from '@/lib/apiError';
import { notify } from '@/lib/notify';
import { reportSaveError } from '@/lib/saveError';
import { useFormValidation } from '@/lib/formValidation';
import { dayCountSchema, reopenSchema } from '@/lib/schemas/cash';
import Field from '@/components/admin/Field';
import { RowsSkeleton } from '@/components/admin/Skeletons';
import { printHtml, useBusiness } from '@/components/admin/printShared';
import useStaffList from '@/hooks/useStaffList';
import ZReportDoc, { Z_CSS, Z_CSS_A4 } from './ZReportDoc';
import { money } from '@/lib/money';
import {
  Alert, Button, ErrorState, Modal, ModalSpacer, inputCls, textareaCls, cx,
} from '@/components/admin/ui';

// Day close (docs/design "Cash & accounts › Day close"): day chips, one
// banner, a card per account (expected · counted · difference), then Close /
// Print Z-report. Every account is optional to count — cash too (owner
// decision); one left blank simply has no over/short row. Collections and the
// sales summary live in their own places (Collections tab, the Z-report).

const round2 = (n) => Math.round(n * 100) / 100;
const acctName = (a) => (a.kind === 'cash' ? 'Cash' : a.label);
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const dayChip = (s) => parseDay(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
const dayName = (s) => parseDay(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric' });
const dayLong = (s) => parseDay(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const diffTone = (d) => (d < 0 ? 'text-mq-danger-ink' : d > 0 ? 'text-mq-ok-ink' : 'text-mq-muted');

/** The one-line verdict under an account's count, in the design's words. */
function verdict(diff) {
  if (diff == null) return ['Not counted yet', 'text-mq-warn-ink'];
  if (diff === 0) return ['Counted matches the expected amount', 'text-mq-ok-ink'];
  return diff < 0 ? [`Short by ${money(-diff)}`, 'text-mq-danger-ink'] : [`Over by ${money(diff)}`, 'text-mq-ok-ink'];
}

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
    <div className="flex flex-col gap-3.5">
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
                'flex flex-col items-start gap-0.5 min-h-12 px-3.5 py-2 rounded-[10px] border text-left transition-colors flex-none',
                on ? 'bg-mq-soft border-mq-primary text-mq-primary' : 'bg-white border-mq-line text-mq-body hover:bg-mq-canvas',
              )}
            >
              <span className="font-mq-mono font-semibold text-[15px] tabular-nums">{dayChip(d)}</span>
              <span className={cx('text-[11.5px]', isToday ? 'text-mq-info-ink' : toClose ? 'text-mq-warn-ink' : 'text-mq-muted')}>
                {isToday ? 'Today · running' : toClose ? 'Not closed' : 'Closed'}
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
    </div>
  );
}

function DayDetail({ day }) {
  const q = useQuery({ queryKey: ['day-close', day], queryFn: () => fetchJson(`/api/admin/day-close/${day}`) });
  if (q.isLoading) return <RowsSkeleton rows={4} />;
  if (q.isError) return <ErrorState error={{ message: parseApiError(q.error) }} onRetry={() => q.refetch()} />;
  const p = q.data;
  if (p.needsOpening) return <OpeningPrompt />;
  if (p.beforeOpening) return <Alert tone="info" title="Before the opening date">{dayLong(day)} is before the opening date, so it isn’t part of the books and doesn’t need closing.</Alert>;
  if (p.status === 'closed') return <ClosedView day={day} preview={p} />;
  return <CloseForm day={day} preview={p} />;
}

// ── Shared ──────────────────────────────────────────────────────────────
const CardGrid = ({ children }) => (
  <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))' }}>{children}</div>
);

function AccountCard({ line, children, diff }) {
  const [text, tone] = verdict(diff);
  return (
    <div className="flex flex-col gap-2.5 p-3.5 bg-white border border-mq-line rounded-xl shadow-mq-card">
      <div className="flex items-start justify-between gap-2.5">
        <span className="text-sm font-semibold text-mq-ink truncate" title={line.number || undefined}>{acctName(line)}</span>
        <span className="flex flex-col items-end flex-none">
          <span className="text-[11px] text-mq-muted">Expected</span>
          <span className="font-mq-mono tabular-nums font-semibold text-mq-ink">{money(line.expected)}</span>
        </span>
      </div>
      {children}
      <span className={cx('text-[12.5px] font-semibold', tone)}>{text}</span>
    </div>
  );
}

/** Unpaid tabs / online orders still waiting — only shown when there are some. */
function OpenWork({ checks, carry, onCarry }) {
  const { openTabs, pendingOnline } = checks;
  if (!openTabs.length && !pendingOnline) return null;
  const parts = [
    openTabs.length && `${openTabs.length} unpaid ${openTabs.length === 1 ? 'tab' : 'tabs'}`,
    pendingOnline && `${pendingOnline} online ${pendingOnline === 1 ? 'order' : 'orders'} waiting`,
  ].filter(Boolean).join(' and ');
  return (
    <Alert
      tone="warn"
      title={`${parts} on this day`}
      action={<Button href="/admin/dashboard/orders" variant="secondary" size="sm" iconRight="arrowRight">Open Orders</Button>}
    >
      <span className="flex flex-col gap-2">
        <span>Settle them in Orders, or close anyway and carry them over to the next day.</span>
        {onCarry && (
          <label className="inline-flex items-center gap-2.5 cursor-pointer font-semibold">
            <input type="checkbox" className="w-[18px] h-[18px] accent-mq-primary flex-none" checked={carry} onChange={(e) => onCarry(e.target.checked)} />
            Close anyway — carry them over
          </label>
        )}
      </span>
    </Alert>
  );
}

/** Render the hidden Z-report in `variant`, then print its HTML. */
function printZ(docRef, setVariant, v) {
  flushSync(() => setVariant(v));
  const node = docRef.current;
  if (node) printHtml(node.innerHTML, v === 'a4' ? Z_CSS_A4 : Z_CSS);
}

// ── Open day: count and close ───────────────────────────────────────────
function CloseForm({ day, preview }) {
  const { report, lines } = preview;
  const running = preview.status === 'running';
  const refresh = useRefreshAfterClose();
  const qc = useQueryClient();
  const business = useBusiness();
  const docRef = useRef(null);
  const [variant, setVariant] = useState('80mm');
  const [counted, setCounted] = useState({});
  const [carry, setCarry] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const blockers = report.checks.openTabs.length + report.checks.pendingOnline;
  const entered = lines.map((l) => {
    const raw = counted[l.accountId];
    const has = raw != null && raw !== '';
    const amount = has ? Number(raw) : null;
    const valid = has && Number.isFinite(amount) && amount >= 0;
    return { ...l, valid, amount: valid ? amount : null, diff: valid ? round2(amount - l.expected) : null };
  });
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
  const uncounted = entered.filter((l) => !l.valid);
  const footNote = !form.valid ? 'Fix the amounts marked above.'
    : blocked ? 'Tick “Close anyway” above to carry the waiting work over.'
      : 'Sales and expenses for the day are locked once closed.';

  return (
    <>
      {running ? (
        <Alert tone="info" title="Running — closes after the day ends">This is a live preview; counting opens once {dayLong(day)} is over.</Alert>
      ) : (
        <Alert tone="warn" title={`Count the till before closing ${dayName(day)}`}>Closing a day locks its sales and expenses. Reopening needs a manager.</Alert>
      )}
      {preview.reopened && (
        <Alert tone="warn" title={`Reopened${preview.reopened.at ? ` ${when(preview.reopened.at)}` : ''}`}>{preview.reopened.reason}. Count again and close it.</Alert>
      )}
      <OpenWork checks={report.checks} carry={carry} onCarry={running ? null : setCarry} />

      <CardGrid>
        {entered.map((l) => (
          <AccountCard key={l.accountId} line={l} diff={l.diff}>
            <Field {...form.fieldProps(`c_${l.accountId}`)}>
              {(a) => (
                <input
                  {...a}
                  aria-label={`${acctName(l)} counted`}
                  className={inputCls({ size: 'lg', mono: true, className: '!h-11 text-right' })}
                  type="number" min="0" step="0.01" inputMode="decimal" placeholder="Counted"
                  value={counted[l.accountId] ?? ''} disabled={running}
                  onChange={(e) => setCounted({ ...counted, [l.accountId]: e.target.value })}
                />
              )}
            </Field>
          </AccountCard>
        ))}
      </CardGrid>

      <div className="flex items-center gap-3 flex-wrap">
        {!running && (
          <Button variant="primary" size="lg" className="!min-h-11" disabled={!canClose} onClick={() => setConfirm(true)}>Close {dayName(day)}</Button>
        )}
        <Button variant="secondary" size="lg" icon="print" className="!min-h-11" onClick={() => printZ(docRef, setVariant, '80mm')}>Print Z-report</Button>
        <span className="text-[12.5px] text-mq-on-tint">{running ? 'A preview — the day is still running.' : footNote}</span>
      </div>

      <ZReportDoc ref={docRef} business={business.name} day={day} report={{ ...report, lines: entered.map((l) => ({ ...l, counted: l.amount, difference: l.diff })) }} closedAt={null} variant={variant} />

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
              <ul className="m-0 p-0 list-none flex flex-col divide-y divide-mq-chip border border-mq-chip rounded-lg">
                {differences.map((l) => (
                  <li key={l.accountId} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                    <span>{acctName(l)}</span>
                    <span className={cx('font-mq-mono tabular-nums', diffTone(l.diff))}>{l.diff < 0 ? 'short' : 'over'} {money(Math.abs(l.diff))}</span>
                  </li>
                ))}
              </ul>
            )}
            {differences.length > 0 && <p className="m-0 text-[12.5px] text-mq-muted">Each difference is posted to that account’s cash book on {day}.</p>}
            {uncounted.length > 0 && <p className="m-0 text-[12.5px] text-mq-muted">Not counted: {uncounted.map(acctName).join(', ')} — no difference is recorded for {uncounted.length === 1 ? 'it' : 'them'}.</p>}
            {blockers > 0 && <p className="m-0 text-[12.5px] text-mq-muted">{report.checks.openTabs.length} unpaid {report.checks.openTabs.length === 1 ? 'tab' : 'tabs'} and {report.checks.pendingOnline} online {report.checks.pendingOnline === 1 ? 'order' : 'orders'} will be carried over.</p>}
          </div>
        </Modal>
      )}
    </>
  );
}

// ── Closed day: the same cards, read-only, plus reopen / print ──────────
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
  const diffOf = (l) => (l.counted == null ? null : Number(l.difference ?? round2(l.counted - l.expected)));
  const totalDiff = round2(lines.reduce((s, l) => s + (diffOf(l) ?? 0), 0));

  const undo = useMutation({
    mutationFn: () => fetchJson(`/api/admin/day-close/${day}/reopen`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }) }),
    onSuccess: (reopened) => { qc.setQueryData(['day-close', day], reopened); notify.success(`${day} reopened`, { title: `Could not reopen ${day}` }); setReopen(false); setReason(''); reopenForm.reset(); refresh(); },
    onError: (e) => reportSaveError(e, { form: reopenForm, title: `Could not reopen ${day}`, guess: { reason: /reason/i } }),
  });

  return (
    <>
      <Alert tone="ok" title={`${dayName(day)} is closed`}>
        Locked {when(preview.closedAt)}{closedBy ? ` by ${closedBy}` : ''} · net sales <span className="font-mq-mono tabular-nums">{money(report.sales.net)}</span>
        {totalDiff !== 0 ? <> · <span className={diffTone(totalDiff)}>{totalDiff < 0 ? 'short' : 'over'} {money(Math.abs(totalDiff))}</span></> : ' · counts match'}
        {report.carriedOver && (report.carriedOver.openTabs || report.carriedOver.pendingOnline)
          ? ` · ${report.carriedOver.openTabs} unpaid tab(s) and ${report.carriedOver.pendingOnline} online order(s) carried over` : ''}.
      </Alert>

      <CardGrid>
        {lines.map((l) => (
          <AccountCard key={l.accountId} line={l.label ? l : { ...l, label: `Account ${l.accountId}` }} diff={diffOf(l)}>
            <div className="flex items-center justify-between h-11 px-3 rounded-lg bg-mq-canvas border border-mq-line">
              <span className="text-[12.5px] text-mq-muted">Counted</span>
              <span className="font-mq-mono tabular-nums font-semibold text-mq-ink">{l.counted == null ? '—' : money(l.counted)}</span>
            </div>
          </AccountCard>
        ))}
      </CardGrid>

      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="primary" size="lg" className="!min-h-11" onClick={() => { reopenForm.reset(); setReopen(true); }}>Reopen {dayName(day)}</Button>
        <Button variant="secondary" size="lg" icon="print" className="!min-h-11" onClick={() => printZ(docRef, setVariant, '80mm')}>Print Z-report</Button>
        <Button variant="ghost" size="lg" className="!min-h-11" onClick={() => printZ(docRef, setVariant, 'a4')}>A4</Button>
        <span className="text-[12.5px] text-mq-on-tint">Sales and expenses for the day are locked.</span>
      </div>

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
