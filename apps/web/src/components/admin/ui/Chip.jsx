import cx from './cx';
import Icon from './icons';

// Status channel (docs/admin-design-system.md §1, §5). Brand maroon is never a status.
export const TONE = {
  ok: 'bg-mq-ok-bg text-mq-ok-ink border-mq-ok-line',
  warn: 'bg-mq-warn-bg text-mq-warn-ink border-mq-warn-line',
  danger: 'bg-mq-danger-bg text-mq-danger-ink border-mq-danger-line',
  info: 'bg-mq-info-bg text-mq-info-ink border-mq-info-line',
  off: 'bg-mq-chip text-mq-chip-ink border-transparent',
  plain: 'bg-white text-mq-muted border-mq-line',
  brand: 'bg-mq-soft text-mq-primary border-mq-soft-line',
};
export const DOT = {
  ok: 'bg-mq-ok', warn: 'bg-mq-warn', danger: 'bg-mq-danger', info: 'bg-mq-info',
  off: 'bg-mq-faint', plain: 'bg-mq-faint', brand: 'bg-mq-primary',
};
/** 3px left rule on rows / cards. */
export const RULE = {
  ok: 'shadow-[inset_3px_0_0_#0E7C5A]', warn: 'shadow-[inset_3px_0_0_#B06A00]',
  danger: 'shadow-[inset_3px_0_0_#C8321F]', info: 'shadow-[inset_3px_0_0_#1F6FB2]',
  off: 'shadow-[inset_3px_0_0_#D5D5CE]',
};

export function Dot({ tone = 'off', pulse, className }) {
  return <span className={cx('inline-block w-1.5 h-1.5 rounded-full flex-none', DOT[tone], pulse && 'animate-mq-pulse motion-reduce:animate-none', className)} aria-hidden="true" />;
}

/** Status pill with a dot. `small` = the table size. */
export default function Chip({ tone = 'off', dot = true, pulse, small, strike, className, children, title }) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap',
        small ? 'text-[11.5px] px-[9px] py-0.5' : 'text-xs px-2.5 py-[3px]',
        TONE[tone], className,
      )}
    >
      {dot && <Dot tone={tone} pulse={pulse} />}
      <span className={strike ? 'line-through' : undefined}>{children}</span>
    </span>
  );
}

/** Removable filter chip (maroon soft). */
export function FilterChip({ children, onRemove, label = 'Remove filter' }) {
  return (
    <span className="inline-flex items-center gap-1 h-[30px] pl-3 pr-1 rounded-full border border-mq-soft-line bg-mq-soft text-mq-primary text-[12.5px] font-semibold">
      {children}
      <button type="button" onClick={onRemove} aria-label={label} className="grid place-items-center w-6 h-6 rounded-full hover:bg-mq-soft-2">
        <Icon name="x" size={12} stroke={2.4} />
      </button>
    </span>
  );
}

/** Selectable chip (category chips, reason presets). */
export function ChoiceChip({ active, onClick, children, size = 'md', className, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap transition-colors',
        size === 'sm' ? 'h-8 px-3 text-[12.5px]' : 'h-10 px-4 text-[13.5px]',
        active ? 'bg-mq-primary border-mq-primary text-white' : 'bg-white border-mq-line text-mq-body hover:border-mq-line-2 hover:bg-mq-canvas',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
