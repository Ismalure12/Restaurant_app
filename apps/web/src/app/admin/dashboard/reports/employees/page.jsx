'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';
import {
  Card, ErrorNote, FilterSelect, Kpi, PrintHead, RangePicker, Toolbar, labelOf, money, num, useReportParams,
} from '@/components/admin/reports/ReportKit';

const API = '/api/admin/reports/employees';
const ROLES = [
  { value: 'cashier', label: 'Cashiers' }, { value: 'waiter', label: 'Waiters' },
  { value: 'manager', label: 'Managers' }, { value: 'admin', label: 'Admins' },
];

export default function EmployeesReportPage() {
  const { preset, range, filters, set, query } = useReportParams('30d', ['role']);
  const { data: r, isLoading, isError, error } = useQuery({ queryKey: ['rpt-employees', query], queryFn: () => fetchJson(`${API}?${query}`) });
  const s = r?.summary;
  const rangeQs = new URLSearchParams({ preset, ...(preset === 'custom' ? range : {}) }).toString();

  return (
    <>
      <Toolbar exports={[{ label: 'Staff table', href: `${API}?${query}&format=csv` }]}>
        <RangePicker preset={preset} range={range} set={set} />
        <FilterSelect label="Role" value={filters.role} options={ROLES} onChange={(v) => set({ role: v })} />
      </Toolbar>
      <PrintHead title="Employee report" range={range} preset={preset} filters={{ Role: labelOf('role', filters.role) }} />
      {isError && <ErrorNote error={error} />}

      {isLoading ? <KpiRowSkeleton count={3} style={{ marginBottom: 16 }} /> : s && (
        <div className="kpi-row rpt-kpis">
          <Kpi label="Staff" value={num(s.staff)} foot="with activity or active" />
          <Kpi label="Sales rung up" tone="green" value={money(s.salesTaken)} foot="by cashiers & managers" />
          <Kpi label="Voids" tone="rose" value={num(s.voids)} foot={`${money(s.discounts)} discounts given`} />
        </div>
      )}

      <Card flush title="Per person">
        {isLoading ? <RowsSkeleton className="card-pad" /> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr>
                <th>Name</th><th>Role</th><th className="num">Rang up</th><th className="num">Avg ticket</th><th className="num">Served</th>
                <th className="num">Discounts</th><th className="num">Voids</th><th className="num">Edits</th>
              </tr></thead>
              <tbody>
                {!r?.rows.length ? <tr><td colSpan={8} className="td-empty">No staff activity in this range</td></tr> : r.rows.map((e) => (
                  <tr key={e.id}>
                    <td className="strong"><Link href={`/admin/dashboard/reports/employees/${e.id}?${rangeQs}`}>{e.name}</Link>{!e.isActive && <div className="sub">inactive</div>}</td>
                    <td style={{ textTransform: 'capitalize' }}>{e.role}</td>
                    <td className="num">{money(e.taken.total)}<div className="sub">{num(e.taken.orders)} orders</div></td>
                    <td className="num">{e.taken.orders ? money(e.taken.avgTicket) : '—'}</td>
                    <td className="num">{e.served.orders ? money(e.served.total) : '—'}{e.served.orders ? <div className="sub">{num(e.served.orders)} orders</div> : null}</td>
                    <td className="num">{e.discounts ? money(e.discounts) : '—'}</td>
                    <td className="num">{e.voids.count ? `${e.voids.count} · ${money(e.voids.total)}` : '—'}</td>
                    <td className="num">{e.edits || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
