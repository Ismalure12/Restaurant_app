'use client';

import { useMenu } from '../MenuContext';
import Crest from '../components/Crest';
import { FMT } from '@/lib/menu/format';

// Order confirmation overlay (also shown via ?ref= deep link).
export default function ConfirmedScreen() {
  const { confirmedOpen: open, completedOrder: order, goBack: onBack } = useMenu();

  if (!order) {
    return <div className={`page confirmed-page ${open ? 'open' : ''}`} />;
  }
  const total = Number(order.total) || (order.items || []).reduce((s, c) => s + (c.unitPrice ?? c.price ?? 0) * (c.quantity ?? 1), 0);
  return (
    <div className={`page confirmed-page ${open ? 'open' : ''}`}>
      <div className="cf-scroll">
        <div className="topbar solid cf-topbar">
          <Crest />
        </div>
        <div className="cf-body">
          <div className="cf-card">
            <div className="cf-check">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div className="cf-eyebrow">Order received</div>
            <h1 className="cf-title">Thank <em>you.</em></h1>
            <p className="cf-where">
              {order.orderType === 'dine_in' ? (
                <>We&apos;re bringing it to <strong>Table {order.tableNumber}</strong>.</>
              ) : (
                <>We&apos;re on our way to <strong>{order.address}</strong>.</>
              )}
            </p>
            <div className="cf-items">
              {(order.items || []).map((item, i) => {
                const price = item.unitPrice ?? item.price ?? 0;
                const qty = item.quantity ?? 1;
                const sub = [item.optionName ?? item.variant, ...(item.extras || []).map((e) => e.name), item.notes].filter(Boolean).join(' · ');
                return (
                  <div className="cf-row" key={item.uid ?? i}>
                    <div className="ci-body">
                      <p className="ci-name">
                        {item.name}
                        {qty > 1 && <span className="ci-qty-mark"> × {qty}</span>}
                      </p>
                      {sub && <div className="ci-sub">{sub}</div>}
                    </div>
                    <span className="ci-price">{FMT(price * qty)}</span>
                  </div>
                );
              })}
            </div>
            <div className="cf-total">
              <span className="lbl">Total</span>
              <span className="amt">{FMT(total)}</span>
            </div>
            <button className="cf-back" type="button" onClick={onBack}>Back to menu</button>
          </div>
        </div>
      </div>
    </div>
  );
}
