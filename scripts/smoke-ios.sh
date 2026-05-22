#!/usr/bin/env bash
# Phase 16 / L6-02: iOS Layer 4 smoke entry point.
#
# Wraps the demo app's iOS build + Xcode-open for a Braze trial smoke
# pass. The actual walkthrough is in docs/SMOKE-TEST-PLAYBOOK.md §4;
# this script handles the prereqs (env validation, cap sync, pod
# install) so the manual steps that follow are reproducible.
#
# Usage:
#   BRAZE_API_KEY=<ios-sdk-key> BRAZE_ENDPOINT=sdk.us-01.braze.com \
#     npm run smoke:ios
#
# Optional env:
#   BRAZE_ENDPOINT  Defaults to sdk.iad-03.braze.com.
#
# After this script finishes Xcode is open at the demo workspace.
# Walk SMOKE-TEST-PLAYBOOK.md §4, capture results in
# docs/smoke-tests/ios-YYYY-MM-DD.md.

set -euo pipefail

if [ -z "${BRAZE_API_KEY:-}" ]; then
  echo "Error: BRAZE_API_KEY env var is required for the iOS smoke run." >&2
  echo "See docs/SMOKE-TEST-PLAYBOOK.md §1 to provision a trial key." >&2
  exit 1
fi

ENDPOINT="${BRAZE_ENDPOINT:-sdk.iad-03.braze.com}"

export VITE_BRAZE_API_KEY="$BRAZE_API_KEY"
export VITE_BRAZE_ENDPOINT="$ENDPOINT"

echo "→ Preparing demo iOS smoke against $ENDPOINT"
echo "→ Note: the demo's AppDelegate.swift wires the iOS-specific key separately;"
echo "  edit demo/ios/App/App/AppDelegate.swift if you haven't already (one-time)."
echo

cd demo
npm install --silent
npm run build
npx cap sync ios

echo
echo "→ Opening Xcode. Build + run against your iOS simulator from there."
echo "→ Capture results in docs/smoke-tests/ios-$(date -u +%Y-%m-%d).md"
exec npx cap open ios
