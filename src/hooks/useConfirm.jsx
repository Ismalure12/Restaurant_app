'use client';

import { useState, useCallback } from 'react';

/**
 * useConfirm() — branded replacement for window.confirm.
 *
 * Usage:
 *   const { confirm, dialog } = useConfirm();
 *   const ok = await confirm({ title: 'Delete category?', body: '...' });
 *
 * Render `{dialog}` once inside your component tree.
 */
export default function useConfirm() {
  const [state, setState] = useState(null); // { title, body, confirmLabel, cancelLabel, tone, resolve }

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      setState({
        title: opts.title || 'Are you sure?',
        body: opts.body || '',
        confirmLabel: opts.confirmLabel || 'Confirm',
        cancelLabel: opts.cancelLabel || 'Cancel',
        tone: opts.tone || 'danger', // 'danger' | 'primary'
        resolve,
      });
    });
  }, []);

  const handle = useCallback((value) => {
    state?.resolve?.(value);
    setState(null);
  }, [state]);

  const dialog = state ? (
    <div className="adm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) handle(false); }}>
      <div className="adm-modal" role="dialog" aria-modal="true" style={{ maxWidth: 420 }}>
        <div className="adm-modal-head">
          <h2 className="adm-modal-title">{state.title}</h2>
        </div>
        {state.body && (
          <div className="adm-modal-body">
            <p style={{
              fontFamily: 'var(--font-inter), Inter, sans-serif',
              fontSize: 13.5,
              color: 'var(--ink-2)',
              margin: 0,
              lineHeight: 1.55,
            }}>
              {state.body}
            </p>
          </div>
        )}
        <div className="adm-modal-foot">
          <button type="button" className="adm-btn adm-btn-ghost" onClick={() => handle(false)}>
            {state.cancelLabel}
          </button>
          <button
            type="button"
            className={`adm-btn ${state.tone === 'danger' ? 'adm-btn-danger' : 'adm-btn-primary'}`}
            onClick={() => handle(true)}
            autoFocus
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}
