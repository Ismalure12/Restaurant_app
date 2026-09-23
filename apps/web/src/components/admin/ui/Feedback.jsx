import cx from './cx';
import Icon from './icons';
import Button from './Button';

// Feedback + states (docs/admin-design-system.md §9–10).

const ALERT = {
  danger: { box: 'bg-mq-danger-bg border-mq-danger-line text-mq-danger-ink', icon: 'alert' },
  warn: { box: 'bg-mq-warn-bg border-mq-warn-line text-mq-warn-ink', icon: 'alert' },
  info: { box: 'bg-mq-info-bg border-mq-info-line text-mq-info-ink', icon: 'info' },
  ok: { box: 'bg-mq-ok-bg border-mq-ok-line text-mq-ok-ink', icon: 'check' },
};

/** Inline alert. `action` is a node (usually a small Button). */
export function Alert({ tone = 'info', title, children, action, icon, className, role }) {
  const t = ALERT[tone];
  return (
    <div role={role || (tone === 'danger' ? 'alert' : 'status')} className={cx('flex items-start gap-2.5 border rounded-[10px] px-3.5 py-3', t.box, className)}>
      <span className="mt-px"><Icon name={icon || t.icon} size={17} stroke={2.2} /></span>
      <div className="flex-1 min-w-0 text-[12.5px] leading-normal">
        {title && <div className="text-[13.5px] font-semibold">{title}</div>}
        {children && <div className="opacity-[.92]">{children}</div>}
      </div>
      {action && <div className="flex-none self-center">{action}</div>}
    </div>
  );
}

/** Empty state: icon tile, title, text and one next action. */
export function EmptyState({ icon = 'box', title, children, action, className }) {
  return (
    <div className={cx('flex flex-col items-center text-center gap-2 px-5 py-8', className)}>
      <span className="grid place-items-center w-[46px] h-[46px] rounded-[14px] bg-mq-chip text-mq-muted mb-1">
        <Icon name={icon} size={22} stroke={1.6} />
      </span>
      {title && <div className="text-[14.5px] font-semibold text-mq-ink">{title}</div>}
      {children && <div className="text-[12.5px] text-mq-muted max-w-[46ch] leading-normal">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Shimmer block. */
export function Skeleton({ className, style }) {
  return (
    <span
      aria-hidden="true"
      className={cx('block rounded-md bg-[length:200%_100%] bg-[linear-gradient(90deg,#EFEFEA_25%,#F7F7F4_50%,#EFEFEA_75%)] animate-mq-shimmer motion-reduce:animate-none', className)}
      style={style}
    />
  );
}

/** Row of KPI skeleton cards. */
export function KpiSkeletons({ count = 4, min = 200 }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px,100%),1fr))` }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 bg-white border border-mq-line rounded-xl p-4">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

/** Stack of line skeletons (table body placeholder). */
export function RowSkeletons({ rows = 6, className }) {
  return (
    <div className={cx('flex flex-col gap-3 p-4', className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-4" style={{ width: `${92 - (i % 3) * 12}%` }} />)}
    </div>
  );
}

/** "Couldn't load" note with retry. */
export function ErrorState({ error, onRetry, title = 'Couldn’t load this' }) {
  return (
    <Alert
      tone="danger"
      title={title}
      action={onRetry && <Button size="xs" variant="secondary" icon="refresh" onClick={onRetry}>Retry</Button>}
    >
      {error?.message || 'Check the connection and try again.'}
    </Alert>
  );
}

/** No-access card. */
export function NoAccess({ what = 'this page', role, action }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 bg-mq-cream border border-mq-line rounded-xl px-5 py-10">
      <span className="grid place-items-center w-[46px] h-[46px] rounded-[14px] bg-white border border-mq-line text-mq-muted mb-1">
        <Icon name="lock" size={20} stroke={1.8} />
      </span>
      <div className="text-[14.5px] font-semibold text-mq-ink">You don’t have access to {what}</div>
      <div className="text-[12.5px] text-mq-muted">Ask a manager to grant it in Settings › Staff access.</div>
      {role && <div className="font-mq-mono text-[11.5px] text-mq-muted">role: {role}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
