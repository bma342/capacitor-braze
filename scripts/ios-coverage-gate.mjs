#!/usr/bin/env node
// iOS coverage ratchet for the Swift bridge (C11 "Coverage", C09 gates table).
//
// Reads the coverage `xcodebuild test -enableCodeCoverage YES` recorded in a
// result bundle, keeps only the plugin's own sources (`ios/Sources/BrazePlugin/
// *.swift`), and fails when their line or function coverage drops below the
// floors below. It is the Swift half of the ratchet whose web half lives in
// test/web/vitest.config.ts and whose Kotlin half is `jacocoCoverageVerification`
// in android/build.gradle.
//
// Usage (after the demo's XCTest run, see C11):
//
//   xcodebuild test -workspace App.xcworkspace -scheme App \
//     -destination 'platform=iOS Simulator,name=iPhone 17,OS=latest' \
//     -enableCodeCoverage YES -resultBundlePath /tmp/tests.xcresult \
//     CODE_SIGNING_ALLOWED=NO
//   node scripts/ios-coverage-gate.mjs /tmp/tests.xcresult [--out <dir>]
//
// `--out <dir>` also writes the raw `xccov` JSON report and the per-file
// summary there, for CI to upload as an artifact.
//
// Why filter by path instead of by target: the demo links the pods statically
// (see demo/ios/App/Podfile), so the plugin's object code lands inside
// `App.app` and `xccov` may attribute it to that target rather than to a
// `CapacitorBraze` one. The source path is the one thing that does not move.
//
// Every `.swift` file in ios/Sources/BrazePlugin/ must appear in the report.
// A file that is missing means instrumentation silently stopped reaching the
// plugin — the gate fails on that rather than averaging over what is left,
// because a coverage gate that can pass on an empty report is not a gate.
//
// Dependency-free on purpose: node builtins + `xcrun xccov`, both already on
// the macOS runner.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Measured 2026-09-28 at 0.3.0 (50 XCTests, 1 skipped), Xcode 26.6, iPhone 17
// simulator: lines 908/1551 = 58.54%, functions 80/155 = 51.61%
// (BrazePlugin.swift 760/1338 lines, BrazeIAMDelegate.swift 148/213). See
// docs/TEST-COVERAGE-AUDIT.md. Floors are the measured value rounded down to
// the whole percent. They are a RATCHET: raise
// them when coverage improves, and never lower them to turn a red build green —
// add the test instead.
const MIN_LINE_PERCENT = 58;
const MIN_FUNCTION_PERCENT = 51;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES_DIR = join(REPO_ROOT, 'ios', 'Sources', 'BrazePlugin');
const SOURCES_MARKER = '/ios/Sources/BrazePlugin/';

function fail(message) {
  console.error(`::error::ios-coverage-gate: ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outDir = outIndex === -1 ? null : args[outIndex + 1];
if (outIndex !== -1 && !outDir) fail('`--out` needs a directory.');
const positional = outIndex === -1 ? args : args.filter((_, i) => i !== outIndex && i !== outIndex + 1);
if (positional.length !== 1) {
  fail('usage: node scripts/ios-coverage-gate.mjs <path/to/tests.xcresult> [--out <dir>]');
}
const bundle = resolve(positional[0]);

let raw;
try {
  raw = execFileSync('xcrun', ['xccov', 'view', '--report', '--json', bundle], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
} catch (error) {
  fail(
    `\`xcrun xccov view --report --json ${bundle}\` failed — was the test run passed ` +
      `\`-enableCodeCoverage YES -resultBundlePath ${bundle}\`?\n${error.message}`,
  );
}

let report;
try {
  report = JSON.parse(raw);
} catch (error) {
  fail(`xccov did not return JSON: ${error.message}`);
}

// The same source can be listed under more than one target (a static pod is
// compiled into its own library and then linked into the host). Keep one entry
// per path: the one with the most executed lines, which is the linked copy the
// tests actually ran.
const byPath = new Map();
for (const target of report.targets ?? []) {
  for (const file of target.files ?? []) {
    if (typeof file.path !== 'string' || !file.path.includes(SOURCES_MARKER)) continue;
    if (!file.path.endsWith('.swift')) continue;
    const previous = byPath.get(file.path);
    if (!previous || file.coveredLines > previous.file.coveredLines) {
      byPath.set(file.path, { target: target.name, file });
    }
  }
}

const expected = readdirSync(SOURCES_DIR)
  .filter((name) => name.endsWith('.swift'))
  .sort();
const missing = expected.filter((name) => ![...byPath.keys()].some((path) => path.endsWith(`/${name}`)));
if (missing.length > 0) {
  fail(
    `no coverage recorded for ${missing.join(', ')}. The report lists ` +
      `${(report.targets ?? []).map((t) => t.name).join(', ') || 'no targets'}. ` +
      'Check that the scheme gathers coverage (scripts/ios-add-test-target.rb sets ' +
      'codeCoverageEnabled) and that the run passed -enableCodeCoverage YES.',
  );
}

const rows = [];
let coveredLines = 0;
let executableLines = 0;
let coveredFunctions = 0;
let totalFunctions = 0;
for (const [path, { target, file }] of [...byPath.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const functions = file.functions ?? [];
  const fnCovered = functions.filter((fn) => fn.executionCount > 0).length;
  coveredLines += file.coveredLines;
  executableLines += file.executableLines;
  coveredFunctions += fnCovered;
  totalFunctions += functions.length;
  rows.push({
    file: path.slice(path.indexOf(SOURCES_MARKER) + 1),
    target,
    lines: `${file.coveredLines}/${file.executableLines}`,
    linePercent: pct(file.coveredLines, file.executableLines),
    functions: `${fnCovered}/${functions.length}`,
    functionPercent: pct(fnCovered, functions.length),
  });
}

function pct(covered, total) {
  return total === 0 ? 100 : Math.round((covered / total) * 10000) / 100;
}

const linePercent = pct(coveredLines, executableLines);
const functionPercent = pct(coveredFunctions, totalFunctions);

const lines = [
  'iOS bridge coverage (xccov, ios/Sources/BrazePlugin/)',
  '',
  ...rows.map(
    (r) =>
      `  ${r.file.padEnd(46)} lines ${r.lines.padStart(9)} ${String(r.linePercent).padStart(6)}%` +
      `   functions ${r.functions.padStart(7)} ${String(r.functionPercent).padStart(6)}%   [${r.target}]`,
  ),
  '',
  `  TOTAL lines     ${coveredLines}/${executableLines} = ${linePercent}%  (floor ${MIN_LINE_PERCENT}%)`,
  `  TOTAL functions ${coveredFunctions}/${totalFunctions} = ${functionPercent}%  (floor ${MIN_FUNCTION_PERCENT}%)`,
];
const summary = lines.join('\n');
console.log(summary);

if (outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'xccov-report.json'), raw);
  writeFileSync(join(outDir, 'coverage-summary.txt'), `${summary}\n`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  writeFileSync(process.env.GITHUB_STEP_SUMMARY, `\`\`\`\n${summary}\n\`\`\`\n`, { flag: 'a' });
}

const failures = [];
if (linePercent < MIN_LINE_PERCENT) {
  failures.push(`line coverage ${linePercent}% is below the ${MIN_LINE_PERCENT}% floor`);
}
if (functionPercent < MIN_FUNCTION_PERCENT) {
  failures.push(`function coverage ${functionPercent}% is below the ${MIN_FUNCTION_PERCENT}% floor`);
}
if (failures.length > 0) {
  fail(`${failures.join('; ')}. Add tests; do not lower the floor (C11).`);
}
console.log('\niOS coverage ratchet: OK');
