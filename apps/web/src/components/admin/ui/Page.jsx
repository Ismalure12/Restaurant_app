import cx from './cx';

/** Page body: padding + max width (docs/admin-design-system.md §3, §11). */
export default function Page({ className, narrow, children }) {
  return (
    <div className={cx('w-full px-3 pt-4 pb-12 tab:px-4 desk:px-5 flex flex-col gap-4', narrow ? 'max-w-[1000px]' : 'max-w-[1400px]', className)}>
      {children}
    </div>
  );
}

/** Toolbar row: wraps, left group + right group (use <span className="flex-1" /> to split). */
export function Toolbar({ className, children }) {
  return <div className={cx('flex items-center gap-2.5 flex-wrap', className)}>{children}</div>;
}

/** Small uppercase section heading between blocks ("Right now"). */
export function SectionLabel({ children, note, className }) {
  return (
    <div className={cx('flex items-baseline gap-2.5 mt-2', className)}>
      <h2 className="m-0 text-[11px] font-semibold uppercase tracking-[.12em] text-mq-muted">{children}</h2>
      {note && <span className="text-xs text-mq-muted">{note}</span>}
    </div>
  );
}

/** Label/value list (drawer facts, detail panels). items: [[label, value], …] */
export function Facts({ items, labelWidth = 104, className }) {
  return (
    <dl className={cx('m-0 grid gap-x-3 gap-y-2 text-[13px]', className)} style={{ gridTemplateColumns: `${labelWidth}px 1fr` }}>
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-mq-muted">{k}</dt>
          <dd className="m-0 text-mq-ink min-w-0 break-words">{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
