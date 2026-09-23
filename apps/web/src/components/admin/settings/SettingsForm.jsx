'use client';

import useAccess from '@/hooks/useAccess';
import { Alert } from '@/components/admin/ui';

/**
 * Wraps a Settings section's cards. With Settings › View only (Staff access),
 * one disabled <fieldset> turns every input and button inside into read-only
 * — the API refuses the change anyway, this just doesn't offer it.
 */
export default function SettingsForm({ children }) {
  const { canAct } = useAccess();
  const readOnly = !canAct('settings');
  return (
    <div className="flex flex-col gap-3.5 min-w-0">
      {readOnly && <Alert tone="info" icon="lock" role="note" title="View only">Ask a manager to change these.</Alert>}
      <fieldset className="m-0 p-0 border-0 min-w-0 flex flex-col gap-3.5" disabled={readOnly}>{children}</fieldset>
    </div>
  );
}

/** Same rule, for sections that need it in code (to disable a portalled control). */
export function useSettingsReadOnly() {
  const { canAct } = useAccess();
  return !canAct('settings');
}
