'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import cx from './cx';
import { IconButton } from './Button';
import { useBreakpoint, usePanelWidth } from './layoutHooks';

// Right detail drawer (docs/admin-design-system.md §9): a resizable side panel
// on ≥900px, a full-screen sheet below. Rendered in a portal, fixed to the
// right edge, so it works from any page without changing the page layout.

export default function Drawer({ open, onClose, eyebrow, title, footer, children, name = 'drawer' }) {
  const bp = useBreakpoint();
  const side = bp === 'desktop' || bp === 'narrow';
  const { width, handleProps } = usePanelWidth(name, {
    initial: 380, min: 320, max: () => Math.max(320, Math.min(760, window.innerWidth - 520)), edge: 'left',
  });
  const panel = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!open) return undefined;
    // A dialog opened over the drawer (a form, a confirm) owns Escape.
    const onKey = (e) => {
      if (e.key !== 'Escape' || document.querySelector('[aria-modal="true"]:not([data-drawer])')) return;
      closeRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <>
      {side && <div className="fixed inset-0 z-[55]" onMouseDown={() => onClose?.()} aria-hidden="true" />}
      <aside
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal={!side}
        data-drawer
        aria-label={typeof title === 'string' ? title : 'Details'}
        className={cx(
          'fixed z-[60] flex flex-col bg-white font-mq text-mq-ink outline-none animate-mq-slide motion-reduce:animate-none',
          side ? 'top-0 right-0 h-screen border-l border-mq-line shadow-mq-drawer' : 'inset-0',
        )}
        style={side ? { width } : undefined}
      >
        {side && (
          <div
            {...handleProps}
            className="absolute left-0 top-0 bottom-0 w-2.5 -translate-x-1/2 cursor-col-resize grid place-items-center group focus-visible:outline-none"
          >
            <span className="w-1 h-9 rounded-full bg-[#D5D5CF] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" />
          </div>
        )}
        <div className="flex items-start gap-3 px-4 py-3.5 border-b border-mq-line">
          <div className="flex-1 min-w-0">
            {eyebrow && <div className="font-mq-mono text-[11.5px] text-mq-muted truncate">{eyebrow}</div>}
            <div className="text-base font-semibold truncate">{title}</div>
          </div>
          <IconButton icon="x" label="Close" variant="ghost" size={32} onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
        {footer && <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-t border-mq-line">{footer}</div>}
      </aside>
    </>,
    document.body,
  );
}
