'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

// Shell bands (docs/admin-design-system.md §11): phone <760 · tablet <900 · narrow <1080 · desktop.
function band(w) {
  if (w < 760) return 'phone';
  if (w < 900) return 'tablet';
  if (w < 1080) return 'narrow';
  return 'desktop';
}
function subscribe(cb) {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
}
/** Current band name — only changes when a threshold is crossed. */
export function useBreakpoint() {
  return useSyncExternalStore(subscribe, () => band(window.innerWidth), () => 'desktop');
}

// Panel widths remembered per viewer (localStorage `mq-panels`). Storage can
// throw or be empty (private mode, blocked site data) — the defaults still work.
const KEY = 'mq-panels';
function readPanels() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
function writePanel(name, w) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...readPanels(), [name]: w })); } catch { /* storage unavailable: width just isn't remembered */ }
}

/**
 * Drag-resizable panel size. `edge` = which side of the panel the handle sits
 * on: 'left'/'right' resize the width (dragging left with 'left' makes it
 * wider), 'top'/'bottom' resize the height (dragging up with 'top' makes it
 * taller). Returns {width, handleProps, reset} — `width` is the size along
 * that axis. `initial: null` = auto (the panel keeps its natural size until
 * someone drags; `measure()` returns the current size to start the drag from).
 */
export function usePanelWidth(name, { initial, min, max, edge = 'left', measure }) {
  const vertical = edge === 'top' || edge === 'bottom';
  const invert = edge === 'left' || edge === 'top';
  const [width, setWidth] = useState(initial);
  const drag = useRef(null);
  const clamp = useCallback((w) => {
    const cap = typeof max === 'function' ? max() : max;
    return Math.round(Math.max(min, Math.min(Math.max(min, cap), w)));
  }, [min, max]);

  useEffect(() => {
    const saved = readPanels()[name];
    // Read once after mount (storage isn't available during SSR).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typeof saved === 'number') setWidth(clamp(saved));
  }, [name, clamp]);

  const pos = (ev) => (vertical ? ev.clientY : ev.clientX);
  const next = (ev) => {
    const d = pos(ev) - drag.current.p;
    return clamp(drag.current.w + (invert ? -d : d));
  };
  const current = () => width ?? measure?.() ?? min;
  const onPointerDown = (e) => {
    e.preventDefault();
    drag.current = { p: pos(e), w: current() };
    const move = (ev) => setWidth(next(ev));
    const up = (ev) => {
      writePanel(name, next(ev));
      drag.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = vertical ? 'row-resize' : 'col-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const reset = () => { setWidth(initial); writePanel(name, initial); };
  const [less, more] = vertical ? ['ArrowDown', 'ArrowUp'] : ['ArrowRight', 'ArrowLeft'];
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 40 : 16;
    if (e.key === less || e.key === more) {
      e.preventDefault();
      // 'more' grows a panel whose handle is on its left/top edge.
      const grow = (e.key === more) === invert;
      const w = clamp(current() + (grow ? step : -step));
      setWidth(w);
      writePanel(name, w);
    }
  };
  return {
    width,
    reset,
    handleProps: {
      role: 'separator',
      'aria-orientation': vertical ? 'horizontal' : 'vertical',
      'aria-label': 'Resize panel',
      'aria-valuenow': width ?? undefined,
      tabIndex: 0,
      onPointerDown,
      onDoubleClick: reset,
      onKeyDown,
    },
  };
}

/** Close on outside click / Escape (popovers, menus). */
export function useDismiss(open, onClose, refs) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (refs.some((r) => r.current && r.current.contains(e.target))) return;
      closeRef.current();
    };
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    // refs are stable ref objects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
