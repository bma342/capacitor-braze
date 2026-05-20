# Smoke-test capture logs

This directory holds the per-platform capture logs from each pass of [`docs/SMOKE-TEST-PLAYBOOK.md`](../SMOKE-TEST-PLAYBOOK.md). One log per platform per pass; logs accumulate as a regression timeline.

## Adding a new log

1. Pick the matching template:
   - `_template-web.md`
   - `_template-ios.md`
   - `_template-android.md`
2. Copy to `<platform>-YYYY-MM-DD.md` (use today's date, ISO format).
3. Walk the playbook for that platform. Fill in the template as you go.
4. Drop the file in this directory and link it from the PR titled `chore: smoke-test pass for vX.Y.Z`.

## Why pre-staged templates exist

Captures with consistent structure make cross-platform field-shape drift trivial to spot. The four "Captures" entries (`logCustomEvent` body, `setDateOfBirth` body, `FeatureFlag` DTO, `ContentCard` DTO) are the highest-leverage data the smoke produces; if iOS emits `"dob":"1987-07-14"` while web emits `"dob":"1987-7-14"`, the diff jumps out immediately when both logs use the same template.

Templates also encode the prereq env block so each pass doesn't have to re-derive what trial workspace + API key + endpoint + plugin/Capacitor versions are in play.
