'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import cx from './cx';
import Icon from './icons';
import { IconButton } from './Button';

// Dialog (docs/admin-design-system.md §9). Esc / backdrop close unless `busy`.
const ICON_TILE = {
  danger: 'bg-mq-danger-bg text-mq-danger-ink',
  warn: 'bg-mq-warn-bg text-mq-warn-ink',
  info: 'bg-mq-info-bg text-mq-info-ink',
  ok: 'bg-mq-ok-bg text-mq-ok-ink',
  brand: 'bg-mq-soft text-mq-primary',
};

export default function Modal({
  title, eyebrow, sub, icon, tone = 'brand', onClose, busy = false,
  width = 520, footer, children, className, bodyClassName, labelledBy,
}) {
  const panel = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) closeRef.current?.(); };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    // Focus the first field, else the panel.
    const first = panel.current?.querySelector('input:not([type=hidden]),select,textarea,[data-autofocus]');
    (first || panel.current)?.focus?.();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [busy]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center p-4 bg-[rgba(26,26,24,.45)] backdrop-blur-[3px] font-mq"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : (typeof title === 'string' ? title : undefined)}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={cx('w-full flex flex-col bg-white rounded-2xl shadow-mq-dialog max-h-[calc(100vh-32px)] animate-mq-in motion-reduce:animate-none outline-none text-mq-ink', className)}
        style={{ maxWidth: width }}
      >
        <div className="flex items-start gap-3 px-5 pt-[18px] pb-3.5">
          {icon && (
            <span className={cx('grid place-items-center w-[34px] h-[34px] rounded-[10px] flex-none', ICON_TILE[tone])}>
              <Icon name={icon} size={17} stroke={2} />
            </span>
          )}
          <div className="flex-1 min-w-0">
            {eyebrow && <div className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-mq-muted mb-0.5">{eyebrow}</div>}
            <h2 className="m-0 text-base font-semibold tracking-[-.01em] leading-snug">{title}</h2>
            {sub && <p className="m-0 mt-1 text-[13px] leading-normal text-mq-muted">{sub}</p>}
          </div>
          <IconButton icon="x" label="Close" variant="ghost" size={32} onClick={onClose} disabled={busy} />
        </div>
        <div className={cx('px-5 pb-4 overflow-y-auto min-h-0 flex-1', bodyClassName)}>{children}</div>
        {footer && (
          <div className="flex items-center gap-2 flex-wrap px-5 py-3.5 border-t border-mq-chip">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Spacer for footers: <ModalSpacer /> pushes the following buttons right. */
export function ModalSpacer() {
  return <span className="flex-1" />;
}
