import cx from './cx';

/** White bordered card, radius 12 (docs/admin-design-system.md §3). */
export default function Card({ as: Tag = 'section', className, pad = false, children, ...rest }) {
  return (
    <Tag className={cx('bg-white border border-mq-line rounded-xl shadow-mq-card min-w-0', pad && 'p-4 tab:p-[18px]', className)} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * Card header strip, three looks from the design:
 * - default: cream strip, title + count pill + subtitle inline (table cards);
 * - `eyebrow`: cream strip, an overline ("PROFIT & LOSS") above the title
 *   ("What the month earned") (report tables);
 * - `chart`: white strip, title above the subtitle (chart cards).
 */
export function CardHeader({ title, count, sub, eyebrow, chart, actions, className, children }) {
  return (
    <div
      className={cx(
        'flex items-center gap-2.5 flex-wrap px-4 border-b rounded-t-xl',
        chart ? 'bg-white border-mq-chip' : 'bg-mq-cream border-mq-line',
        eyebrow ? 'py-[11px]' : 'py-[13px]',
        className,
      )}
    >
      {chart ? (
        <div className="flex flex-col gap-px min-w-0 flex-1">
          <span className="flex items-center gap-2 min-w-0">
            <h3 className="m-0 text-sm font-semibold tracking-[-.01em] text-mq-ink">{title}</h3>
            {count != null && <CountPill>{count}</CountPill>}
          </span>
          {sub && <span className="text-xs text-mq-muted">{sub}</span>}
        </div>
      ) : eyebrow ? (
        <div className="flex flex-col gap-px min-w-0 flex-1">
          <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-mq-muted">{eyebrow}</span>
          <span className="flex items-center gap-2 min-w-0">
            <h3 className="m-0 text-sm font-semibold tracking-[-.01em] text-mq-ink truncate">{title}</h3>
            {count != null && <CountPill>{count}</CountPill>}
          </span>
          {sub && <span className="text-xs text-mq-muted">{sub}</span>}
        </div>
      ) : (
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* The title keeps its width; only the subtitle gives way when space runs out. */}
          <h3 className="m-0 text-sm font-semibold tracking-[-.01em] text-mq-ink truncate flex-none max-w-full">{title}</h3>
          {count != null && <CountPill>{count}</CountPill>}
          {sub && <span className="text-xs text-mq-muted truncate">{sub}</span>}
        </div>
      )}
      {children}
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

/** Plain card title row (no strip) for chart cards. */
export function CardTitle({ title, sub, actions, className }) {
  return (
    <div className={cx('flex items-start gap-3 flex-wrap', className)}>
      <div className="flex-1 min-w-0">
        <h3 className="m-0 text-sm font-semibold tracking-[-.01em] text-mq-ink">{title}</h3>
        {sub && <p className="m-0 mt-0.5 text-xs text-mq-muted">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function CountPill({ children, className }) {
  return (
    <span className={cx('font-mq-mono text-[11px] font-semibold bg-mq-chip text-mq-chip-ink rounded-full px-[7px] py-px tabular-nums', className)}>
      {children}
    </span>
  );
}

/** Overline label (group headers, table headers, form labels). */
export function Overline({ as: Tag = 'span', className, children, ...rest }) {
  return <Tag className={cx('text-[11px] font-semibold uppercase tracking-[.1em] text-mq-muted', className)} {...rest}>{children}</Tag>;
}
