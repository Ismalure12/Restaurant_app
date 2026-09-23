'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchJson } from '@/lib/apiError';
import { LineArea } from '@/components/admin/reports/Charts';
import {
  ErrorNote, ExportBar, PeriodPicker, PrintHead, RangeNote, compareLabel, comparisonRange, money, num, useReportParams,
} from '@/components/admin/reports/ReportKit';
import {
  Card, CardHeader, CardTitle, Delta, EmptyState, Kpi, KpiGrid, KpiSkeletons, RowSkeletons, Skeleton, Table, Td, Th, Tr, cx,
} from '@/components/admin/ui';

const API = '/api/admin/reports/financial';
const KINDS = [
  ['stock_purchase', 'Stock purchases', 'Inventory bought (cost of goods)'],
  ['operating', 'Operating expenses', 'Rent, gas, power and the rest'],
  ['payroll', 'Payroll', 'Salaries paid'],
];

/**
 * Profit & loss only, split by what the money went on (stock, operating,
 * payroll), against the comparison period. Sales by account live in the Sales
 * report, expenses by category on the Expenses page, what customers owe under
 * Customers › Owing, cost of goods (needs a stock count) on the month Statements.
 */
export default function FinancialReportPage() {
  const { preset, range, set, query } = useReportParams('30d');
  const { data: r, isLoading, isError, error } = useQuery({ queryKey: ['rpt-financial', query], queryFn: () => fetchJson(`${API}?${query}`) });
  const cmp = comparisonRange(preset, range);
  const cmpQuery = new URLSearchParams({ from: cmp.from, to: cmp.to }).toString();
  const prev = useQuery({ queryKey: ['rpt-financial', cmpQuery], queryFn: () => fetchJson(`${API}?${cmpQuery}`) });
  const p = r?.pnl;
  const pp = prev.data?.pnl;
  const vs = compareLabel(preset);
  const oneDay = range.from === range.to;
  const csv = (table) => `${API}?${query}&format=csv&table=${table}`;
  const exports = [
    { label: 'Profit & loss', href: csv('pnl') },
    { label: 'Days at a loss', href: csv('days') },
  ];
  const kind = (x, k) => x?.expensesByKind?.[k] ?? 0;

  return (
    <>
      <div className="flex items-center gap-2.5 flex-wrap rpt-noprint">
        <PeriodPicker preset={preset} range={range} set={set} />
        <span className="flex-1" />
        <RangeNote preset={preset} range={range} />
        <ExportBar exports={exports} />
      </div>
      <PrintHead title="Financial report" range={range} preset={preset} />
      {isError && <ErrorNote error={error} />}

      {isLoading ? <KpiSkeletons count={3} min={180} /> : p && (
        <KpiGrid min={180}>
          <Kpi
            label="Revenue" value={money(p.totalSales)}
            badge={pp && <Delta value={p.totalSales} previous={pp.totalSales} />}
            foot={`net sales · ${num(p.orders)} ${p.orders === 1 ? 'sale' : 'sales'}${pp ? ` · ${vs} ${money(pp.totalSales)}` : ''}`}
          />
          <Kpi
            label="Expenses" value={money(p.expenses)}
            badge={pp && <Delta value={p.expenses} previous={pp.expenses} invert />}
            foot={`${num(p.expenseCount)} entries · stock, operating & payroll`}
            href="/admin/dashboard/expenses"
          />
          <Kpi
            label="Net profit" value={money(p.netProfit)}
            badge={pp && <Delta value={p.netProfit} previous={pp.netProfit} />}
            foot={p.margin != null ? `${p.margin}% margin` : 'no sales'}
          />
        </KpiGrid>
      )}

      <Card className="overflow-hidden">
        <CardHeader
          eyebrow="Profit & loss"
          title="What the period earned, by kind of cost"
          actions={<Link href="/admin/dashboard/reports/statements" className="rpt-noprint text-[12.5px] font-semibold text-mq-cta hover:text-mq-primary">Cost of goods is on the month Statements →</Link>}
        />
        {isLoading ? <RowSkeletons rows={6} /> : p && (
          <Table minW={420} label="Profit and loss">
            <thead><tr><Th>Line</Th><Th align="right">This period</Th><Th align="right">Previous</Th></tr></thead>
            <tbody>
              <PnlRow strong k="Net sales" v={money(p.totalSales)} pv={pp && money(pp.totalSales)} />
              <PnlRow sub k="Paid (till + online)" v={money(p.paidSales)} pv={pp && money(pp.paidSales)} />
              <PnlRow sub k="Billed on account" v={money(p.billedOnAccount)} pv={pp && money(pp.billedOnAccount)} />
              {p.taxRate > 0 && <PnlRow sub k={`Tax included in sales (${p.taxRate}%)`} v={money(p.includedTax)} pv={pp && money(pp.includedTax)} />}
              {KINDS.map(([k, label, hint]) => (
                <PnlRow key={k} k={<>{label}<span className="block text-xs text-mq-muted">{hint}</span></>} v={`−${money(kind(p, k))}`} pv={pp && `−${money(kind(pp, k))}`} />
              ))}
              <PnlRow sub k={<Link href="/admin/dashboard/expenses" className="rpt-noprint font-semibold text-mq-cta hover:text-mq-primary">See each expense →</Link>} v="" pv="" />
              <PnlRow net k="Net profit" v={money(p.netProfit)} pv={pp && money(pp.netProfit)} negative={p.netProfit < 0} />
            </tbody>
          </Table>
        )}
        {!isLoading && p && <p className="m-0 px-4 py-2.5 border-t border-mq-chip text-xs text-mq-on-tint">Previous = {vs.replace(/^vs /, '')} ({cmp.from} → {cmp.to}). Prices include tax; it is shown, never added.</p>}
      </Card>

      {!oneDay && (
        <Card pad className="flex flex-col gap-3.5">
          <CardTitle title="Sales vs expenses" sub="Per day across the period" />
          {isLoading ? <Skeleton className="h-[200px]" /> : (
            <LineArea
              rows={r?.byDay || []}
              series={[{ key: 'sales', label: 'Sales', area: true }, { key: 'expenses', label: 'Expenses', color: '#B06A00' }]}
              fmt={money}
            />
          )}
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader eyebrow="Days at a loss" title="Expenses beat sales" count={isLoading ? null : r?.lossDays?.length || 0} />
        {isLoading ? <RowSkeletons rows={3} /> : !r?.lossDays?.length ? <EmptyState icon="reports" title="No days at a loss">Every day in this range made more than it spent.</EmptyState> : (
          <Table maxH={420} minW={440} label="Days at a loss">
            <thead><tr><Th>Date</Th><Th align="right">Sales</Th><Th align="right">Expenses</Th><Th align="right">Loss</Th></tr></thead>
            <tbody>{r.lossDays.map((d) => (
              <Tr key={d.day} tone="danger">
                <Td mono>{d.day}</Td><Td money>{money(d.sales)}</Td><Td money>{money(d.expenses)}</Td>
                <Td money className="!text-mq-danger-ink">{money(d.net)}</Td>
              </Tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

/** One P&L line: `strong` (cream subtotal), `sub` (indented detail) or `net` (the bottom line). */
function PnlRow({ k, v, pv, strong, sub, net, negative }) {
  const cell = cx(
    'px-4 py-[9px] border-b border-mq-chip',
    strong && 'bg-mq-cream font-bold text-mq-ink',
    sub && 'text-[13px] text-mq-on-tint',
    net && 'border-t-2 border-t-mq-ink font-bold text-[15px] text-mq-ink',
  );
  const num$ = 'text-right font-mq-mono tabular-nums whitespace-nowrap';
  return (
    <tr>
      <td className={cx(cell, sub && 'pl-[30px]')}>{k}</td>
      <td className={cx(cell, num$, net && (negative ? 'text-mq-danger-ink' : 'text-mq-ok-ink'))}>{v}</td>
      <td className={cx(cell, num$, !net && !strong && 'text-mq-muted')}>{pv ?? '—'}</td>
    </tr>
  );
}
