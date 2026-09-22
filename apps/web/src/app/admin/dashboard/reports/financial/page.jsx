'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { fetchJson } from '@/lib/apiError';
import { LineArea } from '@/components/admin/reports/Charts';
import { KpiRowSkeleton, RowsSkeleton } from '@/components/admin/Skeletons';
import {
  Card, Empty, ErrorNote, Kpi, PrintHead, RangePicker, Toolbar, money, num, useReportParams,
} from '@/components/admin/reports/ReportKit';

const API = '/api/admin/reports/financial';

/**
 * Profit & loss only. Sales by account live in the Sales report, expenses by
 * category on the Expenses page, what customers owe under Customers › Owing.
 */
export default function FinancialReportPage() {
  const { preset, range, set, query } = useReportParams('30d');
  const { data: r, isLoading, isError, error } = useQuery({ queryKey: ['rpt-financial', query], queryFn: () => fetchJson(`${API}?${query}`) });
  const p = r?.pnl;
  const oneDay = range.from === range.to;
  const csv = (table) => `${API}?${query}&format=csv&table=${table}`;
  const exports = [
    { label: 'Profit & loss', href: csv('pnl') },
    { label: 'Days at a loss', href: csv('days') },
  ];

  return (
    <>
      <Toolbar exports={exports}>
        <RangePicker preset={preset} range={range} set={set} />
      </Toolbar>
      <PrintHead title="Financial report" range={range} preset={preset} />
      {isError && <ErrorNote error={error} />}

      {isLoading ? <KpiRowSkeleton count={3} style={{ marginBottom: 16 }} /> : p && (
        <div className="kpi-row rpt-kpis">
          <Kpi label="Sales" tone="green" value={money(p.totalSales)} foot={`${num(p.orders)} sales`} />
          <Kpi label="Expenses" tone="amber" value={money(p.expenses)} foot={`${num(p.expenseCount)} entries · salaries & stock included`} />
          <Kpi label="Net profit" tone={p.netProfit >= 0 ? 'green' : 'rose'} value={money(p.netProfit)} foot={p.margin != null ? `${p.margin}% margin` : 'no sales'} />
        </div>
      )}

      <Card eyebrow="Profit & loss" title="Where the profit comes from">
        {isLoading ? <RowsSkeleton rows={6} /> : p && (
          <table className="table rpt-pnl">
            <tbody>
              <tr><td>Sales paid (till + online)</td><td className="num">{money(p.paidSales)}</td></tr>
              <tr><td>Sales billed on account</td><td className="num">{money(p.billedOnAccount)}</td></tr>
              <tr className="strong"><td>Total sales</td><td className="num">{money(p.totalSales)}</td></tr>
              {p.taxRate > 0 && <tr><td className="sub">Tax included in sales ({p.taxRate}%)</td><td className="num sub">{money(p.includedTax)}</td></tr>}
              <tr>
                <td>Expenses <Link className="rpt-noprint" href="/admin/dashboard/expenses">see each one →</Link></td>
                <td className="num">−{money(p.expenses)}</td>
              </tr>
              <tr className="strong rpt-net"><td>Net profit</td><td className="num">{money(p.netProfit)}</td></tr>
            </tbody>
          </table>
        )}
      </Card>

      {!oneDay && (
        <Card eyebrow="Trend" title="Sales vs expenses">
          {isLoading ? <RowsSkeleton rows={3} /> : (
            <LineArea
              rows={r?.byDay || []}
              series={[{ key: 'sales', label: 'Sales', area: true }, { key: 'expenses', label: 'Expenses', color: 'var(--amber)' }]}
              fmt={money}
            />
          )}
        </Card>
      )}

      <Card flush title="Days at a loss">
        {isLoading ? <RowsSkeleton className="card-pad" rows={3} /> : !r?.lossDays?.length ? <Empty>No days at a loss in this range</Empty> : (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Date</th><th className="num">Sales</th><th className="num">Expenses</th><th className="num">Loss</th></tr></thead>
              <tbody>{r.lossDays.map((d) => (
                <tr key={d.day}><td>{d.day}</td><td className="num">{money(d.sales)}</td><td className="num">{money(d.expenses)}</td><td className="num" style={{ color: 'var(--rose)' }}>{money(d.net)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
