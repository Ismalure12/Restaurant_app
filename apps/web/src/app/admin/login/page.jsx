'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchJson } from '@/lib/apiError';
import { useFormValidation } from '@/lib/formValidation';
import { forgotSchema, loginSchema, resetSchema } from '@/lib/schemas/auth';

const jsonPost = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/**
 * A labelled input for the sign-in screens. The requirement / error text sits
 * directly under the box (this page is outside the dashboard, so it keeps its
 * own `adm-*` look rather than the dashboard's <Field>).
 */
function LoginField({ id, label, form, name, children }) {
  const { error, requirement, onBlur } = form.fieldProps(name);
  const message = error || requirement;
  const msgId = `${id}-msg`;
  return (
    <div>
      <label htmlFor={id} className="adm-label">{label}</label>
      {children({ id, onBlur, 'aria-invalid': error ? true : undefined, 'aria-required': true, 'aria-describedby': message ? msgId : undefined })}
      {message && <div id={msgId} role={error ? 'alert' : undefined} style={{ marginTop: 6, fontSize: 13, lineHeight: 1.35, color: error ? 'var(--neg)' : 'var(--muted)' }}>{message}</div>}
    </div>
  );
}

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

  const loginForm = useFormValidation(loginSchema, { email, password });
  const forgotForm = useFormValidation(forgotSchema, { email: resetEmail });
  const resetForm = useFormValidation(resetSchema, { code: resetCode, newPassword });

  // fetchJson gives a friendly message for a lost connection ("You appear to be
  // offline…", "We can't reach the server…") and the API's own words otherwise.
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!loginForm.check()) return;
    setLoading(true);
    try {
      await fetchJson('/api/auth/login', jsonPost({ email: email.trim(), password }));
      router.push('/admin/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotEmail = async (e) => {
    e.preventDefault();
    setResetError('');
    if (!forgotForm.check()) return;
    setResetLoading(true);
    try {
      await fetchJson('/api/auth/forgot-password', jsonPost({ email: resetEmail.trim() }));
      setResetStep('code');
      setResetSuccess('Check your email for the 6-digit code.');
    } catch (err) {
      setResetError(err.message || 'We could not send the code. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetError('');
    if (!resetForm.check()) return;
    setResetLoading(true);
    try {
      await fetchJson('/api/auth/reset-password', jsonPost({ email: resetEmail.trim(), code: resetCode, newPassword }));
      setResetStep('done');
      setResetSuccess('Password reset successful. You can now sign in.');
    } catch (err) {
      setResetError(err.message || 'We could not reset the password. Please try again.');
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
    forgotForm.reset();
    resetForm.reset();
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--cream)',
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
           'Sign in to run the register, orders and the menu.'}
        </p>

        {!resetStep && (
          <>
            <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <LoginField id="email" label="Email" form={loginForm} name="email">
                {(a11y) => (
                  <input
                    {...a11y}
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="adm-input"
                    placeholder="you@example.com"
                  />
                )}
              </LoginField>
              <LoginField id="password" label="Password" form={loginForm} name="password">
                {(a11y) => (
                  <input
                    {...a11y}
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="adm-input"
                    placeholder="••••••••"
                  />
                )}
              </LoginField>
              {error && <div className="adm-error-banner" role="alert">{error}</div>}
              <button type="submit" disabled={loading || !loginForm.valid} className="adm-btn adm-btn-primary" style={{ height: 46, marginTop: 4 }}>
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
          <form onSubmit={handleForgotEmail} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <LoginField id="resetEmail" label="Email" form={forgotForm} name="email">
              {(a11y) => (
                <input
                  {...a11y}
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="adm-input"
                  placeholder="you@example.com"
                />
              )}
            </LoginField>
            {resetError && <div className="adm-error-banner" role="alert">{resetError}</div>}
            <button type="submit" disabled={resetLoading || !forgotForm.valid} className="adm-btn adm-btn-primary" style={{ height: 46 }}>
              {resetLoading ? 'Sending…' : 'Send reset code'}
            </button>
            <button type="button" onClick={exitReset} className="adm-link" style={{ display: 'block', margin: '4px auto 0', color: 'var(--muted)' }}>
              Back to sign in
            </button>
          </form>
        )}

        {resetStep === 'code' && (
          <form onSubmit={handleResetPassword} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
            <LoginField id="resetCode" label="6-digit code" form={resetForm} name="code">
              {(a11y) => (
                <input
                  {...a11y}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="adm-input"
                  style={{ textAlign: 'center', letterSpacing: '0.3em', fontVariantNumeric: 'tabular-nums' }}
                  placeholder="000000"
                />
              )}
            </LoginField>
            <LoginField id="newPassword" label="New password" form={resetForm} name="newPassword">
              {(a11y) => (
                <input
                  {...a11y}
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="adm-input"
                  placeholder="At least 6 characters"
                />
              )}
            </LoginField>
            {resetError && <div className="adm-error-banner" role="alert">{resetError}</div>}
            <button type="submit" disabled={resetLoading || !resetForm.valid} className="adm-btn adm-btn-primary" style={{ height: 46 }}>
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
