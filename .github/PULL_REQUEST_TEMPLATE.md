<!--
Thanks for contributing! Please walk through this checklist before requesting review.

If this is a substantial change (new public method, new behavior, security implication),
also consider opening an issue first to align on the design.
-->

## Summary

<!-- One paragraph: what changed, why. Refer to PLAN.md or SDK_SURFACE.md if relevant. -->

## Type of change

- [ ] Bug fix (non-breaking)
- [ ] New method or capability (per SDK_SURFACE.md roadmap)
- [ ] Documentation only
- [ ] Refactor (no behavior change)
- [ ] Breaking change (please describe migration path in CHANGELOG)

## Method-addition checklist (if applicable)

When adding a new plugin method, all four bridge surfaces must be touched in
this PR. Drift = bug.

- [ ] `src/definitions.ts` — type signature + JSDoc with `@example`
- [ ] `src/web.ts` — web implementation wrapping `@braze/web-sdk`
- [ ] `ios/Plugin/BrazePlugin.swift` — iOS bridge via BrazeKit
- [ ] `ios/Plugin/BrazePlugin.m` — `CAP_PLUGIN_METHOD` registration
- [ ] `android/src/main/java/com/bma342/braze/BrazePlugin.kt` — Android bridge
- [ ] `example/index.html` — UI for the new method
- [ ] `example/src/main.ts` — handler dispatch
- [ ] `SDK_SURFACE.md` — coverage matrix updated
- [ ] `CHANGELOG.md` — entry under `[Unreleased]`

## Security review (per SECURITY.md)

- [ ] No PII logged at any level
- [ ] No new attack surface that bypasses existing defaults
- [ ] `enableLogging` still defaults to `false`
- [ ] `allowInsecureEndpoint` still defaults to `false`
- [ ] No `postinstall` scripts added to `package.json`
- [ ] No real API keys in any file (including `.env.example`)

## Verification

- [ ] `npm run build` clean
- [ ] CI green (linked in this PR)
- [ ] Tested on web (`cd example && npm run dev`)
- [ ] Tested on iOS device or simulator (if iOS-affecting)
- [ ] Tested on Android device or emulator (if Android-affecting)
- [ ] Tested against real Braze trial (if behavior-affecting)
