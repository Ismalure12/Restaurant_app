'use client';

import useAccess from '@/hooks/useAccess';

/**
 * Renders its children only when the signed-in role may change `page`
 * (Settings › Staff access → Act). For "New …" / "Add …" buttons on pages a
 * role can only view; the API refuses the write either way.
 */
export default function IfCan({ page, level = 'act', children }) {
  const { canAct, canView } = useAccess();
  return (level === 'act' ? canAct(page) : canView(page)) ? children : null;
}
