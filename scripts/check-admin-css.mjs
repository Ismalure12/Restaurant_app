#!/usr/bin/env node
// Guards the admin design system (src/app/admin/jazeera.css, scoped under
// .jz) against unscoped CSS leaking in from globals.css or Tailwind.
//
// Why: Tailwind scans the admin JSX, so a design-system class that shares a
// name with a utility (".h-1" → height: .25rem) or with a public menu
// component (".reveal" → opacity: 0) silently gets that rule too. That is
// what collapsed every admin heading and made text overlap.
//
// How: build the real CSS with the Tailwind CLI, then for every class the
// design system defines (".jz .name"), report any UNSCOPED rule for the same
// class that sets a layout/visibility property the .jz rule doesn't set
// itself (so it isn't overridden). Declarations inside @media don't count as
// an override — they only apply sometimes. A shorthand (padding, margin,
// inset) overrides its longhands.
//
// Usage: npm run check:admin-css
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JAZEERA = path.join(ROOT, 'src/app/admin/jazeera.css');
const OUT = path.join(os.tmpdir(), `admin-css-check-${process.pid}.css`);

const WATCHED = /^(height|min-height|max-height|width|min-width|max-width|opacity|transform|display|position|top|right|bottom|left|inset|margin(-[a-z]+)?|padding(-[a-z]+)?|visibility|box-shadow|backdrop-filter)$/;
const SHORTHAND = { top: 'inset', right: 'inset', bottom: 'inset', left: 'inset' };
const covers = (set, prop) => set.has(prop) || set.has(SHORTHAND[prop]) || set.has(prop.split('-')[0]) && /^(padding|margin)-/.test(prop);

// Leaks that are harmless by construction, with the reason.
const ALLOW = new Map([
  ['table|display', 'Tailwind .table{display:table} only ever lands on a real <table>'],
]);

// Minimal brace-aware CSS walker → [{ selectors, decls: Map<prop,value>, inMedia }]
function parse(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const stack = [];
  let buf = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      const prelude = buf.trim();
      buf = '';
      if (prelude.startsWith('@')) { stack.push(prelude); continue; }
      const end = src.indexOf('}', i);
      const decls = new Map();
      for (const d of src.slice(i + 1, end).split(';')) {
        const at = d.indexOf(':');
        if (at > 0) decls.set(d.slice(0, at).trim().toLowerCase(), d.slice(at + 1).trim());
      }
      rules.push({ selectors: prelude.split(',').map((s) => s.trim()), decls, inMedia: stack.length > 0 });
      i = end;
    } else if (ch === '}') {
      stack.pop();
      buf = '';
    } else if (ch === ';' && !buf.includes('(')) {
      buf = '';
    } else {
      buf += ch;
    }
  }
  return rules;
}

// class[:pseudo] → props the design system declares outside @media
const jz = new Map();
for (const r of parse(fs.readFileSync(JAZEERA, 'utf8'))) {
  for (const sel of r.selectors) {
    const m = sel.match(/^\.jz(?:-modal-bk)?\s+\.([a-z][a-z0-9-]*)((?::[a-z-]+)*)$/);
    if (!m) continue;
    const key = m[1] + m[2];
    if (!jz.has(key)) jz.set(key, new Set());
    if (!r.inMedia) for (const p of r.decls.keys()) jz.get(key).add(p);
  }
}
const designClasses = new Set([...jz.keys()].map((k) => k.split(':')[0]));

execFileSync(process.execPath, [path.join(ROOT, 'node_modules/tailwindcss/lib/cli.js'), '-c', path.join(ROOT, 'tailwind.config.js'), '-i', path.join(ROOT, 'src/styles/globals.css'), '-o', OUT], { cwd: ROOT, stdio: 'pipe' });
const built = parse(fs.readFileSync(OUT, 'utf8'));
fs.rmSync(OUT, { force: true });

const leaks = new Set();
for (const r of built) {
  for (const sel of r.selectors) {
    const m = sel.match(/^\.([a-z][a-z0-9-]*)((?::[a-z-]+)*)$/);
    if (!m || !designClasses.has(m[1])) continue;
    const overridden = jz.get(m[1] + m[2]) || new Set();
    for (const [p, v] of r.decls) {
      if (!WATCHED.test(p) || covers(overridden, p) || ALLOW.has(`${m[1]}|${p}`)) continue;
      leaks.add(`${sel.padEnd(28)} ${p}: ${v}${r.inMedia ? '   (inside @media)' : ''}`);
    }
  }
}

if (leaks.size) {
  console.error(`✖ ${leaks.size} unscoped declaration(s) leak into the admin design system:\n`);
  for (const l of leaks) console.error(`  ${l}`);
  // Not a Tailwind blocklist: globals.css @applies some of these utilities, so blocking them breaks the build.
  console.error('\nOverride the property under ".jz .<class>" in jazeera.css.');
  process.exit(1);
}
console.log(`✔ No unscoped CSS leaks into ${designClasses.size} admin design-system classes.`);
