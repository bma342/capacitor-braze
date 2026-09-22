#!/usr/bin/env node
// A5-20 / L7-02 — bundle-size budget gate.
//
// REVIEW_READINESS.md §2 published a "<5 KB gzipped" web-bundle budget that
// nothing measured and nothing enforced. This script is the enforcement, and
// the budget below is the *measured* number rather than an aspiration.
//
// What is measured
//   - ESM entry tree: every `dist/esm/**/*.js` (the plugin's own output;
//     sourcemaps and `.d.ts` are excluded — neither is loaded at runtime).
//   - `dist/plugin.cjs.js`: reported for information only. It is a Rollup
//     concatenation of the same modules, so it moves with the ESM total; the
//     ESM tree is what a modern consumer's bundler actually pulls in.
//
// What is NOT measured: `@braze/web-sdk`. It is a peer dependency, is never
// bundled into `dist/`, and dwarfs the bridge. This budget covers the bridge
// layer only, which is what the published budget always meant.
//
// Measured at 0.2.0 on 2026-09-22 (node 22, rollup output, gzip -9):
//   dist/esm/definitions.js       327 B raw ->      251 B gz
//   dist/esm/index.js             238 B raw ->      190 B gz
//   dist/esm/web.js            49,644 B raw ->   13,070 B gz
//   ESM total                  ~59 KB raw  ->   16,180 B gz  <-- the gated number
//   dist/plugin.cjs.js         49,920 B raw ->   13,213 B gz
//
// So the honest headline is ~13.2 KB gzipped for the bridge, not the "<5 KB"
// REVIEW_READINESS.md §2 used to promise. 35 methods' worth of validation
// strings, DTO serializers and listener plumbing is simply larger than that,
// and the number nobody measured was never achievable.
//
// The budget is that measured total rounded up with ~20% headroom, so ordinary
// method-by-method growth does not trip it but a dependency accidentally being
// inlined into the bundle does. When a deliberate addition pushes past it,
// re-measure and raise the budget IN THE SAME COMMIT as the code, with the new
// measurement recorded here and in REVIEW_READINESS.md §2 — do not raise it to
// make a red build green.
//
// Usage:
//   npm run build && node .github/scripts/assert-size.mjs

import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Gated budget for the gzipped ESM tree, in bytes. See the header. */
const ESM_GZIP_BUDGET_BYTES = 20480; // 20 KiB — the measurement below plus ~27% headroom.

/** The measurement the budget was derived from, for the failure message. */
const ESM_GZIP_MEASURED_BYTES = 16180;
const MEASURED_AT = '0.2.0, 2026-09-22';

const ESM_DIR = 'dist/esm';
const CJS_FILE = 'dist/plugin.cjs.js';

/** Every `.js` under `dir`, recursively, excluding sourcemaps. */
function collectJs(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectJs(full));
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

/** Raw + gzipped byte counts for one file. */
function measure(path) {
  const raw = readFileSync(path);
  return { path, raw: raw.length, gz: gzipSync(raw, { level: 9 }).length };
}

function fmt(n) {
  return n.toLocaleString('en-US');
}

function row(label, raw, gz) {
  return `  ${label.padEnd(30)} ${fmt(raw).padStart(10)} B raw  ${fmt(gz).padStart(9)} B gz`;
}

const esmFiles = collectJs(ESM_DIR);

if (esmFiles.length === 0) {
  console.error(`::error::no JavaScript found under ${ESM_DIR}/ — run \`npm run build\` first.`);
  process.exit(1);
}

const esm = esmFiles.map(measure);
const esmRawTotal = esm.reduce((n, f) => n + f.raw, 0);
const esmGzTotal = esm.reduce((n, f) => n + f.gz, 0);

console.log('Bundle size (plugin only; @braze/web-sdk is a peer dep and is not bundled)\n');
for (const f of esm) {
  console.log(row(relative('dist', f.path), f.raw, f.gz));
}
console.log(row('ESM total', esmRawTotal, esmGzTotal));

let cjsExists = true;
try {
  statSync(CJS_FILE);
} catch {
  cjsExists = false;
}
if (cjsExists) {
  const cjs = measure(CJS_FILE);
  console.log(row(`${relative('dist', CJS_FILE)} (informational)`, cjs.raw, cjs.gz));
} else {
  console.log(`  ${CJS_FILE} absent — not gated, but the build should have produced it.`);
}

const pct = Math.round((esmGzTotal / ESM_GZIP_BUDGET_BYTES) * 100);
console.log(
  `\nGated: ESM gzipped total ${fmt(esmGzTotal)} B against a ${fmt(ESM_GZIP_BUDGET_BYTES)} B budget (${pct}% used).`,
);

if (esmGzTotal > ESM_GZIP_BUDGET_BYTES) {
  console.error(
    `::error::ESM gzipped total ${fmt(esmGzTotal)} B exceeds the ${fmt(ESM_GZIP_BUDGET_BYTES)} B budget ` +
      `(baseline ${fmt(ESM_GZIP_MEASURED_BYTES)} B at ${MEASURED_AT}).\n` +
      `If this growth is deliberate, re-measure, raise ESM_GZIP_BUDGET_BYTES in ` +
      `.github/scripts/assert-size.mjs and update REVIEW_READINESS.md §2 in the same commit. ` +
      `If it is not, check whether a dependency got inlined into the bundle.`,
  );
  process.exit(1);
}

console.log('Bundle size OK.');
