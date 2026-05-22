#!/usr/bin/env bash
# Phase 16 / L6-02: web Layer 4 smoke entry point.
#
# Wraps the demo app build + dev-server start for a Braze trial smoke
# pass. The actual walkthrough is in docs/SMOKE-TEST-PLAYBOOK.md §3;
# this script handles the env validation + dev-server lifecycle so the
# maintainer doesn't accidentally run against the mock server when
# they meant to hit real Braze.
#
# Usage:
#   BRAZE_API_KEY=<web-sdk-key> BRAZE_ENDPOINT=sdk.us-01.braze.com \
#     npm run smoke:web
#
# Optional env:
#   BRAZE_ENDPOINT  Defaults to sdk.iad-03.braze.com (Braze US-03 cluster).
#                   Override to match your trial workspace's cluster.

set -euo pipefail

if [ -z "${BRAZE_API_KEY:-}" ]; then
  echo "Error: BRAZE_API_KEY env var is required for the web smoke run." >&2
  echo "See docs/SMOKE-TEST-PLAYBOOK.md §1 to provision a trial key." >&2
  exit 1
fi

ENDPOINT="${BRAZE_ENDPOINT:-sdk.iad-03.braze.com}"

# Surface the values the demo's client.ts reads so the maintainer
# doesn't have to remember the Vite env-var convention.
export VITE_BRAZE_API_KEY="$BRAZE_API_KEY"
export VITE_BRAZE_ENDPOINT="$ENDPOINT"

echo "→ Starting demo web smoke against $ENDPOINT"
echo "→ Walk docs/SMOKE-TEST-PLAYBOOK.md §3 to capture wire format."
echo "→ Stop with Ctrl+C when done; results go in docs/smoke-tests/web-$(date -u +%Y-%m-%d).md"
echo

cd demo
npm install --silent
npm run build
exec npm run dev
