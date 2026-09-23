'use client';

import useAccess from '@/hooks/useAccess';

/**
 * Wraps a Settings page's sections. With Settings › View only (Staff access),
 * one disabled <fieldset> turns every input and button inside into read-only
 * — the API refuses the change anyway, this just doesn't offer it.
 */
export default function SettingsForm({ children }) {
  const { canAct } = useAccess();
  const readOnly = !canAct('settings');
  return (
    <div className="set-wrap">
      {readOnly && (
        <div className="set-ro" role="note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          View only — ask a manager to change these.
        </div>
      )}
      <fieldset className="set-fs" disabled={readOnly}>{children}</fieldset>
    </div>
  );
}
