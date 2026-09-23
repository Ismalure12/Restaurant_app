'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { monthLabel } from './StatementDoc';

/**
 * One-line "can this period be closed?" status.
 *   items: [{ key, label, done, links?: [{ href, label }] }]
 * All done  -> a quiet green "Ready to close".
 * Otherwise -> "N things left before closing", click to open the checklist
 *              (ticks for what is done, links for what is missing).
 */
export default function Readiness({ items }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const left = items.filter((i) => !i.done);
  if (!items.length) return null;
  if (!left.length) {
    return <div className="g5-ready ok" role="status"><span className="g5-dot" aria-hidden="true">✓</span>Ready to close</div>;
  }
  return (
    <div className="g5-ready warn">
      <button type="button" className="g5-ready-b" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <span className="g5-dot" aria-hidden="true">{left.length}</span>
        {left.length === 1 ? '1 thing left before closing' : `${left.length} things left before closing`}
        <span className="g5-chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul id={id} className="g5-checks">
          {items.map((i) => (
            <li key={i.key} className={i.done ? 'done' : 'todo'}>
              <span className="g5-tick" aria-hidden="true">{i.done ? '✓' : '○'}</span>
              <span className="g5-lbl">{i.label}<span className="sr-only">{i.done ? ' (done)' : ' (still to do)'}</span></span>
              {!i.done && (i.links || []).map((l) => <Link key={l.href} className="btn btn-ghost btn-sm" href={l.href}>{l.label}</Link>)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Text for the disabled Close button's tooltip. */
export const missingTitle = (items) => {
  const left = items.filter((i) => !i.done).map((i) => i.label);
  return left.length ? `Before closing: ${left.join('; ')}` : undefined;
};

const STATEMENTS = '/admin/dashboard/reports/statements';
const DAY_CLOSE = '/admin/dashboard/cash?tab=day-close';
// Past this many unclosed days, one link to the Day close list replaces the rest.
const MAX_DAY_LINKS = 8;
const plural = (n, one, many) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/**
 * The month's closing checklist, built ONLY from the API's structured
 * `checks` ({ ended, unclosedDays, stockCounted, prevMonth }). null (the
 * statement is blocked) → no checklist; see blockedMessage().
 */
export function monthChecklist(checks) {
  if (!checks) return [];
  const days = Array.isArray(checks.unclosedDays) ? checks.unclosedDays : [];
  const dayLinks = days.slice(0, MAX_DAY_LINKS).map((day) => ({ href: `${DAY_CLOSE}&day=${day}`, label: `Close ${day}` }));
  if (days.length > MAX_DAY_LINKS) dayLinks.push({ href: DAY_CLOSE, label: `All ${days.length} days` });
  return [
    { key: 'ended', done: !!checks.ended, label: checks.ended ? 'The month has ended' : 'Wait until the month has ended' },
    { key: 'days', done: days.length === 0, label: days.length ? `Close ${plural(days.length, 'day', 'days')} (Cash & accounts › Day close)` : 'Every day is closed', links: dayLinks },
    { key: 'stock', done: !!checks.stockCounted, label: checks.stockCounted ? 'Stock has been counted' : 'Count the stock (Inventory › Counts)', links: [{ href: '/admin/dashboard/inventory?tab=counts', label: 'Inventory › Counts' }] },
    { key: 'prev', done: !checks.prevMonth, label: checks.prevMonth ? `Close ${monthLabel(checks.prevMonth)} first` : 'The previous month is closed',
      links: checks.prevMonth ? [{ href: `${STATEMENTS}?month=${checks.prevMonth}`, label: monthLabel(checks.prevMonth) }] : [] },
  ];
}

/** The year's closing checklist from `checks` ({ ended, openMonths, hasClosedMonths }). */
export function yearChecklist(checks) {
  if (!checks) return [];
  const open = Array.isArray(checks.openMonths) ? checks.openMonths : [];
  return [
    { key: 'ended', done: !!checks.ended, label: checks.ended ? 'The financial year has ended' : 'Wait until the financial year has ended' },
    { key: 'months', done: open.length === 0, label: open.length ? `Close ${plural(open.length, 'month', 'months')} first` : 'Every month is closed',
      links: open.map((m) => ({ href: `${STATEMENTS}?view=month&month=${m}`, label: monthLabel(m) })) },
    // Only its own line when the months line doesn't already cover it.
    ...(!checks.hasClosedMonths && open.length === 0 ? [{ key: 'some', done: false, label: 'Close at least one month — the year is built from closed months' }] : []),
  ];
}

/** Why a period can't be closed at all when its statement is blocked (null = not blocked). */
export function blockedMessage(blocked) {
  if (!blocked) return null;
  if (blocked === 'needs-opening') return 'Set the opening balances (Settings › Business) before closing';
  if (blocked === 'before-opening') return 'This period is before the opening balances date — there is nothing to close';
  return 'This period cannot be closed yet';
}
