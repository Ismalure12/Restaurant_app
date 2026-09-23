'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useAccess from '@/hooks/useAccess';
import { RowsSkeleton } from '@/components/admin/Skeletons';

// Settings is four pages (sidebar dropdown): General · Money · Staff access ·
// Audit log. Old links to /settings land on the first one this role can open.
export default function SettingsIndex() {
  const router = useRouter();
  const { role, canView } = useAccess();
  useEffect(() => {
    if (!role) return;
    router.replace(`/admin/dashboard/settings/${canView('settings') ? 'general' : 'access'}`);
  }, [role, canView, router]);
  return <RowsSkeleton rows={3} height={80} />;
}
