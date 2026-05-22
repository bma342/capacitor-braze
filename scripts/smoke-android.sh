#!/usr/bin/env bash
# Phase 16 / L6-02: Android Layer 4 smoke entry point.
#
# Wraps the demo app's Android build + Android Studio open for a
# Braze trial smoke pass. Walkthrough in
# docs/SMOKE-TEST-PLAYBOOK.md §5.
#
# Usage:
#   BRAZE_API_KEY=<android-sdk-key> BRAZE_ENDPOINT=sdk.us-01.braze.com \
#     npm run smoke:android
#
# Optional env:
#   BRAZE_ENDPOINT  Defaults to sdk.iad-03.braze.com.
#
# After this script finishes Android Studio is open at the demo
# project. Walk SMOKE-TEST-PLAYBOOK.md §5, capture results in
# docs/smoke-tests/android-YYYY-MM-DD.md.

set -euo pipefail

if [ -z "${BRAZE_API_KEY:-}" ]; then
  echo "Error: BRAZE_API_KEY env var is required for the Android smoke run." >&2
  echo "See docs/SMOKE-TEST-PLAYBOOK.md §1 to provision a trial key." >&2
  exit 1
fi

ENDPOINT="${BRAZE_ENDPOINT:-sdk.iad-03.braze.com}"

export VITE_BRAZE_API_KEY="$BRAZE_API_KEY"
export VITE_BRAZE_ENDPOINT="$ENDPOINT"

echo "→ Preparing demo Android smoke against $ENDPOINT"
echo "→ Note: the demo's AndroidManifest.xml + braze.xml carry the"
echo "  Android-specific API key + endpoint; edit those if you haven't"
echo "  already (one-time setup per Braze's Android install guide)."
echo

cd demo
npm install --silent
npm run build
npx cap sync android

echo
echo "→ Opening Android Studio. Build + run against your emulator or"
echo "  device from there."
echo "→ Capture results in docs/smoke-tests/android-$(date -u +%Y-%m-%d).md"
exec npx cap open android
