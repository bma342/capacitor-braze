#!/usr/bin/env node
// A4-20 / A5-20 — tarball manifest gate.
//
// Runs `npm pack --dry-run --json --ignore-scripts` and asserts the published
// file list both CONTAINS everything a consumer's build needs and EXCLUDES
// everything that is repo-internal. Nothing else in CI would catch a `files`
// regression in package.json before it reaches npm consumers.
//
// Note on stdout hygiene: `npm pack` runs `prepack`/`prepare` (i.e. the full
// build) and, at least on npm 10/11, does so even under `--ignore-scripts`.
// Both `tsc` (diagnostics) and `@capacitor/docgen` (a "DocGen Output" line)
// write to stdout, so the JSON manifest is not the only thing there. We
// therefore slice from the first line that is a bare `[` or `{` rather than
// parsing the whole stream.
//
// Usage:
//   node .github/scripts/assert-pack.mjs                  # runs npm pack itself
//   node .github/scripts/assert-pack.mjs <pack.json>      # reads a saved manifest

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Consumer-required artifacts. Each entry is an exact published path.
//   - CapacitorBraze.podspec + ios/Plugin/PrivacyInfo.xcprivacy: the podspec
//     declares the manifest via resource_bundles; a missing manifest is an
//     App Store review problem, not a build error, so it must be asserted.
//   - android/consumer-rules.pro: referenced by consumerProguardFiles; absent,
//     R8 strips the bridge in consumer release builds.
//   - dist/esm/index.d.ts: the "types" entry point.
const MUST_CONTAIN = [
  'LICENSE',
  'README.md',
  'CHANGELOG.md',
  'SECURITY.md',
  'CapacitorBraze.podspec',
  'ios/Plugin/PrivacyInfo.xcprivacy',
  'android/consumer-rules.pro',
  'dist/esm/index.d.ts',
];

// Repo-internal trees that must never ship. Prefix match on the published
// path. `dist/docs.json` is fine and deliberately not matched by 'docs/'.
const MUST_NOT_CONTAIN_PREFIXES = ['test/', 'example/', 'demo/', 'findings/', 'docs/', '.claude/'];

const [, , packJsonPath] = process.argv;

let raw;
try {
  raw = packJsonPath
    ? readFileSync(packJsonPath, 'utf8')
    : execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      });
} catch (err) {
  console.error(`::error::could not obtain the npm pack manifest: ${String(err)}`);
  process.exit(1);
}

/** Drop any build-script chatter that precedes the JSON document on stdout. */
function extractJson(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === '[' || l.trim() === '{');
  return start === -1 ? text : lines.slice(start).join('\n');
}

let parsed;
try {
  parsed = JSON.parse(extractJson(raw));
} catch (err) {
  console.error(`::error::npm pack did not emit a parseable JSON manifest: ${String(err)}`);
  console.error(raw.slice(0, 2000));
  process.exit(1);
}

// `npm pack --json` emits an array with one entry per packed tarball.
const entry = Array.isArray(parsed) ? parsed[0] : parsed;
const files = (entry?.files ?? []).map((f) => f.path);

if (files.length === 0) {
  console.error('::error::npm pack reported zero files — the manifest could not be read.');
  process.exit(1);
}

const failures = [];

for (const required of MUST_CONTAIN) {
  if (!files.includes(required)) {
    failures.push(`missing required file: ${required}`);
  }
}

for (const prefix of MUST_NOT_CONTAIN_PREFIXES) {
  const leaked = files.filter((f) => f.startsWith(prefix));
  if (leaked.length > 0) {
    failures.push(`repo-internal path(s) leaked under "${prefix}": ${leaked.slice(0, 10).join(', ')}`);
  }
}

console.log(`npm pack manifest: ${files.length} files, ${entry.size} bytes packed.`);

if (failures.length > 0) {
  for (const f of failures) {
    console.error(`::error::${f}`);
  }
  console.error('\nFull manifest:');
  for (const f of files) {
    console.error(`  ${f}`);
  }
  process.exit(1);
}

console.log('Tarball manifest OK (all required files present, no internal paths leaked).');
