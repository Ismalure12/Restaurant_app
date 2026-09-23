'use client';

import UiModal from '@/components/admin/ui/Modal';

/**
 * Older dialog API (title, eyebrow, onClose, busy, wide) on the design-system
 * dialog. Pass `footer` for the button row. New code imports
 * `@/components/admin/ui` Modal directly.
 */
export default function Modal({ title, eyebrow, onClose, busy, wide, footer, sub, icon, tone, children }) {
  return (
    <UiModal title={title} eyebrow={eyebrow} sub={sub} icon={icon} tone={tone} onClose={onClose} busy={busy} width={wide ? 760 : 520} footer={footer}>
      {children}
    </UiModal>
  );
}
