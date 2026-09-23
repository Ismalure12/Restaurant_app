'use client';

import Link from 'next/link';
import { Alert, Icon, cx } from '@/components/admin/ui';
import { monthLabel } from './StatementDoc';

/**
 * "Can this period be closed?" checklist card.
 *   items: [{ key, label, done, links?: [{ href, label }] }]
 * All done  -> a quiet green "Ready to close".
 * Otherwise -> the list: ticks for what is done, links for what is missing.
 */
export default function Readiness({ items, title = 'Before this period can be closed' }) {
  const left = items.filter((i) => !i.done);
  if (!items.length) return null;
  if (!left.length) return <Alert tone="ok" title="Ready to close">Every check is done.</Alert>;
  return (
    <section className="flex flex-col gap-2.5 bg-white border border-mq-line rounded-xl px-4 py-3.5 shadow-mq-card" aria-label={title}>
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="m-0 text-sm font-semibold text-mq-ink">{title}</h3>
        <span className="text-xs text-mq-muted">{left.length === 1 ? '1 thing left' : `${left.length} things left`}</span>
      </div>
      <ul className="m-0 p-0 list-none flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-2.5 flex-wrap text-[13.5px] text-mq-ink">
            <span
              aria-hidden="true"
              className={cx('grid place-items-center w-[22px] h-[22px] rounded-full flex-none', i.done ? 'bg-mq-ok-bg text-mq-ok-ink' : 'border-2 border-mq-warn')}
            >
              {i.done && <Icon name="check" size={12} stroke={3} />}
            </span>
            <span className={i.done ? 'text-mq-on-tint' : undefined}>{i.label}<span className="sr-only">{i.done ? ' (done)' : ' (still to do)'}</span></span>
            {!i.done && (i.links || []).map((l) => (
              <Link key={l.href} href={l.href} className="text-[13px] font-semibold text-mq-cta hover:text-mq-primary">{l.label} →</Link>
            ))}
          </li>
        ))}
      </ul>
    </section>
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
