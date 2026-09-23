'use client';

import { forwardRef } from 'react';
import { useIsClient, useBusiness, printDate } from './printShared';
import { useWallets, payToAccounts, PayToRow } from './ReceiptDoc';

/**
 * A customer's statement on the 80mm roll (same look and type as the receipt):
 * one compact block per invoice — number, date, items, total, paid, balance —
 * then what is owed in all, and where to pay.
 *
 * data = GET /api/admin/customers/:id/statement
 *   { customer, generatedAt, truncated, totals:{count,shown,invoiced,paid,owed}, invoices:[…] }
 * Totals always cover every invoice; the list is the newest shown of count.
 * `mode` = 'open' (owing only) | 'all'. Rendered hidden; the page copies its
 * markup into printShared.printHtml together with RECEIPT_CSS.
 */
const amt = (n) => Number(n || 0).toFixed(2);
const usd = (n) => `$${amt(n)}`;
const invNo = (id) => `INV-${String(id).padStart(5, '0')}`;
const STATUS = { unpaid: 'UNPAID', partial: 'PART PAID', paid: 'PAID' };
const METHOD = { cash: 'Cash', card: 'Card', evc: 'EVC' };
// Option / extras / note under a line, when the invoice line carries them.
const lineMods = (l) => [l.optionName, Array.isArray(l.extras) && l.extras.length ? `+ ${l.extras.map((e) => e.name).join(', ')}` : '', l.notes ? `* ${l.notes}` : ''].filter(Boolean);

const StatementDoc = forwardRef(function StatementDoc({ data, mode = 'open' }, ref) {
  const isClient = useIsClient();
  const biz = useBusiness();
  const wallets = useWallets();
  if (!data || !isClient) return null;
  const { customer, totals, invoices = [] } = data;
  const owing = mode === 'open';
  // Money owed on account is paid to the BUSINESS wallets.
  const payAccounts = payToAccounts(wallets, null);
  const count = totals?.count ?? invoices.length;
  const shown = totals?.shown ?? invoices.length;

  return (
    <div className="rcpt-root" ref={ref} data-print-doc hidden aria-hidden="true">
      <div className="rcpt">
        <div className="rc-name">{biz.name}</div>
        <div className="rc-status">STATEMENT</div>
        <div className="rc-rule" />
        <div className="rc-kv">
          <span className="k">Customer:</span><span className="v">{customer.name}</span>
          {customer.phone && <><span className="k">Phone:</span><span className="v">{customer.phone}</span></>}
          {customer.address && <><span className="k">Address:</span><span className="v">{customer.address}</span></>}
          <span className="k">Date:</span><span className="v">{printDate(data.generatedAt || new Date())}</span>
          <span className="k">Showing:</span><span className="v">{owing ? 'Owing invoices' : 'All invoices'}</span>
        </div>
        <div className="rc-rule solid" />
        {data.truncated && <div className="rc-center">Showing the newest {shown} of {count} invoices</div>}

        {invoices.length === 0 && <div className="rc-center">{owing ? 'Nothing owing.' : 'No invoices.'}</div>}

        {invoices.map((inv) => {
          const items = Array.isArray(inv.items) ? inv.items : [];
          const payments = Array.isArray(inv.payments) ? inv.payments : [];
          const discount = Number(inv.discount || 0);
          return (
            <div key={inv.id} className="st-inv">
              <div className="rc-sum st-head"><b>{invNo(inv.id)}</b><span>{printDate(inv.createdAt)}</span></div>
              <div className="rc-sum">
                <span>{[inv.tableNumber ? `Table ${inv.tableNumber}` : null, inv.dueDate ? `Due ${printDate(inv.dueDate)}` : null].filter(Boolean).join(' · ') || ' '}</span>
                <span>{STATUS[inv.status] || inv.status}</span>
              </div>
              {items.map((l, i) => {
                const mods = lineMods(l);
                return (
                  <div className="rc-item" key={i}>
                    <span>{Number(l.quantity)}</span>
                    <span className="n">{l.name}{mods.length > 0 && <span className="mod">{mods.join(' · ')}</span>}</span>
                    <span className="a">{amt(Number(l.unitPrice) * Number(l.quantity))}</span>
                  </div>
                );
              })}
              {discount > 0 && <div className="rc-sum"><span>Discount</span><span>-{amt(discount)}</span></div>}
              <div className="rc-sum"><b>Total</b><b>{amt(inv.total)}</b></div>
              {payments.map((p, i) => (
                <div className="rc-sum" key={i}><span>Paid {printDate(p.paidAt)} {p.account || METHOD[p.method] || p.method || ''}</span><span>-{amt(p.amount)}</span></div>
              ))}
              <div className="rc-sum"><b>Balance</b><b>{usd(inv.balance)}</b></div>
              <div className="rc-rule" />
            </div>
          );
        })}

        <div className="rc-kv st-sum">
          <span className="k">Invoices:</span><span className="v">{count}</span>
          {!owing && <><span className="k">Invoiced:</span><span className="v">{usd(totals?.invoiced)}</span></>}
          {!owing && <><span className="k">Paid:</span><span className="v">{usd(totals?.paid)}</span></>}
        </div>
        <div className="rc-total"><span>TOTAL OWED</span><span>{usd(totals?.owed)}</span></div>

        {Number(totals?.owed) > 0 && payAccounts.length > 0 && (
          <>
            <div className="rc-rule" />
            <div className="rc-kv">
              <PayToRow accounts={payAccounts} />
            </div>
          </>
        )}
        <div className="rc-center">{biz.footer || 'Thank you!'}</div>
      </div>
    </div>
  );
});

export default StatementDoc;
