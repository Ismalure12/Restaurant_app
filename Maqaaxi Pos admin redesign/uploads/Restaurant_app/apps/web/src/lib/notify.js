'use client';

import { toast } from 'sonner';
import { parseApiError, errorKind, isConnectionError } from './apiError';

/**
 * The only way admin code shows a status message (never `toast.*` directly):
 *
 *   notify.success('Saved')                  quiet, auto-hides in ~2.5s, top-centre
 *   notify.success('Saved', { title: 'Could not save the supplier' })
 *                                            …and clears that failure's toast
 *   notify.info('Copied')                    same, neutral
 *   notify.warning('Stock is low')           amber, stays a little longer
 *   notify.error(err)                        red, with the reason
 *   notify.error(err, { title: 'Could not save the supplier' })
 *
 * A validation / server error STAYS until dismissed (or until the same action
 * succeeds). A connection problem (offline / timeout / unreachable) hides
 * itself after ~8s — the connection banner keeps saying it — except a write
 * that timed out, which may have been saved and so stays. Repeats of the same
 * error replace each other, and at most 3 errors are kept open.
 */
const TITLES = {
  offline: 'You’re offline',
  timeout: 'Taking too long',
  unreachable: 'Can’t reach the server',
  server: 'Something went wrong',
  forbidden: 'Not allowed',
  auth: 'Signed out',
};

const MAX_ERRORS = 3;
const CONNECTION_MS = 8000;
/** ids of the error toasts on screen, oldest first. */
const openErrors = [];
const forget = (id) => { const i = openErrors.indexOf(id); if (i >= 0) openErrors.splice(i, 1); };
const titleId = (title) => `err:t:${title}`;

export const notify = {
  success(message, { title, ...opts } = {}) {
    if (title) { toast.dismiss(titleId(title)); forget(titleId(title)); }
    return toast.success(message, { duration: 2500, ...opts });
  },
  info: (message, opts = {}) => toast.info(message, { duration: 2500, ...opts }),
  warning: (message, opts = {}) => toast.warning(message, { duration: 6000, ...opts }),
  error(err, { title, ...opts } = {}) {
    const reason = parseApiError(err);
    const kind = errorKind(err);
    const heading = TITLES[kind];
    // A connection/server failure explains itself in its title; a validation
    // message is what the person needs to read, so it leads.
    const main = heading && !title ? heading : title || reason;
    const description = heading && !title ? reason : title ? reason : undefined;
    const passing = isConnectionError(err) && !err?.mayHaveSaved;
    const id = opts.id ?? (title ? titleId(title) : `err:${main}:${description ?? ''}`);

    forget(id);
    openErrors.push(id);
    while (openErrors.length > MAX_ERRORS) toast.dismiss(openErrors.shift());

    return toast.error(main, {
      description,
      duration: passing ? CONNECTION_MS : Infinity,
      ...opts,
      id,
      onDismiss: (t) => { forget(id); opts.onDismiss?.(t); },
      onAutoClose: (t) => { forget(id); opts.onAutoClose?.(t); },
    });
  },
  dismiss: (id) => { if (id != null) forget(id); else openErrors.length = 0; return toast.dismiss(id); },
};
