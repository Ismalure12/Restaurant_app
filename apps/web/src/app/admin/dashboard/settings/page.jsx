'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useAccess from '@/hooks/useAccess';
import { RowSkeletons } from '@/components/admin/ui';

// Settings has four sections (General · Money · Staff access · Audit log), each
// with its own URL. Old links to /settings land on the first one this role can open.
export default function SettingsIndex() {
  const router = useRouter();
  const { role, canView } = useAccess();
  useEffect(() => {
    if (!role) return;
    router.replace(`/admin/dashboard/settings/${canView('settings') ? 'general' : 'access'}`);
  }, [role, canView, router]);
  return <RowSkeletons rows={3} />;
}
