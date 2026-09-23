'use client';

import { createContext, useContext } from 'react';
import { levelOf } from '@/lib/adminAccess';

// Who is signed in and what their role may do, from GET /api/auth/me — filled
// by the dashboard layout. Pages use it to hide buttons for things the role
// can only view; the API still refuses the request if someone tries anyway.
export const AccessContext = createContext({ role: null, permissions: null });

export default function useAccess() {
  const { role, permissions } = useContext(AccessContext);
  const level = (page) => levelOf(permissions, role, page);
  return {
    role,
    permissions,
    level,
    canView: (page) => level(page) !== 'none',
    canAct: (page) => level(page) === 'act',
  };
}
