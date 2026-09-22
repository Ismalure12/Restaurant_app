'use client';

import { forwardRef } from 'react';
import { printMoney, printDate, printTime } from '../printShared';

export const KIND_NAME = {
  sale: 'Sales', invoice_payment: 'Account payments', refund: 'Refunds', adjustment: 'Sale corrections', expense: 'Expenses',
  salary: 'Salaries', transfer: 'Transfers', owner_in: 'Owner put in', owner_out: 'Owner took out', over_short: 'Count differences',
  supplier_payment: 'Supplier payments', opening: 'Opening balance',
};
export const kindName = (k) => KIND_NAME[k] || k.replace(/_/g, ' ');
const acct = (a) => (a.kind === 'cash' ? 'Cash' : a.label);
const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
export { monthLabel };

function Line({ k, v, strong, sub }) {
  return <tr className={`${strong ? 'st-strong' : ''}${sub ? ' st-sub' : ''}`}><td>{k}</td><td className="n">{v}</td></tr>;
}

/**
 * Month statements on an A4 sheet: profit and loss, cash flow, business
 * position. Rendered hidden; the Statements page copies its markup +
 * STATEMENT_CSS into the print iframe (printShared.printHtml).
 */
const StatementDoc = forwardRef(function StatementDoc({ business, month, statement: st, closedAt }, ref) {
  if (!st || st.blocked) return null;
  const p = st.pnl;
  const cf = st.cashFlow;
  const pos = st.position;
  const m = printMoney;
  return (
    <div ref={ref} style={{ display: 'none' }}>
      <div className="st-doc">
        <h1>{business}</h1>
        <h2>Financial statements · {monthLabel(month)}</h2>
        <p className="st-meta">{st.from} to {st.to}{closedAt ? ` · Closed ${printDate(closedAt)} ${printTime(closedAt)}` : ' · Not closed yet (figures are live)'}</p>
        {st.warnings?.length > 0 && <ul className="st-warn">{st.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}

        <h3>Profit and loss</h3>
        <table><tbody>
          <Line k={`Sales (${p.sales.count})`} v={m(p.sales.gross)} />
          <Line k="Less discounts" v={m(-p.sales.discounts)} sub />
          <Line k={`Less refunds (${p.sales.refundCount})`} v={m(-p.sales.refunds)} sub />
          <Line k="Net sales" v={m(p.sales.net)} strong />
          <Line k="Opening stock" v={m(p.openingStock)} sub />
          <Line k="Plus purchases" v={m(p.purchases)} sub />
          <Line k="Less closing stock" v={p.closingStock == null ? 'not counted' : m(-p.closingStock)} sub />
          <Line k="Cost of goods" v={m(p.cogs)} />
          <Line k={`Gross profit${p.foodCostPct != null ? ` (food cost ${p.foodCostPct}%)` : ''}`} v={m(p.grossProfit)} strong />
          <Line k="Operating expenses" v={m(-p.operating.total)} />
          {p.operating.byCategory.map((c) => <Line key={c.category} k={c.category} v={m(c.amount)} sub />)}
          <Line k="Payroll" v={m(-p.payroll)} />
          <Line k="Cash over / short" v={m(p.overShort)} />
          <Line k="Net profit" v={m(p.netProfit)} strong />
        </tbody></table>

        <h3>Cash flow</h3>
        <table className="st-grid">
          <thead><tr><th>Account</th><th className="n">Opening</th><th className="n">In</th><th className="n">Out</th><th className="n">Closing</th></tr></thead>
          <tbody>
            {cf.accounts.map((a) => (
              <tr key={a.accountId}><td>{acct(a)}</td><td className="n">{m(a.opening)}</td><td className="n">{m(a.moneyIn)}</td><td className="n">{m(-a.moneyOut)}</td><td className="n">{m(a.closing)}</td></tr>
            ))}
            <tr className="st-strong"><td>Total</td><td className="n">{m(cf.total.opening)}</td><td className="n">{m(cf.total.moneyIn)}</td><td className="n">{m(-cf.total.moneyOut)}</td><td className="n">{m(cf.total.closing)}</td></tr>
          </tbody>
        </table>

        <h3>Business position</h3>
        <table><tbody>
          <Line k="Business money" v={m(pos.money)} />
          <Line k="Stock value" v={m(pos.stock)} />
          <Line k="Customers owe us" v={m(pos.customersOwe)} />
          <Line k="Suppliers are owed" v={m(-pos.suppliersOwed)} />
          <Line k="Salaries unpaid" v={m(-pos.salariesUnpaid)} />
          <Line k="Net position" v={m(pos.net)} strong />
          {pos.check && <>
            <Line k="Change since last month" v={m(pos.check.change)} sub />
            <Line k="Expected (profit + owner in - owner out)" v={m(pos.check.expected)} sub />
            <Line k="Unexplained" v={m(pos.check.unexplained)} sub />
          </>}
        </tbody></table>
      </div>
    </div>
  );
});

export default StatementDoc;

export const STATEMENT_CSS = `
@page { size: A4; margin: 14mm; }
body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; }
.st-doc { max-width: 180mm; margin: 0 auto; }
.st-doc h1 { font-size: 22px; margin: 0; }
.st-doc h2 { font-size: 15px; margin: 2px 0 0; font-weight: 600; }
.st-doc h3 { font-size: 13px; margin: 20px 0 6px; text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid #111; padding-bottom: 3px; }
.st-meta { color: #555; margin: 4px 0 0; }
.st-warn { margin: 10px 0 0; padding-left: 18px; color: #7a4b00; }
.st-doc table { width: 100%; border-collapse: collapse; }
.st-doc td, .st-doc th { padding: 4px 6px; text-align: left; border-bottom: 1px solid #ddd; }
.st-doc th { font-size: 10.5px; text-transform: uppercase; color: #555; }
.st-doc .n { text-align: right; font-variant-numeric: tabular-nums; }
.st-strong td { font-weight: 700; border-bottom: 1px solid #111; }
.st-sub td:first-child { padding-left: 20px; color: #444; }
h3 { break-after: avoid; }
table { break-inside: avoid; }
`;
