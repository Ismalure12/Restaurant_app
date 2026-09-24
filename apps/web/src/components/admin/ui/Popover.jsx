'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import cx from './cx';
import { useDismiss } from './layoutHooks';

/**
 * Anchored popover. `trigger` is a render fn ({open, toggle, ref}) → node.
 * Controlled via `open`/`onOpenChange`, or uncontrolled. `align` is the
 * preferred side; if the panel would run off the screen it is nudged back
 * inside (12px margin) — a trigger near the right edge with align="left"
 * used to push a filter panel off the page.
 */
const EDGE = 12;
export default function Popover({ trigger, children, align = 'left', width = 220, open: openProp, onOpenChange, className, panelClassName }) {
  const [own, setOwn] = useState(false);
  const open = openProp ?? own;
  const setOpen = (v) => { if (openProp === undefined) setOwn(v); onOpenChange?.(v); };
  const wrap = useRef(null);
  const panel = useRef(null);
  const [shift, setShift] = useState(0);
  useDismiss(open, () => setOpen(false), [wrap]);

  // Measure after the panel is laid out (before paint) and keep it on screen.
  useLayoutEffect(() => {
    if (!open || !panel.current) { setShift(0); return; }
    const r = panel.current.getBoundingClientRect();
    const base = r.left - shift; // position without our own nudge
    const vw = document.documentElement.clientWidth;
    let dx = 0;
    if (base + r.width > vw - EDGE) dx = vw - EDGE - (base + r.width);
    if (base + dx < EDGE) dx = EDGE - base;
    if (dx !== shift) setShift(dx);
    // shift is read, not a trigger: re-measure only when opening/resizing width.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, width]);

  return (
    <div ref={wrap} className={cx('relative inline-flex', className)}>
      {trigger({ open, toggle: () => setOpen(!open), close: () => setOpen(false) })}
      {open && (
        <div
          ref={panel}
          className={cx(
            'absolute top-[calc(100%+6px)] z-40 bg-white border border-mq-line rounded-xl shadow-mq-lg p-1.5 animate-mq-in motion-reduce:animate-none max-w-[calc(100vw-24px)]',
            align === 'right' ? 'right-0' : 'left-0',
            panelClassName,
          )}
          // `translate`, not `transform`: the open animation animates transform and
          // would cancel the nudge.
          style={{ width, translate: shift ? `${Math.round(shift)}px 0` : undefined }}
        >
          {typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}
        </div>
      )}
    </div>
  );
}

/** Menu row inside a popover. */
export function MenuItem({ active, onClick, children, hint, danger, href, as: Tag = 'button' }) {
  const cls = cx(
    'w-full flex items-center justify-between gap-3 min-h-9 px-2.5 py-2 rounded-lg text-left text-[13.5px] transition-colors',
    active ? 'bg-mq-soft text-mq-primary font-semibold' : danger ? 'text-mq-danger-ink hover:bg-mq-danger-bg' : 'text-mq-ink hover:bg-mq-canvas',
  );
  if (href) {
    return <a href={href} className={cls}>{children}{hint && <span className="text-[11.5px] text-mq-muted font-medium">{hint}</span>}</a>;
  }
  return (
    <Tag type="button" onClick={onClick} className={cls}>
      <span className="min-w-0 truncate">{children}</span>
      {hint && <span className="text-[11.5px] text-mq-muted font-medium flex-none">{hint}</span>}
    </Tag>
  );
}

export function MenuDivider() {
  return <span className="block h-px bg-mq-chip my-1 mx-0.5" />;
}
