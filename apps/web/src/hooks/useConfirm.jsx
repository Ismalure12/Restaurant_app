'use client';

import { useState, useCallback } from 'react';
import Modal, { ModalSpacer } from '@/components/admin/ui/Modal';
import Button from '@/components/admin/ui/Button';

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

  const danger = state?.tone === 'danger';
  const dialog = state ? (
    <Modal
      title={state.title}
      icon={danger ? 'alert' : 'info'}
      tone={danger ? 'danger' : 'brand'}
      width={440}
      onClose={() => handle(false)}
      footer={(
        <>
          <ModalSpacer />
          <Button variant="secondary" size="lg" onClick={() => handle(false)}>{state.cancelLabel}</Button>
          <Button variant={danger ? 'danger' : 'primary'} size="lg" onClick={() => handle(true)} data-autofocus>{state.confirmLabel}</Button>
        </>
      )}
    >
      {state.body && <p className="m-0 text-sm leading-relaxed text-mq-body">{state.body}</p>}
    </Modal>
  ) : null;

  return { confirm, dialog };
}
