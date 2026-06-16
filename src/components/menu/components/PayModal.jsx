'use client';

import { useMenu } from '../MenuContext';

// Full-screen modal shown while the customer approves the Waafi payment prompt.
export default function PayModal() {
  const { payOpen } = useMenu();
  return (
    <div className={`pay-modal ${payOpen ? 'show' : ''}`}>
      <div className="pay-card">
        <div className="pay-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="2" width="12" height="20" rx="2.5" />
            <line x1="11" y1="18" x2="13" y2="18" />
          </svg>
        </div>
        <h2>Check your <em>phone.</em></h2>
        <p>Approve the payment on your Waafi app to complete your order.</p>
      </div>
    </div>
  );
}
