'use client';

import Link from 'next/link';
import { forwardRef } from 'react';
import cx from './cx';
import Icon from './icons';

// Form controls (docs/admin-design-system.md §4). Every field is 16px text (iOS zoom rule).

const FIELD_BASE =
  'bg-white border border-mq-line rounded-lg text-base text-mq-ink placeholder:text-mq-faint outline-none transition-[border-color,box-shadow] ' +
  'focus:border-mq-focus focus:shadow-mq-focus disabled:bg-mq-canvas disabled:text-mq-disabled aria-[invalid=true]:border-mq-danger';

// Full width unless the caller sets a width (w-auto, w-[110px]…). Both classes
// together would let Tailwind's CSS order pick w-full, so a toolbar select
// asked to be w-auto would still take a whole row.
const HAS_WIDTH = /(^|\s)!?w-/;
const width = (className) => (HAS_WIDTH.test(className || '') ? '' : 'w-full');

/** Class for a native <input> (use inside <Field>). `size`: md 40 · lg 42 · xl 46. */
export function inputCls({ size = 'md', mono = false, className = '' } = {}) {
  return cx(FIELD_BASE, width(className), 'px-3',size === 'sm' ? 'h-9' : size === 'lg' ? 'h-[42px]' : size === 'xl' ? 'h-[46px] rounded-[9px]' : 'h-10', mono && 'font-mq-mono tabular-nums', className);
}
export function selectCls({ size = 'md', className = '' } = {}) {
  return cx(inputCls({ size, className }), 'pr-9 appearance-none bg-no-repeat cursor-pointer', "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236E6E68' stroke-width='2.4'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")] bg-[position:right_12px_center]");
}
export const textareaCls = (className = '') => cx(FIELD_BASE, width(className), 'px-3 py-2.5 min-h-[88px] leading-normal resize-y', className);

export const Input = forwardRef(function Input({ size, mono, className, ...rest }, ref) {
  return <input ref={ref} className={inputCls({ size, mono, className })} {...rest} />;
});
Input.fieldControl = true;

export const Select = forwardRef(function Select({ size, className, children, ...rest }, ref) {
  return <select ref={ref} className={selectCls({ size, className })} {...rest}>{children}</select>;
});
Select.fieldControl = true;

export const Textarea = forwardRef(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={textareaCls(className)} {...rest} />;
});
Textarea.fieldControl = true;

/** Search box with icon (+ optional ⌘K hint). */
export function SearchInput({ value, onChange, placeholder = 'Search…', kbd, className, inputRef, ...rest }) {
  return (
    <label className={cx('flex items-center gap-2 h-9 px-[11px] bg-white border border-mq-line rounded-lg focus-within:border-mq-focus focus-within:shadow-mq-focus min-w-0', className)}>
      <span className="text-mq-muted"><Icon name="search" size={15} stroke={1.9} /></span>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 border-0 outline-none bg-transparent text-base text-mq-ink placeholder:text-mq-muted [&::-webkit-search-cancel-button]:hidden"
        {...rest}
      />
      {value ? (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="grid place-items-center w-6 h-6 rounded-md text-mq-muted hover:bg-mq-chip">
          <Icon name="x" size={13} stroke={2.2} />
        </button>
      ) : kbd ? (
        <kbd className="font-mq-mono text-[10.5px] text-mq-muted border border-mq-line rounded-[5px] px-[5px] py-px bg-mq-cream flex-none">{kbd}</kbd>
      ) : null}
    </label>
  );
}

/**
 * Segmented control. options: [{value, label, count?}]. Renders buttons, or
 * links when an option has `href`.
 */
export function Segmented({ options, value, onChange, size = 'md', className, label }) {
  return (
    <div role="group" aria-label={label} className={cx('inline-flex flex-wrap bg-mq-chip border border-mq-line rounded-lg p-[3px] gap-0.5 max-w-full', className)}>
      {options.map((o) => {
        const on = o.value === value;
        const cls = cx(
          'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors',
          size === 'lg' ? 'min-h-[42px] px-4 text-sm' : 'min-h-[30px] px-[13px] text-[13px]',
          on ? 'bg-white text-mq-ink font-semibold shadow-mq-seg' : 'text-mq-on-tint hover:text-mq-ink',
        );
        const body = (
          <>
            {o.label}
            {o.count != null && <span className={cx('font-mq-mono text-[11px] tabular-nums', on ? 'text-mq-primary' : 'text-mq-muted')}>{o.count}</span>}
          </>
        );
        return o.href
          ? <Link key={o.value} href={o.href} className={cls} aria-current={on ? 'page' : undefined}>{body}</Link>
          : <button key={o.value} type="button" className={cls} aria-pressed={on} onClick={() => onChange?.(o.value)}>{body}</button>;
      })}
    </div>
  );
}

/** Underline tabs. tabs: [{value, label, href?, count?}]. */
export function Tabs({ tabs, value, onChange, className, right }) {
  return (
    <div className={cx('flex items-end gap-2 border-b border-mq-line', className)}>
      <div role="tablist" className="flex items-end gap-1 overflow-x-auto flex-1 min-w-0 -mb-px [scrollbar-width:none]">
        {tabs.map((t) => {
          const on = t.value === value;
          const cls = cx(
            'inline-flex items-center gap-1.5 min-h-10 px-3.5 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors',
            on ? 'border-mq-primary text-mq-primary font-semibold' : 'border-transparent text-mq-on-tint font-medium hover:text-mq-ink',
          );
          const body = <>{t.label}{t.count != null && t.count !== 0 && <span className="font-mq-mono text-[11px] font-semibold bg-mq-chip text-mq-chip-ink rounded-full px-1.5">{t.count}</span>}</>;
          return t.href
            ? <Link key={t.value} href={t.href} role="tab" aria-selected={on} className={cls} scroll={false}>{body}</Link>
            : <button key={t.value} type="button" role="tab" aria-selected={on} className={cls} onClick={() => onChange?.(t.value)}>{body}</button>;
        })}
      </div>
      {right && <div className="flex items-center gap-2 pb-1.5 flex-none">{right}</div>}
    </div>
  );
}

/** Switch. Use `label` for the accessible name when there's no visible label. */
export function Toggle({ checked, onChange, disabled, label, className }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cx(
        'relative inline-flex flex-none w-[42px] h-6 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:outline-none focus-visible:shadow-mq-focus',
        checked ? 'bg-mq-primary' : 'bg-mq-line-2',
        className,
      )}
    >
      <span className={cx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-[0_1px_2px_rgba(26,26,24,.2)] transition-transform', checked && 'translate-x-[18px]')} />
    </button>
  );
}

/** A row with a label/description on the left and a toggle on the right. */
export function ToggleRow({ title, desc, checked, onChange, disabled }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-mq-ink">{title}</div>
        {desc && <div className="text-xs text-mq-muted mt-0.5">{desc}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} label={typeof title === 'string' ? title : undefined} />
    </div>
  );
}
