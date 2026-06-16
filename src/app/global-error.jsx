'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html>
      <body style={{
        margin: 0,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#FAFAF8',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <div style={{
          background: '#fff',
          borderRadius: 20,
          border: '1px solid #e8e8e6',
          padding: '40px 32px',
          maxWidth: 440,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 8px 32px -8px rgba(21,23,43,0.12)',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: '#fbe9e2', color: '#c0440a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 style={{
            fontFamily: 'Georgia, serif',
            fontSize: 28, fontWeight: 600, color: '#15172b',
            margin: '0 0 8px',
          }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 13.5, color: '#8a8a8a', margin: '0 0 24px', lineHeight: 1.6 }}>
            A critical error occurred. Please refresh the page.
          </p>
          <button
            onClick={reset}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 22px',
              background: '#30378f', color: '#fff',
              border: 'none', borderRadius: 10,
              fontSize: 13.5, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
