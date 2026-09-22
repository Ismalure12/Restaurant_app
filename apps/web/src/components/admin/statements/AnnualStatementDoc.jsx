'use client';

import { forwardRef } from 'react';
import { printMoney, printDate, printTime } from '../printShared';
import { STATEMENT_CSS, monthLabel } from './StatementDoc';

const acct = (a) => (a.kind === 'cash' ? 'Cash' : a.label);
const short = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short' });

function Line({ k, v, strong, sub }) {
  return <tr className={`${strong ? 'st-strong' : ''}${sub ? ' st-sub' : ''}`}><td>{k}</td><td className="n">{v}</td></tr>;
}

/**
 * Annual statements on an A4 sheet: profit and loss with a column per month,
 * cash flow, position at year end and the owner summary. Rendered hidden; the
 * Statements page copies its markup + ANNUAL_CSS into the print iframe.
 */
const AnnualStatementDoc = forwardRef(function AnnualStatementDoc({ business, year, statement: st, closedAt }, ref) {
  if (!st) return null;
  const p = st.pnl;
  const cf = st.cashFlow;
  const pos = st.position;
  const ow = st.owner;
  const m = printMoney;
  const rows = [
    ['Net sales', 'net'], ['Cost of goods', 'cogs', true], ['Gross profit', 'grossProfit'], ['Operating expenses', 'operating', true],
    ['Payroll', 'payroll', true], ['Over / short', 'overShort'], ['Net profit', 'netProfit'],
  ];
  const strongKeys = new Set(['grossProfit', 'netProfit']);
  const total = { net: p.sales.net, cogs: p.cogs, grossProfit: p.grossProfit, operating: p.operating.total, payroll: p.payroll, overShort: p.overShort, netProfit: p.netProfit };
  return (
    <div ref={ref} style={{ display: 'none' }}>
      <div className="st-doc">
        <h1>{business}</h1>
        <h2>Annual financial statements · {year}</h2>
        <p className="st-meta">{st.from} to {st.to}{closedAt ? ` · Closed ${printDate(closedAt)} ${printTime(closedAt)}` : ' · Not closed yet (figures are live)'}</p>

        <h3>Profit and loss by month</h3>
        <table className="st-grid st-months">
          <thead><tr><th></th>{st.months.map((x) => <th key={x.month} className="n">{short(x.month)}</th>)}<th className="n">Total</th></tr></thead>
          <tbody>
            {rows.map(([label, key, neg]) => (
              <tr key={key} className={strongKeys.has(key) ? 'st-strong' : ''}>
                <td>{label}</td>
                {st.months.map((x) => <td key={x.month} className="n">{m(neg ? -x[key] : x[key])}</td>)}
                <td className="n">{m(neg ? -total[key] : total[key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="st-meta">Food cost {p.foodCostPct != null ? `${p.foodCostPct}%` : 'not available (no closing stock count)'} · Discounts {m(p.sales.discounts)} · Refunds {m(p.sales.refunds)} · {p.sales.count} sales</p>

        <h3>Operating expenses by category</h3>
        <table><tbody>
          {p.operating.byCategory.map((c) => <Line key={c.category} k={c.category} v={m(c.amount)} />)}
          <Line k="Total operating expenses" v={m(p.operating.total)} strong />
        </tbody></table>

        <h3>Cash flow for the year</h3>
        <table className="st-grid">
          <thead><tr><th>Account</th><th className="n">Opening</th><th className="n">In</th><th className="n">Out</th><th className="n">Closing</th></tr></thead>
          <tbody>
            {cf.accounts.map((a) => (
              <tr key={a.accountId}><td>{acct(a)}</td><td className="n">{m(a.opening)}</td><td className="n">{m(a.moneyIn)}</td><td className="n">{m(-a.moneyOut)}</td><td className="n">{m(a.closing)}</td></tr>
            ))}
            <tr className="st-strong"><td>Total</td><td className="n">{m(cf.total.opening)}</td><td className="n">{m(cf.total.moneyIn)}</td><td className="n">{m(-cf.total.moneyOut)}</td><td className="n">{m(cf.total.closing)}</td></tr>
          </tbody>
        </table>

        <h3>Business position at year end</h3>
        <table><tbody>
          <Line k="Business money" v={m(pos.end.money)} />
          <Line k="Stock value" v={m(pos.end.stock)} />
          <Line k="Customers owe us" v={m(pos.end.customersOwe)} />
          <Line k="Suppliers are owed" v={m(-pos.end.suppliersOwed)} />
          <Line k="Salaries unpaid" v={m(-pos.end.salariesUnpaid)} />
          <Line k="Net position" v={m(pos.end.net)} strong />
          {pos.startNet != null && <Line k="Net position at start of year" v={m(pos.startNet)} sub />}
        </tbody></table>

        <h3>Owner summary</h3>
        <table><tbody>
          <Line k="Profit for the year" v={m(ow.profit)} />
          <Line k="Owner put in" v={m(ow.ownerIn)} sub />
          <Line k="Owner took out" v={m(-ow.ownerOut)} sub />
          <Line k="Result carried forward" v={m(ow.carriedForward)} strong />
        </tbody></table>
      </div>
    </div>
  );
});

export default AnnualStatementDoc;
export { monthLabel };

export const ANNUAL_CSS = `${STATEMENT_CSS}
@page { size: A4 landscape; margin: 12mm; }
.st-doc { max-width: none; }
.st-months th, .st-months td { font-size: 10px; padding: 3px 4px; white-space: nowrap; }
`;
