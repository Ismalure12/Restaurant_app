'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchJson } from '@/lib/apiError';
import { useFormValidation } from '@/lib/formValidation';
import { forgotSchema, loginSchema, resetSchema } from '@/lib/schemas/auth';
import Image from 'next/image';
import { Alert, Button, inputCls } from '@/components/admin/ui';

const jsonPost = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const INPUT = inputCls({ size: 'xl' });

/** A labelled input for the sign-in screens; the requirement / error text sits under the box. */
function LoginField({ id, label, form, name, children }) {
  const { error, requirement, onBlur } = form.fieldProps(name);
  const message = error || requirement;
  const msgId = `${id}-msg`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-[.09em] text-mq-muted">{label}</label>
      {children({ id, onBlur, 'aria-invalid': error ? true : undefined, 'aria-required': true, 'aria-describedby': message ? msgId : undefined })}
      {message && <div id={msgId} role={error ? 'alert' : undefined} className={error ? 'text-xs font-medium text-mq-danger-ink' : 'text-xs text-mq-muted'}>{message}</div>}
    </div>
  );
}

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(false);
  const router = useRouter();
  // ?expired=1 — sent here by the dashboard when the session ran out.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- read the URL once on mount
  useEffect(() => { setExpired(new URLSearchParams(window.location.search).get('expired') === '1'); }, []);

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

  const heading = resetStep === 'done' ? 'All set' : resetStep ? 'Reset your password' : 'Sign in';
  const sub = resetStep === 'email' ? 'Enter your email and we’ll send you a 6-digit code.'
    : resetStep === 'code' ? 'Enter the code we sent you, then choose a new password.'
      : resetStep === 'done' ? 'You can now sign in with your new password.'
        : 'Maqaaxi Pos · staff sign-in';

  return (
    <main className="min-h-screen grid place-items-center px-4 py-6 bg-mq-canvas font-mq text-mq-ink antialiased">
      <div className="w-full max-w-[380px] flex flex-col gap-5 bg-white border border-mq-line rounded-2xl shadow-mq-md px-6 py-7">
        <div className="flex flex-col items-center text-center gap-3">
          <span className="grid place-items-center w-[52px] h-[52px] rounded-[15px] bg-white border border-mq-line overflow-hidden">
            <Image src="/admin/logo-icon.png" alt="Maqaaxi Pos" width={38} height={38} className="object-contain" style={{ width: 38, height: 38 }} priority />
          </span>
          <div>
            <h1 className="m-0 text-[22px] font-semibold tracking-[-.02em]">{heading}</h1>
            <p className="m-0 mt-1 text-[13px] text-mq-muted">{sub}</p>
          </div>
        </div>

        {!resetStep && (
          <>
            {expired && !error && <Alert tone="warn" title="Your session ended">Sign in again to carry on.</Alert>}
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3.5">
              <LoginField id="email" label="Email" form={loginForm} name="email">
                {(a11y) => (
                  <input {...a11y} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} placeholder="you@example.com" />
                )}
              </LoginField>
              <LoginField id="password" label="Password" form={loginForm} name="password">
                {(a11y) => (
                  <input {...a11y} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={INPUT} placeholder="••••••••" />
                )}
              </LoginField>
              {error && <Alert tone="danger">{error}</Alert>}
              <Button type="submit" variant="primary" size="xl" block disabled={loading || !loginForm.valid} className="mt-1">
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
            <button type="button" onClick={() => setResetStep('email')} className="self-center text-[13px] font-semibold text-mq-cta hover:text-mq-primary">
              Forgot your password?
            </button>
          </>
        )}

        {resetStep === 'email' && (
          <form onSubmit={handleForgotEmail} noValidate className="flex flex-col gap-3.5">
            <LoginField id="resetEmail" label="Email" form={forgotForm} name="email">
              {(a11y) => (
                <input {...a11y} type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} className={INPUT} placeholder="you@example.com" />
              )}
            </LoginField>
            {resetError && <Alert tone="danger">{resetError}</Alert>}
            <Button type="submit" variant="primary" size="xl" block disabled={resetLoading || !forgotForm.valid}>
              {resetLoading ? 'Sending…' : 'Send reset code'}
            </Button>
            <button type="button" onClick={exitReset} className="self-center text-[13px] font-semibold text-mq-muted hover:text-mq-ink">Back to sign in</button>
          </form>
        )}

        {resetStep === 'code' && (
          <form onSubmit={handleResetPassword} noValidate className="flex flex-col gap-3.5">
            {resetSuccess && <Alert tone="ok">{resetSuccess}</Alert>}
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
                  className={`${INPUT} text-center tracking-[.3em] font-mq-mono tabular-nums`}
                  placeholder="000000"
                />
              )}
            </LoginField>
            <LoginField id="newPassword" label="New password" form={resetForm} name="newPassword">
              {(a11y) => (
                <input {...a11y} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={INPUT} placeholder="At least 6 characters" />
              )}
            </LoginField>
            {resetError && <Alert tone="danger">{resetError}</Alert>}
            <Button type="submit" variant="primary" size="xl" block disabled={resetLoading || !resetForm.valid}>
              {resetLoading ? 'Resetting…' : 'Reset password'}
            </Button>
            <button type="button" onClick={exitReset} className="self-center text-[13px] font-semibold text-mq-muted hover:text-mq-ink">Back to sign in</button>
          </form>
        )}

        {resetStep === 'done' && (
          <div className="flex flex-col gap-3.5">
            <Alert tone="ok">{resetSuccess}</Alert>
            <Button variant="primary" size="xl" block onClick={exitReset}>Back to sign in</Button>
          </div>
        )}
      </div>
    </main>
  );
}
