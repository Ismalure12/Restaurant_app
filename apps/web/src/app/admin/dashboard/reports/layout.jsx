'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { Page, Tabs } from '@/components/admin/ui';
import { ReportPrintCss } from '@/components/admin/reports/ReportKit';

const BASE = '/admin/dashboard/reports';
const REPORT_TABS = [
  { value: 'sales', label: 'Sales' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'financial', label: 'Financial' },
  { value: 'employees', label: 'Employees' },
  { value: 'statements', label: 'Statements' },
  { value: 'day-closes', label: 'Day closes' },
].map((t) => ({ ...t, href: `${BASE}/${t.value}` }));

// Reports hub shell: the report tabs, a Suspense boundary for the
// URL-driven filters (useSearchParams), and the A4 print rules (ReportPrintCss,
// only mounted on report pages so they never touch the 80mm receipt's @page).
// The page title lives in the topbar; PrintHead prints each report's name.
export default function ReportsLayout({ children }) {
  const pathname = usePathname();
  const active = REPORT_TABS.find((t) => pathname.startsWith(t.href))?.value;
  return (
    <Page>
      <nav aria-label="Reports" className="rpt-noprint">
        <Tabs tabs={REPORT_TABS} value={active} />
      </nav>
      <Suspense fallback={null}>{children}</Suspense>
      <ReportPrintCss />
    </Page>
  );
}
