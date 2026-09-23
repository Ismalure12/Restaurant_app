'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReportPrintCss } from '@/components/admin/reports/ReportKit';

const REPORT_TABS = [
  { href: '/admin/dashboard/reports/sales', label: 'Sales' },
  { href: '/admin/dashboard/reports/inventory', label: 'Inventory' },
  { href: '/admin/dashboard/reports/financial', label: 'Financial' },
  { href: '/admin/dashboard/reports/employees', label: 'Employees' },
  { href: '/admin/dashboard/reports/statements', label: 'Statements' },
  { href: '/admin/dashboard/reports/day-closes', label: 'Day closes' },
];

// Reports hub shell: the report tabs, a Suspense boundary for the
// URL-driven filters (useSearchParams), and the A4 print rules (ReportPrintCss,
// only mounted on report pages so they never touch the 80mm receipt's @page).
export default function ReportsLayout({ children }) {
  const pathname = usePathname();
  return (
    <div className="wrap rpt">
      <nav className="rpt-tabs rpt-noprint" aria-label="Reports">
        {REPORT_TABS.map((t) => (
          <Link key={t.href} href={t.href} className={pathname.startsWith(t.href) ? 'on' : ''} aria-current={pathname.startsWith(t.href) ? 'page' : undefined}>{t.label}</Link>
        ))}
      </nav>
      <Suspense fallback={null}>{children}</Suspense>
      <ReportPrintCss />
    </div>
  );
}
