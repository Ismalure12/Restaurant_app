import { setConnection } from './connection';

/**
 * fetch + JSON parse + non-2xx → Error, so React Query / mutation handlers see
 * one structured error. Every failure gets a `kind` and a message that is safe
 * to show a person:
 *
 *   offline      no internet on this device                 → "You're offline…"
 *   timeout      the server didn't answer in time            → "…took too long"
 *                (a write: "…may have been saved — check before trying again";
 *                 never flips the connection banner)
 *   unreachable  proxy/gateway error (502/503/504, non-JSON 5xx, DB down)
 *                                                             → "Can't reach the server…"
 *   server       the API answered 500 (a bug)                 → "Something went wrong on our side"
 *   auth         401 · forbidden 403 · notfound 404
 *   validation   400/409/422 — the API's own message is shown as-is
 *
 * Also feeds lib/connection.js so a banner can show "offline / can't reach the
 * server" once, instead of every request shouting separately.
 */
export const MESSAGES = {
  offline: 'You appear to be offline. Check your internet connection and try again.',
  timeout: 'The server is taking too long to answer. Please try again.',
  timeoutWrite: 'The server didn’t answer in time. It may have been saved — check before trying again.',
  unreachable: 'We can’t reach the server right now. Please try again in a moment.',
  server: 'Something went wrong on our side. Please try again.',
  forbidden: 'You don’t have permission to do that.',
  notfound: 'We couldn’t find that. It may have been removed.',
  auth: 'Your session has ended. Please sign in again.',
};

const DEFAULT_TIMEOUT_MS = 45_000;
let redirecting = false;

function makeError(kind, status, message, extra = {}) {
  const err = new Error(message);
  err.kind = kind;
  err.status = status;
  err.details = null;
  err.code = null;
  return Object.assign(err, extra);
}

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** kind of a failed response, from its status and whether the body was the API's JSON. */
function classify(status, hasApiJson, code) {
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404 && !hasApiJson) return 'notfound';
  if (status === 503 || status === 502 || status === 504 || code === 'DB_UNAVAILABLE') return 'unreachable';
  if (status >= 500) return hasApiJson ? 'server' : 'unreachable'; // a proxy error page is not the API talking
  return 'validation';
}

/**
 * The error for a request that never completed. A timeout is NOT "server
 * unreachable" (the server may just be slow — or may have done the work), so it
 * doesn't flip the connection banner; and a timed-out write says it may have
 * been saved, so nobody blindly double-posts a payment or an expense.
 */
function transportError(ctrl, method) {
  const kind = isOffline() ? 'offline' : ctrl.signal.aborted ? 'timeout' : 'unreachable';
  if (kind !== 'timeout') setConnection(kind);
  const isRead = method === 'GET' || method === 'HEAD';
  const mayHaveSaved = kind === 'timeout' && !isRead;
  return makeError(kind, 0, mayHaveSaved ? MESSAGES.timeoutWrite : MESSAGES[kind], { mayHaveSaved });
}

export async function fetchJson(url, init = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
  const method = String(rest.method || 'GET').toUpperCase();
  const ctrl = new AbortController();
  const callerSignal = rest.signal;
  const onCallerAbort = () => ctrl.abort(callerSignal.reason);
  // Already cancelled before we started: don't send anything.
  if (callerSignal?.aborted) ctrl.abort(callerSignal.reason);
  else callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const done = () => { clearTimeout(timer); callerSignal?.removeEventListener('abort', onCallerAbort); };

  let res;
  try {
    res = await fetch(url, { ...rest, signal: ctrl.signal });
  } catch (e) {
    done();
    if (callerSignal?.aborted) throw e; // the caller cancelled — not an error to report
    throw transportError(ctrl, method);
  }

  let data = null;
  let text;
  try {
    text = await res.text();
  } catch (e) {
    // The connection dropped (or the timeout fired) while the body was
    // downloading: that is a failure, never an empty success.
    done();
    if (callerSignal?.aborted) throw e;
    throw transportError(ctrl, method);
  }
  done();
  const hasApiJson = (() => {
    if (!text) return false;
    try { data = JSON.parse(text); return data !== null && typeof data === 'object'; } catch { data = null; return false; }
  })();

  if (!res.ok) {
    // The API answers { error: 'msg', details? } — also accept { error: { code, message, details } }.
    const errObj = hasApiJson && data.error && typeof data.error === 'object' ? data.error : null;
    const code = errObj?.code ?? data?.code ?? null;
    const details = errObj?.details ?? data?.details ?? null;
    const kind = classify(res.status, hasApiJson, code);
    if (kind === 'unreachable') setConnection('unreachable'); else setConnection('ok');
    // Show the API's own words for its 4xx; friendly text for everything technical.
    const apiMessage = !hasApiJson ? null
      : errObj ? (typeof errObj.message === 'string' ? errObj.message : null)
      : (typeof data.error === 'string' && data.error) || (typeof data.message === 'string' && data.message) || null;
    const message = kind === 'validation' || kind === 'forbidden' ? apiMessage || MESSAGES.server
      : kind === 'auth' ? apiMessage || MESSAGES.auth
      : kind === 'notfound' ? apiMessage || MESSAGES.notfound
      : kind === 'server' ? MESSAGES.server
      : (code === 'DB_UNAVAILABLE' && apiMessage) || MESSAGES.unreachable;
    if (kind === 'auth' && typeof window !== 'undefined' && String(url).startsWith('/api/admin') && !redirecting && !window.location.pathname.startsWith('/admin/login')) {
      redirecting = true;
      window.location.assign('/admin/login');
    }
    // `body`: the API's full JSON answer, for callers that act on extra fields (e.g. a 409's orderId).
    throw makeError(kind, res.status, message, { details, code, body: hasApiJson ? data : null });
  }

  setConnection('ok');
  if (!hasApiJson && text) return { raw: text };
  return data;
}

/** A person-safe message for any thrown thing. */
export function parseApiError(err) {
  if (!err) return MESSAGES.server;
  if (typeof err === 'string') return err;
  if (err.kind) return err.message || MESSAGES.server;
  // A raw TypeError('Failed to fetch') from code that bypassed fetchJson.
  if (err instanceof TypeError || /failed to fetch|network/i.test(err.message || '')) return isOffline() ? MESSAGES.offline : MESSAGES.unreachable;
  if (/internal server error|request failed \(\d+\)/i.test(err.message || '')) return MESSAGES.server;
  return err.message || MESSAGES.server;
}

/** 'offline' | 'timeout' | 'unreachable' | 'server' | 'auth' | 'forbidden' | 'notfound' | 'validation' | 'unknown' */
export const errorKind = (err) => err?.kind || 'unknown';
export const isConnectionError = (err) => ['offline', 'timeout', 'unreachable'].includes(err?.kind);
