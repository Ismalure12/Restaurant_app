import { isConnectionError, parseApiError } from './apiError';
import { notify } from './notify';

/**
 * {field: firstMessage} from an API `details` value, whatever shape it came in:
 *   zod flatten()     { formErrors: ['…'], fieldErrors: { price: ['…'] } }
 *   plain map         { email: 'Already used' }  or  { email: ['Already used'] }
 * Form-level messages (flatten's formErrors, or a `_form` key) come back under '_form'.
 */
export function normaliseDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
  const isFlatten = 'fieldErrors' in details || 'formErrors' in details;
  const src = isFlatten ? (details.fieldErrors && typeof details.fieldErrors === 'object' ? details.fieldErrors : {}) : details;
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    const msg = Array.isArray(v) ? v.find((m) => typeof m === 'string' && m) : v;
    if (typeof msg === 'string' && msg) out[k] = msg;
  }
  const formMsgs = isFlatten && Array.isArray(details.formErrors) ? details.formErrors.filter((m) => typeof m === 'string' && m) : [];
  if (formMsgs.length && !out._form) out._form = formMsgs[0];
  return out;
}

/** 'unitPrice' → 'Unit price' (only for messages that name a field the form doesn't show). */
const humanise = (k) => {
  const s = String(k).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * A failed save, reported in exactly ONE place:
 *   - lost connection (offline / timeout / unreachable) → a toast only (the
 *     connection banner explains the rest; a modal banner would repeat it);
 *   - an API message that names a field the form renders → under that field;
 *   - everything else → the modal's inline banner when there is one
 *     (`setBanner`), otherwise a sticky error toast titled `title`.
 *
 *   reportSaveError(err, { form, setBanner, title: 'Could not save the tag',
 *                          fields: ['label', 'slug'],           // default: the form's own keys
 *                          guess: { slug: /slug|already/i } })  // plain message → field by keyword
 */
export function reportSaveError(err, { form, setBanner, title, fields, guess } = {}) {
  if (isConnectionError(err)) { notify.error(err, { title }); return; }

  const known = new Set(fields || form?.fields || []);
  const details = normaliseDetails(err?.details);
  const mapped = {};
  const leftover = [];
  for (const [k, msg] of Object.entries(details)) {
    if (form && k !== '_form' && known.has(k)) mapped[k] = msg;
    else leftover.push(k === '_form' ? msg : `${humanise(k)}: ${msg}`);
  }

  // No field-level detail: a plain API message may still clearly be about one field.
  const message = parseApiError(err);
  if (form && guess && !Object.keys(details).length) {
    for (const [field, re] of Object.entries(guess)) {
      if ((!known.size || known.has(field)) && re.test(message)) { mapped[field] = message; break; }
    }
  }

  if (Object.keys(mapped).length) form.setServerErrors(mapped);

  const rest = leftover.length ? leftover.join(' · ') : Object.keys(mapped).length ? '' : message;
  if (!rest) return;
  if (setBanner) setBanner(rest);
  else notify.error(leftover.length ? rest : err, { title });
}
