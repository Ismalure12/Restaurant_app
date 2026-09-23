'use client';

import cx from './cx';
import { RULE } from './Chip';

// Data table (docs/admin-design-system.md §7): sticky header, scrolls inside
// its card, money right-aligned in mono, optional 3px status rule per row.

export function Table({ maxH, className, minW, children, label }) {
  return (
    <div className={cx('overflow-auto', className)} style={maxH ? { maxHeight: maxH } : undefined} role={label ? 'region' : undefined} aria-label={label} tabIndex={label ? 0 : undefined}>
      <table className="w-full border-collapse text-[13.5px] text-mq-body" style={minW ? { minWidth: minW } : undefined}>
        {children}
      </table>
    </div>
  );
}

export function Th({ align = 'left', className, children, ...rest }) {
  return (
    <th
      scope="col"
      className={cx(
        'sticky top-0 z-[1] bg-white px-3.5 py-2.5 border-b border-mq-line text-[11px] font-semibold uppercase tracking-[.1em] text-mq-muted whitespace-nowrap',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

/** `mono` for codes / times; `money` = mono + right + ink. */
export function Td({ align, mono, money, strong, muted, className, children, ...rest }) {
  return (
    <td
      className={cx(
        'px-3.5 py-[11px] border-b border-mq-chip align-middle',
        (money || align === 'right') && 'text-right',
        align === 'center' && 'text-center',
        (mono || money) && 'font-mq-mono tabular-nums',
        mono && !money && 'text-[12.5px]',
        money && 'text-mq-ink font-medium whitespace-nowrap',
        strong && 'text-mq-ink font-semibold',
        muted && 'text-mq-muted',
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

/**
 * A body row. `onClick` makes the whole row a target (Enter/Space too);
 * `tone` draws the status rule; `dim` greys a voided row.
 */
export function Tr({ onClick, tone, dim, selected, className, children, label }) {
  const clickable = !!onClick;
  return (
    <tr
      onClick={onClick}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } } : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={label}
      className={cx(
        tone && RULE[tone],
        dim && 'text-mq-muted [&_td]:text-mq-muted',
        selected ? 'bg-mq-soft' : clickable && 'hover:bg-mq-cream',
        clickable && 'cursor-pointer focus-visible:outline-none focus-visible:bg-mq-soft',
        className,
      )}
    >
      {children}
    </tr>
  );
}

/** Totals row under the body. */
export function TotalRow({ children }) {
  return <tr className="bg-mq-cream [&_td]:font-semibold [&_td]:text-mq-ink [&_td]:border-b-0">{children}</tr>;
}

/** Empty/loading row spanning all columns. */
export function EmptyRow({ cols, children }) {
  return <tr><td colSpan={cols} className="px-4 py-8 text-center text-[13px] text-mq-muted">{children}</td></tr>;
}

/** Footer bar for cursor paging: "Showing N of TOTAL" + Load more. */
export function LoadMoreBar({ shown, total, hasMore, loading, onMore, noun = 'rows', children }) {
  if (!hasMore && !children && shown === 0) return null;
  return (
    <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 bg-mq-cream border-t border-mq-line rounded-b-xl text-[12.5px] text-mq-muted">
      <span className="tabular-nums">
        Showing <b className="font-mq-mono font-semibold text-mq-ink">{shown.toLocaleString()}</b>
        {total != null && <> of <b className="font-mq-mono font-semibold text-mq-ink">{Number(total).toLocaleString()}</b></>} {noun}
      </span>
      <span className="flex-1" />
      {children}
      {hasMore && (
        <button
          type="button"
          onClick={onMore}
          disabled={loading}
          className="inline-flex items-center h-8 px-3 rounded-[7px] border border-mq-line bg-white text-mq-body text-[12.5px] font-semibold hover:bg-mq-canvas disabled:opacity-60"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
