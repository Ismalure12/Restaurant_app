'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // null | 'email' | 'code' | 'done'
  const [resetStep, setResetStep] = useState(null);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      router.push('/admin/dashboard');
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotEmail = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      });
      if (!res.ok) {
        const data = await res.json();
        setResetError(data.error || 'Failed to send code');
        return;
      }
      setResetStep('code');
      setResetSuccess('Check your email for the 6-digit code.');
    } catch {
      setResetError('Something went wrong');
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, code: resetCode, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetError(data.error || 'Failed to reset password');
        return;
      }
      setResetStep('done');
      setResetSuccess('Password reset successful. You can now sign in.');
    } catch {
      setResetError('Something went wrong');
    } finally {
      setResetLoading(false);
    }
  };

  const exitReset = () => {
    setResetStep(null);
    setResetEmail('');
    setResetCode('');
    setNewPassword('');
    setResetError('');
    setResetSuccess('');
  };

  return (
    <div
      style={{
        // Keep the admin login on the emerald/gold "Ledger" theme (the public
        // --blue/--green tokens are now maroon), scoped to this subtree only.
        '--blue': '#1f6b4f', '--blue-deep': '#154b38', '--blue-soft': '#e7f1ec',
        '--green': '#1f6b4f', '--green-deep': '#154b38', '--green-soft': '#e7f1ec',
        minHeight: '100vh',
        background: 'var(--cream)',
        backgroundImage:
          'radial-gradient(circle at 0% 0%, rgba(31,107,79,0.08) 0%, transparent 45%), radial-gradient(circle at 100% 100%, rgba(181,134,44,0.07) 0%, transparent 45%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
    >
      <div className="adm-card adm-card-pad-lg" style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div className="adm-brand-mark"><span>MP</span></div>
          <div>
            <div style={{
              fontFamily: 'var(--font-cormorant), serif',
              color: 'var(--blue)', fontSize: 22, fontWeight: 600, lineHeight: 1.05,
            }}>
              Maqaaxi Pos
            </div>
            <span className="adm-brand-sub">Staff dashboard</span>
          </div>
        </div>

        <h1 className="adm-h1" style={{ fontSize: 28, marginBottom: 4 }}>
          {resetStep === 'done' ? 'All set.' :
           resetStep ? 'Reset your password' :
           <>Welcome <em>back.</em></>}
        </h1>
        <p className="adm-sub" style={{ marginBottom: 22 }}>
          {resetStep === 'email' ? 'Enter your email and we’ll send you a 6-digit code.' :
           resetStep === 'code' ? 'Enter the code we sent you, then choose a new password.' :
           resetStep === 'done' ? 'You can now sign in with your new password.' :
           'Sign in to manage the menu, banners, and orders.'}
        </p>

        {!resetStep && (
          <>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label htmlFor="email" className="adm-label">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="adm-input"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label htmlFor="password" className="adm-label">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="adm-input"
                  placeholder="••••••••"
                />
              </div>
              {error && <div className="adm-error-banner">{error}</div>}
              <button type="submit" disabled={loading} className="adm-btn adm-btn-primary" style={{ height: 46, marginTop: 4 }}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setResetStep('email')}
              className="adm-link"
              style={{ display: 'block', margin: '16px auto 0' }}
            >
              Forgot password?
            </button>
          </>
        )}

        {resetStep === 'email' && (
          <form onSubmit={handleForgotEmail} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label htmlFor="resetEmail" className="adm-label">Email</label>
              <input
                id="resetEmail"
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
                className="adm-input"
                placeholder="you@example.com"
              />
            </div>
            {resetError && <div className="adm-error-banner">{resetError}</div>}
            <button type="submit" disabled={resetLoading} className="adm-btn adm-btn-primary" style={{ height: 46 }}>
              {resetLoading ? 'Sending…' : 'Send reset code'}
            </button>
            <button type="button" onClick={exitReset} className="adm-link" style={{ display: 'block', margin: '4px auto 0', color: 'var(--muted)' }}>
              Back to sign in
            </button>
          </form>
        )}

        {resetStep === 'code' && (
          <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {resetSuccess && (
              <div style={{
                fontFamily: 'var(--font-inter), Inter, sans-serif',
                fontSize: 13, color: 'var(--green-deep)',
                background: 'var(--green-soft)',
                padding: '10px 14px', borderRadius: 12,
              }}>
                {resetSuccess}
              </div>
            )}
            <div>
              <label htmlFor="resetCode" className="adm-label">6-digit code</label>
              <input
                id="resetCode"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                className="adm-input"
                style={{ textAlign: 'center', letterSpacing: '0.3em', fontVariantNumeric: 'tabular-nums' }}
                placeholder="000000"
              />
            </div>
            <div>
              <label htmlFor="newPassword" className="adm-label">New password</label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="adm-input"
                placeholder="At least 6 characters"
              />
            </div>
            {resetError && <div className="adm-error-banner">{resetError}</div>}
            <button type="submit" disabled={resetLoading || resetCode.length !== 6} className="adm-btn adm-btn-primary" style={{ height: 46 }}>
              {resetLoading ? 'Resetting…' : 'Reset password'}
            </button>
            <button type="button" onClick={exitReset} className="adm-link" style={{ display: 'block', margin: '4px auto 0', color: 'var(--muted)' }}>
              Back to sign in
            </button>
          </form>
        )}

        {resetStep === 'done' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              fontFamily: 'var(--font-inter), Inter, sans-serif',
              fontSize: 13, color: 'var(--green-deep)',
              background: 'var(--green-soft)',
              padding: '12px 14px', borderRadius: 12, textAlign: 'center',
            }}>
              {resetSuccess}
            </div>
            <button onClick={exitReset} className="adm-btn adm-btn-primary" style={{ height: 46 }}>
              Back to sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
