'use client';

import { forwardRef } from 'react';
import { RECEIPT_CSS } from '../receiptCss';
import { printMoney, printDate, printTime } from '../printShared';

/**
 * Z-report print document (docs/system-blueprint.md §3.4) — the frozen day
 * close on paper. Same look as the 80mm receipts (monospace, black on white,
 * RECEIPT_CSS classes); variant="a4" lays the same content out on a sheet.
 * Rendered hidden; the Day close screen copies its markup + Z_CSS into the
 * print iframe (printShared.printHtml), so the app page is never printed.
 *
 * report = the frozen snapshot (sales, voids, collections, lines, carriedOver).
 */
const acctName = (a) => (a.kind === 'cash' ? 'Cash' : a.label);

function Row({ k, v, strong }) {
  return <div className="rc-sum" style={strong ? { fontWeight: 800 } : undefined}><span>{k}</span><span>{v}</span></div>;
}

const ZReportDoc = forwardRef(function ZReportDoc({ business, day, report, closedAt, closedBy, variant = '80mm' }, ref) {
  if (!report) return null;
  const s = report.sales || {};
  const lines = Array.isArray(report.lines) ? report.lines : [];
  const col = report.collections;
  const voids = Array.isArray(report.voids) ? report.voids : [];
  const carried = report.carriedOver;
  return (
    <div ref={ref} data-zreport style={{ display: 'none' }}>
      <div className={`rcpt zr ${variant === 'a4' ? 'zr-a4' : ''}`}>
        <div className="rc-name">{business}</div>
        <div className="rc-status">Z-REPORT · DAY CLOSE</div>
        <div className="rc-rule solid" />
        <Row k="Day" v={day} strong />
        {closedAt && <Row k="Closed" v={`${printDate(closedAt)} ${printTime(closedAt)}`} />}
        {closedBy && <Row k="Closed by" v={closedBy} />}

        <div className="rc-rule" />
        <div className="zr-h">SALES</div>
        <Row k={`Sales (${s.count ?? 0})`} v={printMoney(s.gross)} />
        {Number(s.discounts) > 0 && <Row k="Discounts given" v={printMoney(s.discounts)} />}
        <Row k={`Refunds (${s.refundCount ?? 0})`} v={printMoney(-Number(s.refunds || 0))} />
        <div className="rc-total"><span>NET</span><span>{printMoney(s.net)}</span></div>
        {s.onAccount?.count > 0 && <Row k={`On account (${s.onAccount.count})`} v={printMoney(s.onAccount.total)} />}
        {(s.byAccount || []).map((a) => <Row key={a.accountId} k={acctName(a)} v={printMoney(a.sales)} />)}

        <div className="rc-rule" />
        <div className="zr-h">ACCOUNTS</div>
        {lines.map((l) => (
          <div key={l.accountId} className="zr-acct">
            <div style={{ fontWeight: 700 }}>{acctName(l)}</div>
            <Row k="Opening" v={printMoney(l.opening)} />
            <Row k="In / Out" v={`${printMoney(l.moneyIn)} / ${printMoney(l.moneyOut)}`} />
            <Row k="Expected" v={printMoney(l.expected)} />
            <Row k="Counted" v={l.counted == null ? 'not counted' : printMoney(l.counted)} />
            {l.counted != null && <Row k="Difference" v={`${Number(l.difference) > 0 ? '+' : ''}${printMoney(l.difference)}`} strong={Number(l.difference) !== 0} />}
          </div>
        ))}

        {col && col.rows?.length > 0 && (
          <>
            <div className="rc-rule" />
            <div className="zr-h">COLLECTED BY</div>
            {col.rows.map((r) => (
              <div key={r.staffId} className="zr-acct">
                <Row k={`${r.name} (${r.role})`} v={printMoney(r.total)} strong />
                {col.accounts.filter((a) => r.byAccount?.[a.id] != null).map((a) => <div key={a.id} className="zr-sub"><Row k={acctName(a)} v={printMoney(r.byAccount[a.id])} /></div>)}
              </div>
            ))}
            <Row k="Total collected" v={printMoney(col.total)} strong />
          </>
        )}

        {voids.length > 0 && (
          <>
            <div className="rc-rule" />
            <div className="zr-h">VOIDS ({voids.length})</div>
            {voids.map((v) => (
              <div key={v.orderId} className="zr-acct">
                <Row k={`Order #${v.orderId}${v.table ? ` · T${v.table}` : ''}`} v={printMoney(v.total)} />
                {v.reason && <div className="zr-sub">{v.reason}</div>}
              </div>
            ))}
          </>
        )}

        {carried && (carried.openTabs > 0 || carried.pendingOnline > 0) && (
          <>
            <div className="rc-rule" />
            <div className="zr-h">CARRIED OVER</div>
            <div>{carried.openTabs} unpaid tab(s), {carried.pendingOnline} online order(s)</div>
          </>
        )}

        <div className="rc-rule" />
        <div className="zr-sign"><span>Manager signature</span></div>
      </div>
    </div>
  );
});

export default ZReportDoc;

// The 80mm receipt styles plus the Z-report extras; the A4 rules come last so
// their @page (later in the iframe than printHtml's 80mm one) wins.
export const Z_CSS = `${RECEIPT_CSS}
.zr-h { font-weight: 800; letter-spacing: .06em; margin: 2px 0; }
.zr-acct { margin-bottom: 4px; }
.zr-sub { font-size: 10.5px; padding-left: 2ch; overflow-wrap: anywhere; }
.zr-sign { margin-top: 8mm; border-top: 1px solid #000; padding-top: 2px; font-size: 10.5px; }
`;
export const Z_CSS_A4 = `${Z_CSS}
@page { size: A4; margin: 14mm; }
.rcpt.zr-a4 { width: 100%; max-width: 170mm; margin: 0 auto; padding: 0; font-size: 13px; }
.zr-a4 .rc-name { font-size: 24px; }
.zr-a4 .rc-total { font-size: 19px; }
.zr-a4 .zr-sub { font-size: 12px; }
.zr-a4 .zr-sign { width: 70mm; margin-top: 18mm; }
`;
