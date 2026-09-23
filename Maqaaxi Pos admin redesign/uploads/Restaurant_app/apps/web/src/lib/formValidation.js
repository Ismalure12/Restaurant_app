'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Form validation for the admin (UX only — the API re-validates everything).
 *
 *   const schema = z.object({ name: z.string().trim().min(1, 'Enter the supplier’s name') });
 *   const form = useFormValidation(schema, values);
 *   <Field label="Name" required {...form.fieldProps('name')}><input .../></Field>
 *   <button disabled={!form.valid || saving}>Save</button>
 *
 * Every rule's message is written for a person ("Enter the amount", not
 * "Expected number"). Under an untouched field the message shows as a quiet
 * requirement; once the person has been in the field (or tried to submit) and
 * it is still wrong, it turns red. The submit button stays disabled until the
 * whole form is valid, so nothing incomplete can be posted.
 */

const first = (issues) => {
  const out = {};
  for (const issue of issues || []) {
    const key = issue.path?.length ? String(issue.path[0]) : '_form';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
};

/** A comparable copy of a field value (strings, numbers, arrays of ids…). */
const snapshot = (v) => { try { return JSON.stringify(v ?? null); } catch { return String(v); } };

/** {field: firstMessage} for a zod safeParse result (empty when valid). */
export const zodFieldErrors = (result) => (result.success ? {} : first(result.error.issues));

export function useFormValidation(schema, values) {
  const [touched, setTouched] = useState({});
  const [server, setServer] = useState({});

  const result = useMemo(() => schema.safeParse(values), [schema, values]);
  const errors = useMemo(() => zodFieldErrors(result), [result]);
  const valid = result.success;

  // The values a server error was given for: the error only stands while its
  // field still holds that value — typing a fix clears it at once.
  const valuesRef = useRef(values);
  useEffect(() => { valuesRef.current = values; }, [values]);
  const fields = useMemo(() => (values && typeof values === 'object' ? Object.keys(values) : []), [values]);

  const touch = useCallback((name) => setTouched((t) => (t[name] ? t : { ...t, [name]: true })), []);
  const touchAll = useCallback(() => setTouched((t) => ({ ...t, ...Object.fromEntries(Object.keys(errors).map((k) => [k, true])) })), [errors]);

  const serverMsg = (name) => {
    const s = server[name];
    if (!s) return undefined;
    const current = values && typeof values === 'object' ? values[name] : undefined;
    return snapshot(current) === s.snap ? s.msg : undefined;
  };

  /** Props for <Field>: red message once touched, quiet requirement before. */
  const fieldProps = (name) => {
    const fromServer = serverMsg(name);
    const msg = fromServer || errors[name];
    const shown = !!touched[name] || !!fromServer;
    return {
      name,
      error: msg && shown ? msg : undefined,
      requirement: msg && !shown ? msg : undefined,
      onBlur: () => touch(name),
    };
  };

  return {
    valid,
    errors,
    data: result.success ? result.data : null,
    fieldProps,
    /** The form's own keys (from `values`) — where a server field error can be shown. */
    fields,
    /** Mark a field as visited — for custom controls that have no native blur. */
    touch,
    /** Call from onSubmit: reveals every message and returns whether it may proceed. */
    check() { if (!valid) touchAll(); return valid; },
    /**
     * Put API field errors under their inputs ({ email: '…' } or { email: ['…'] }).
     * Each one clears as soon as that field's value changes. `null` / {} clears all.
     */
    setServerErrors(obj) {
      const vals = valuesRef.current;
      const next = {};
      for (const [k, v] of Object.entries(obj || {})) {
        const msg = Array.isArray(v) ? v[0] : v;
        if (typeof msg === 'string' && msg) next[k] = { msg, snap: snapshot(vals && typeof vals === 'object' ? vals[k] : undefined) };
      }
      setServer(next);
    },
    reset() { setTouched({}); setServer({}); },
  };
}

/** True for '', null, undefined and whitespace-only strings. */
export const isBlank = (v) => v == null || (typeof v === 'string' && v.trim() === '');
