'use client';

import { useMenu } from '../MenuContext';

// Full-screen modal while the customer is handed to Sifalo's secure payment
// page ('redirect') or while we confirm a payment that came back pending
// ('confirming').
export default function PayModal() {
  const { payOpen, payPhase } = useMenu();
  const confirming = payPhase === 'confirming';
  return (
    <div className={`pay-modal ${payOpen ? 'show' : ''}`} role="status" aria-live="polite">
      <div className="pay-card">
        <div className="pay-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="2" width="12" height="20" rx="2.5" />
            <line x1="11" y1="18" x2="13" y2="18" />
          </svg>
        </div>
        {confirming ? (
          <>
            <h2>Confirming your <em>payment.</em></h2>
            <p>This usually takes a few seconds. Please keep this page open.</p>
          </>
        ) : (
          <>
            <h2>Secure <em>payment.</em></h2>
            <p>Taking you to Sifalo Pay — pay with EVC, ZAAD, Sahal, eDahab, Premier Wallet or card.</p>
          </>
        )}
      </div>
    </div>
  );
}
