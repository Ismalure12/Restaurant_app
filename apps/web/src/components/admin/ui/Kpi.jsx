import Link from 'next/link';
import cx from './cx';
import Icon from './icons';

/** Grid for KPI tiles. `min` = the column minimum (216 overview, 180 reports). */
export function KpiGrid({ min = 200, className, children }) {
  return (
    <div className={cx('grid gap-3', className)} style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 100%), 1fr))` }}>
      {children}
    </div>
  );
}

/**
 * Delta pill vs the previous period. `value` = current, `previous` = earlier.
 * `invert` for numbers where going up is bad (expenses, voids).
 */
export function Delta({ value, previous, invert = false, className }) {
  if (previous == null || value == null) return null;
  const prev = Number(previous), cur = Number(value);
  let pct = null;
  if (prev === 0) pct = cur === 0 ? 0 : null;
  else pct = ((cur - prev) / Math.abs(prev)) * 100;
  const flat = pct === null ? cur === prev : Math.abs(pct) < 0.05;
  const up = cur > prev;
  const good = invert ? !up : up;
  const tone = flat ? 'bg-mq-chip text-mq-on-tint' : good ? 'bg-mq-ok-bg text-mq-ok-ink' : 'bg-mq-danger-bg text-mq-danger-ink';
  const label = flat ? '0%' : pct === null ? 'new' : `${Math.abs(pct) >= 100 ? Math.round(Math.abs(pct)) : Math.abs(pct).toFixed(1)}%`;
  return (
    <span className={cx('inline-flex items-center gap-0.5 rounded-full px-[7px] py-0.5 text-xs font-semibold tabular-nums', tone, className)}>
      {!flat && <Icon name={up ? 'arrowUp' : 'arrowDown'} size={11} stroke={2.4} />}
      {label}
    </span>
  );
}

/**
 * One KPI tile. `value` is a preformatted string; `foot` sits under it;
 * `visual` is a sparkline / minibars / progress node; `href` makes it drillable.
 */
export default function Kpi({ label, value, foot, badge, visual, href, onClick, tone, big = false, className }) {
  const inner = (
    <>
      <div className="flex items-center gap-2 min-w-0">
        {tone && <span className={cx('w-2 h-2 rounded-full flex-none', tone)} aria-hidden="true" />}
        <span className="text-[12.5px] font-medium text-mq-muted truncate flex-1">{label}</span>
        {badge}
      </div>
      <div
        className={cx('font-mq-mono font-medium tracking-[-.03em] leading-[1.05] text-mq-ink tabular-nums break-words')}
        style={{ fontSize: big ? 'clamp(22px,2.2vw,27px)' : 'clamp(20px,2vw,25px)' }}
      >
        {value}
      </div>
      {visual && <div className="min-h-0">{visual}</div>}
      {foot && <div className="text-xs text-mq-muted leading-snug">{foot}</div>}
    </>
  );
  const cls = cx(
    'flex flex-col gap-2.5 bg-white border border-mq-line rounded-xl px-[17px] py-4 shadow-mq-card min-w-0 text-left',
    (href || onClick) && 'transition-colors hover:border-mq-line-2 hover:bg-mq-cream focus-visible:outline-none focus-visible:shadow-mq-focus',
    className,
  );
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/** 6px progress bar for margin / share. `pct` 0–100. */
export function ProgressBar({ pct = 0, tone = 'bg-mq-primary', className }) {
  const w = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div className={cx('h-1.5 rounded-full bg-mq-chip overflow-hidden', className)}>
      <div className={cx('h-full rounded-full', tone)} style={{ width: `${w}%` }} />
    </div>
  );
}

/** Mini bars: `values` numbers; the last (or `activeIndex`) is solid maroon. */
export function MiniBars({ values = [], activeIndex, height = 38 }) {
  const max = Math.max(1, ...values.map((v) => Number(v) || 0));
  const active = activeIndex ?? values.length - 1;
  return (
    <div className="flex items-end gap-[3px]" style={{ height }} aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className={cx('flex-1 rounded-t-sm', i === active ? 'bg-mq-primary' : 'bg-mq-soft-2')}
          style={{ height: `${Math.max(4, ((Number(v) || 0) / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
