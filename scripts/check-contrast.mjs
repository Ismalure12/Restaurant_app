#!/usr/bin/env node
/**
 * Contrast gate for the design tokens.
 *
 * Parses apps/web/src/styles/tokens.css (the real file — this script cannot
 * drift from it) and asserts every text/surface pair the UI actually renders
 * meets WCAG AA. Run it after touching any colour token:
 *
 *     npm run check:contrast
 *
 * Exits non-zero on any failure so it can gate CI.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(resolve(ROOT, 'apps/web/src/styles/tokens.css'), 'utf8');

/* ---------- parse the three token blocks ---------- */
function block(re) {
  const m = CSS.match(re);
  if (!m) throw new Error(`token block not found: ${re}`);
  const out = {};
  for (const [, k, v] of m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[k] = v.trim();
  return out;
}
const base  = block(/:root\s*\{([\s\S]*?)\n\}/);
const light = block(/:root,\s*\n\[data-theme='light'\]\s*\{([\s\S]*?)\n\}/);
const dark  = block(/\[data-theme='dark'\]\s*\{([\s\S]*?)\n\}/);

/** Resolve var(--x) chains against the brand ramp. */
const deref = (val, scope) => {
  let v = val, guard = 0;
  while (v.startsWith('var(') && guard++ < 10) {
    const name = v.slice(4, v.indexOf(')')).trim();
    v = (scope[name] ?? base[name] ?? '').trim();
  }
  return v;
};

/* ---------- WCAG maths ---------- */
const toRgb = h => {
  h = h.replace('#', '');
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
};
const lum = h => {
  const [r, g, b] = toRgb(h).map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
};

/* ---------- the pairs the UI actually renders ---------- */
const SURFACES = ['--canvas', '--surface', '--surface-2', '--surface-3', '--inset'];
const BODY     = ['--ink', '--ink-2', '--muted', '--primary-ink',
                  '--pos', '--neg', '--warn', '--info'];

const rows = [];
let failures = 0;
const check = (label, fg, bg, min) => {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failures++;
  rows.push({ label, fg, bg, r, min, ok });
};

for (const [theme, scope] of [['light', light], ['dark', dark]]) {
  const c = k => deref(scope[k] ?? base[k], scope);
  for (const s of SURFACES) {
    for (const f of BODY) check(`${theme}  ${f} on ${s}`, c(f), c(s), 4.5);
    // --faint is decorative/non-essential: AA large-text / UI threshold.
    check(`${theme}  --faint on ${s}`, c('--faint'), c(s), 3.0);
  }
  // Text sitting on a filled brand button, and on tinted status chips.
  check(`${theme}  --primary-on on --primary`, c('--primary-on'), c('--primary'), 4.5);
  check(`${theme}  --primary-ink on --primary-soft`, c('--primary-ink'), c('--primary-soft'), 4.5);
  for (const k of ['pos', 'neg', 'warn', 'info']) {
    check(`${theme}  --${k} on --${k}-soft`, c(`--${k}`), c(`--${k}-soft`), 4.5);
    // Text sitting ON a filled semantic chip/button. These invert between
    // themes, so each fill carries its own on-colour rather than a bare #fff.
    check(`${theme}  --${k}-on on --${k}`, c(`--${k}-on`), c(`--${k}`), 4.5);
  }
}

/* ---------- report ---------- */
for (const { label, fg, bg, r, min, ok } of rows) {
  console.log(
    `${ok ? '  ok  ' : ' FAIL '}${label.padEnd(36)} ${fg.padEnd(9)}${bg.padEnd(9)}` +
    `${r.toFixed(2).padStart(6)}  (min ${min})`
  );
}
console.log(`\n${rows.length} pairs checked · ${rows.length - failures} pass · ${failures} fail`);
process.exit(failures ? 1 : 0);
