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


const signed = (n) => (Number(n) < 0 ? '-' : '+') + money(Math.abs(Number(n)));
const round2 = (n) => Math.round(n * 100) / 100;
const acctName = (a) => (a.kind === 'cash' ? 'Cash' : a.label);
const when = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const CloseIc = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12" /></svg>;
const PrintIc = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2" /><path d="M6 14h12v7H6z" /></svg>;

// Every query a close/reopen can change.
function useRefreshAfterClose() {
  const qc = useQueryClient();
  return () => {
    ['day-close', 'day-close-list', 'day-close-overview', 'account-balances', 'account-entries', 'collections', 'overview']
      .forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
}

function Modal({ title, eyebrow, onClose, busy, children }) {
  return (
    <div className="jz-modal-bk open" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-h">
          <div className="mt"><div className="eyebrow">{eyebrow}</div><div className="h-1" style={{ marginTop: 3 }}>{title}</div></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close" disabled={busy}>{CloseIc}</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Prompt({ children, action }) {
  return (
    <div className="card card-pad-lg cash-prompt" style={{ marginBottom: 16 }}>
      <div className="note">{children}</div>
      {action}
    </div>
  );
}
const OpeningPrompt = () => (
  <Prompt action={<Link href="/admin/dashboard/settings/money" className="btn btn-primary">Set opening balances</Link>}>
    Set the opening balances first (Settings › Business). Days are closed from the opening date on.
  </Prompt>
);

// ── The tab ─────────────────────────────────────────────────────────────
export default function DayCloseTab({ dayParam, onDay }) {
  const list = useQuery({ queryKey: ['day-close-list'], queryFn: () => fetchJson('/api/admin/day-close'), staleTime: 15 * 1000 });
  if (list.isLoading) return <RowsSkeleton rows={3} height={48} />;
  if (list.isError) return <div className="card card-pad"><div className="adm-error-banner">Couldn&rsquo;t load days to close. <button className="btn btn-ghost btn-sm" onClick={() => list.refetch()}>Try again</button></div></div>;
  const { today, openingDate, unclosed } = list.data;
  if (!openingDate) return <OpeningPrompt />;

  const day = dayParam || unclosed[0] || null;
  const chips = [...unclosed];
  if (day && !chips.includes(day) && day !== today) chips.push(day); // e.g. a closed day opened from the archive
  chips.push(today);

  return (
    <>
      <div className="dc-days" role="tablist" aria-label="Days">
        {chips.map((d) => {
          const isToday = d === today;
          return (
            <button key={d} role="tab" aria-selected={d === day} className={`dc-day ${d === day ? 'on' : ''}`} onClick={() => onDay(d)}>
              <span className="dc-day-d">{d}</span>
              <span className="dc-day-s">{isToday ? 'Today · running' : unclosed.includes(d) ? 'To close' : 'Closed'}</span>
            </button>
          );
        })}
      </div>
      {unclosed.length === 0 && !dayParam && (
        <div className="card card-pad-lg" style={{ marginBottom: 16 }}>
          <div className="ttl">All caught up</div>
          <div className="note">Every finished day is closed. Today closes after the day ends. Past closes are in <Link className="cash-link" href="/admin/dashboard/reports/day-closes">Reports › Day closes</Link>.</div>
        </div>
      )}
      {day && <DayDetail key={day} day={day} />}
    </>
  );
}

function DayDetail({ day }) {
  const q = useQuery({ queryKey: ['day-close', day], queryFn: () => fetchJson(`/api/admin/day-close/${day}`) });
  if (q.isLoading) return <><KpiRowSkeleton count={3} /><RowsSkeleton rows={4} className="dc-gap" /></>;
  if (q.isError) return <div className="card card-pad"><div className="adm-error-banner">{parseApiError(q.error)} <button className="btn btn-ghost btn-sm" onClick={() => q.refetch()}>Try again</button></div></div>;
  const p = q.data;
  if (p.needsOpening) return <OpeningPrompt />;
  if (p.beforeOpening) return <div className="card card-pad-lg"><div className="note">{day} is before the opening date, so it isn&rsquo;t part of the books and doesn&rsquo;t need closing.</div></div>;
  if (p.status === 'closed') return <ClosedView day={day} preview={p} />;
  return <CloseForm day={day} preview={p} />;
}

// ── Shared, read-only sections ──────────────────────────────────────────
function Section({ eyebrow, title, note, children, flush }) {
  return (
    <div className="card reveal dc-sec" style={flush ? { overflow: 'hidden' } : undefined}>
      <div className="card-h"><div><div className="eyebrow">{eyebrow}</div><div className="ttl">{title}</div>{note && <div className="note">{note}</div>}</div></div>
      {children}
    </div>
  );
}

function ChecksBody({ report, carry, onCarry, carriedOver }) {
  const { openTabs, pendingOnline } = report.checks || { openTabs: [], pendingOnline: 0 };
  const blockers = openTabs.length + pendingOnline;
  if (carriedOver) {
    return <div className="card-pad note">Closed with {carriedOver.openTabs} unpaid {carriedOver.openTabs === 1 ? 'tab' : 'tabs'} and {carriedOver.pendingOnline} online {carriedOver.pendingOnline === 1 ? 'order' : 'orders'} carried over to the next day.</div>;
  }
  if (!blockers) return <div className="card-pad dc-ok"><span className="kpi-dot green" /> No unpaid tabs and no online orders waiting.</div>;
  return (
    <div className="card-pad">
      {openTabs.length > 0 && (
        <ul className="dc-tabs">
          {openTabs.map((t) => <li key={t.id}><span>{t.table ? `Table ${t.table}` : `Order #${t.id}`}</span><span className="mono">{money(t.total)}</span></li>)}
        </ul>
      )}
      {pendingOnline > 0 && <p className="note" style={{ margin: '8px 0' }}>{pendingOnline} online {pendingOnline === 1 ? 'order is' : 'orders are'} still waiting to be accepted or declined.</p>}
      <Link href="/admin/dashboard/orders" className="btn btn-ghost btn-sm">Open Orders to settle them</Link>
      {onCarry && (
        <label className="dc-carry">
          <input type="checkbox" checked={carry} onChange={(e) => onCarry(e.target.checked)} />
          <span>Close anyway — carry them over to the next day</span>
        </label>
      )}
    </div>
  );
}

function CollectionsBody({ col }) {
  if (!col || !col.rows?.length) return <div className="card-pad note">No staff member took payments on this day.</div>;
  return (
    <div className="table-wrap">
      <table className="table" style={{ marginTop: 4 }}>
        <thead><tr><th>Person</th>{col.accounts.map((a) => <th key={a.id} className="num">{acctName(a)}</th>)}<th className="num">Total</th></tr></thead>
        <tbody>
          {col.rows.map((r) => (
            <tr key={r.staffId}>
              <td><span className="strong">{r.name}</span> <span className="pill pill-ghost" style={{ textTransform: 'capitalize' }}>{r.role}</span></td>
              {col.accounts.map((a) => <td key={a.id} className="num">{r.byAccount?.[a.id] != null ? money(r.byAccount[a.id]) : <span className="muted">—</span>}</td>)}
              <td className="num strong">{money(r.total)}</td>
            </tr>
          ))}
          <tr>
            <td className="strong">Total</td>
            {col.accounts.map((a) => <td key={a.id} className="num strong">{money(col.totals?.[a.id])}</td>)}
            <td className="num strong">{money(col.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function SalesBody({ report }) {
  const s = report.sales;
  const voids = report.voids || [];
  return (
    <div className="card-pad">
      <dl className="dc-kv">
        <dt>Sales ({s.count})</dt><dd>{money(s.gross)}</dd>
        <dt>Discounts given</dt><dd>{money(s.discounts)}</dd>
        <dt>Refunds ({s.refundCount})</dt><dd>{s.refunds > 0 ? `-${money(s.refunds)}` : money(0)}</dd>
        <dt className="strong">Net sales</dt><dd className="strong">{money(s.net)}</dd>
        <dt>Billed on account ({s.onAccount.count})</dt><dd>{money(s.onAccount.total)}</dd>
      </dl>
      {s.byAccount.length > 0 && (
        <>
          <div className="dc-sub">By account</div>
          <dl className="dc-kv">{s.byAccount.map((a) => <Fragment key={a.accountId}><dt>{acctName(a)}</dt><dd>{money(a.sales)}</dd></Fragment>)}</dl>
        </>
      )}
      {voids.length > 0 && (
        <>
          <div className="dc-sub">Voided sales ({voids.length})</div>
          <ul className="dc-tabs">
            {voids.map((v) => (
              <li key={v.orderId}>
                <span><Link className="cash-link" href={`/admin/dashboard/sales/${v.orderId}`}>{v.table ? `Table ${v.table}` : `Order #${v.orderId}`}</Link> <span className="muted">— {v.reason || 'no reason given'}</span></span>
                <span className="mono">{money(v.total)}</span>
              </li>
            ))}
          </ul>
        </>
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

  return (
    <>
      {running && (
        <div className="cal-prompt" role="status">Running — closes after the day ends. This is a live preview; counting opens once {day} is over.</div>
      )}
      {preview.reopened && (
        <div className="cal-prompt" role="status">Reopened{preview.reopened.at ? ` ${when(preview.reopened.at)}` : ''}: {preview.reopened.reason}. Count again and close it.</div>
      )}

      <Section eyebrow="Step 1" title="Checks" note="Unpaid tabs and online orders still waiting on this day.">
        <ChecksBody report={report} carry={carry} onCarry={running ? null : setCarry} />
      </Section>

      <Section eyebrow="Step 2" title="Collected by each person" note="What each waiter and cashier must have handed over." flush>
        <CollectionsBody col={report.collections} />
      </Section>

      <Section eyebrow="Step 3" title="Count the accounts" note="Cash must be counted. For the others, enter the balance shown in the app or on the statement — or leave it blank.">
        <div className="dc-accts">
          {entered.map((l) => {
            const isCash = l.kind === 'cash';
            return (
              <div key={l.accountId} className="dc-acct">
                <div className="dc-acct-top">
                  <div><div className="ttl">{acctName(l)}</div>{l.number && <div className="note">{l.number}</div>}</div>
                  <div className="dc-exp"><span className="note">Expected</span><span className="mono strong">{money(l.expected)}</span></div>
                </div>
                <dl className="dc-kv dc-kv-sm">
                  <dt>Opening</dt><dd>{money(l.opening)}</dd>
                  <dt>Money in</dt><dd className="cash-pos">{money(l.moneyIn)}</dd>
                  <dt>Money out</dt><dd className="cash-neg">{money(l.moneyOut)}</dd>
                </dl>
                <Field className="g3-flush" label={isCash ? 'Cash counted ($)' : 'Balance in the app / statement ($)'} required={isCash} {...form.fieldProps(`c_${l.accountId}`)}>
                  <input
                    className="input" type="number" min="0" step="0.01" inputMode="decimal" placeholder={isCash ? 'Count the till' : 'Optional'}
                    value={counted[l.accountId] ?? ''} disabled={running}
                    onChange={(e) => setCounted({ ...counted, [l.accountId]: e.target.value })}
                  />
                </Field>
                {l.diff != null && (
                  <div className={`dc-diff ${l.diff < 0 ? 'cash-neg' : l.diff > 0 ? 'cash-pos' : ''}`}>
                    <strong>{l.diff === 0 ? '$0.00' : signed(l.diff)}</strong> {diffText(l.diff, day)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="card-pad note" style={{ paddingTop: 0 }}>To see whose money is short, compare the difference with each person&rsquo;s collections in Step 2.</div>
      </Section>

      <Section eyebrow="Step 4" title="Sales summary" flush>
        <SalesBody report={report} />
      </Section>

      {!running && (
        <div className="dc-foot">
          <button className="btn btn-primary" disabled={!canClose} onClick={() => setConfirm(true)}>Close day {day}</button>
          <span className="note">
            {!form.valid ? (Object.values(form.errors)[0] === 'Count the cash' ? 'Count the cash to close the day.' : 'Fix the amounts marked above.') : blocked ? 'Tick “Close anyway” in Step 1 to carry the waiting work over.' : 'Closing locks the day.'}
          </span>
        </div>
      )}

      {confirm && (
        <Modal title={`Close ${day}?`} eyebrow="Day close" onClose={() => setConfirm(false)} busy={close.isPending}>
          <div className="modal-b">
            <p style={{ margin: 0 }}>Closing locks <strong>{day}</strong>. Its sales, expenses, payments and cash book can no longer be changed &mdash; corrections go into the open day instead. You can reopen it later (newest day first) with a reason.</p>
            {differences.length > 0 && (
              <ul className="dc-tabs">
                {differences.map((l) => <li key={l.accountId}><span>{acctName(l)}</span><span className={`mono ${l.diff < 0 ? 'cash-neg' : 'cash-pos'}`}>{l.diff < 0 ? 'short' : 'over'} {money(Math.abs(l.diff))}</span></li>)}
              </ul>
            )}
            {blockers > 0 && <p className="note" style={{ margin: 0 }}>{report.checks.openTabs.length} unpaid {report.checks.openTabs.length === 1 ? 'tab' : 'tabs'} and {report.checks.pendingOnline} online {report.checks.pendingOnline === 1 ? 'order' : 'orders'} will be carried over.</p>}
          </div>
          <div className="modal-f">
            <button className="btn btn-ghost" onClick={() => setConfirm(false)} disabled={close.isPending}>Cancel</button>
            <button className="btn btn-primary" onClick={() => close.mutate()} disabled={close.isPending}>{close.isPending ? 'Closing…' : 'Close day'}</button>
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
      <div className="card card-pad-lg dc-head reveal">
        <div>
          <div className="eyebrow">Z-report</div>
          <div className="h-2">{day} is closed</div>
          <div className="note">Locked {when(preview.closedAt)}{closedBy ? ` by ${closedBy}` : ''}. Net sales {money(report.sales.net)}{totalDiff !== 0 ? ` · ${totalDiff < 0 ? 'short' : 'over'} ${money(Math.abs(totalDiff))}` : ' · counts match'}.</div>
        </div>
        <div className="dc-actions">
          <button className="btn btn-primary" onClick={() => print('80mm')}>{PrintIc} Print Z-report (80mm)</button>
          <button className="btn btn-ghost" onClick={() => print('a4')}>{PrintIc} Print (A4)</button>
          <button className="btn btn-ghost" onClick={() => { reopenForm.reset(); setReopen(true); }}>Reopen day</button>
        </div>
      </div>

      <Section eyebrow="Accounts" title="Expected vs counted" flush>
        <div className="table-wrap">
          <table className="table" style={{ marginTop: 4 }}>
            <thead><tr><th>Account</th><th className="num">Opening</th><th className="num">In</th><th className="num">Out</th><th className="num">Expected</th><th className="num">Counted</th><th className="num">Difference</th></tr></thead>
            <tbody>
              {lines.map((l) => {
                const diff = l.counted == null ? null : Number(l.difference ?? round2(l.counted - l.expected));
                return (
                  <tr key={l.accountId}>
                    <td className="strong">{l.label ? acctName(l) : `Account ${l.accountId}`}</td>
                    <td className="num">{money(l.opening)}</td>
                    <td className="num">{money(l.moneyIn)}</td>
                    <td className="num">{money(l.moneyOut)}</td>
                    <td className="num">{money(l.expected)}</td>
                    <td className="num">{l.counted == null ? <span className="muted">not counted</span> : money(l.counted)}</td>
                    <td className={`num strong ${diff < 0 ? 'cash-neg' : diff > 0 ? 'cash-pos' : ''}`}>{diff == null ? '—' : diff === 0 ? '$0.00' : signed(diff)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
      <Section eyebrow="Checks" title="Open work at close"><ChecksBody report={report} carriedOver={report.carriedOver} /></Section>
      <Section eyebrow="People" title="Collected by each person" flush><CollectionsBody col={report.collections} /></Section>
      <Section eyebrow="Sales" title="Sales summary" flush><SalesBody report={report} /></Section>

      <ZReportDoc ref={docRef} business={business.name} day={day} report={{ ...report, lines }} closedAt={preview.closedAt} closedBy={closedBy} variant={variant} />

      {reopen && (
        <Modal title={`Reopen ${day}`} eyebrow="Day close" onClose={() => setReopen(false)} busy={undo.isPending}>
          <form noValidate onSubmit={(e) => { e.preventDefault(); if (!reopenForm.check() || undo.isPending) return; reopenForm.setServerErrors(null); undo.mutate(); }} style={{ display: 'contents' }}>
            <div className="modal-b">
              <p style={{ margin: 0 }}>Reopening unlocks the day and reverses its count differences. Only the newest closed day can be reopened. The reason is recorded in the audit log.</p>
              <Field label="Reason" required {...reopenForm.fieldProps('reason')}><textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. A payment was missed" /></Field>
            </div>
            <div className="modal-f">
              <button type="button" className="btn btn-ghost" onClick={() => setReopen(false)} disabled={undo.isPending}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={undo.isPending || !reopenForm.valid}>{undo.isPending ? 'Reopening…' : 'Reopen day'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
