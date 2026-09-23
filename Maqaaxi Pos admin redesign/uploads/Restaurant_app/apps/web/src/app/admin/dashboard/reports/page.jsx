import { redirect } from 'next/navigation';

// The Reports hub opens on the Sales report.
export default function ReportsIndex() {
  redirect('/admin/dashboard/reports/sales');
}
