import { z } from 'zod';

/**
 * Shared building blocks for the settings / staff / menu / tables / login form
 * schemas. Every message is written for a person and mirrors a rule in
 * apps/api/src/lib/validations.ts (the API still re-checks everything — these
 * only stop an incomplete form from being sent).
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A number typed in an <input> (kept as text): required, numeric, within [min, max]. */
export function moneyText(required, { min = 0, max, minMsg, maxMsg, invalid } = {}) {
  return z.string().trim()
    .min(1, required)
    .refine((v) => Number.isFinite(Number(v)), invalid || required)
    .refine((v) => Number(v) >= min, minMsg || required)
    .refine((v) => max == null || Number(v) <= max, maxMsg || required);
}

/** Same, but blank is allowed (an optional amount). */
export function optionalMoneyText(msg, { min = 0, max, minMsg, maxMsg } = {}) {
  return z.string().trim()
    .refine((v) => v === '' || Number.isFinite(Number(v)), msg)
    .refine((v) => v === '' || !Number.isFinite(Number(v)) || Number(v) >= min, minMsg || msg)
    .refine((v) => v === '' || max == null || Number(v) <= max, maxMsg || msg);
}

/** A whole number typed in an <input>. */
export function intText(required, { min = 0, max, minMsg, maxMsg } = {}) {
  return z.string().trim()
    .min(1, required)
    .refine((v) => /^-?\d+$/.test(v), 'Enter a whole number')
    .refine((v) => Number(v) >= min, minMsg || required)
    .refine((v) => max == null || Number(v) <= max, maxMsg || required);
}

/** Optional free text with a length cap. */
export const maxText = (max, label) => z.string().trim().max(max, `${label} is too long (max ${max} characters)`);
