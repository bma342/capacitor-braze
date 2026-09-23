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

Every artifact in [C01's lockstep checklist](../docs/mdcs/C01-METHOD-ANATOMY.md#the-lockstep-checklist)
must be touched in this PR — that section is the canonical list, and the boxes below mirror it.
Drift = bug. Note that **CI does not catch a missing native implementation or missing tests**; this
checklist is the control.

- [ ] `src/definitions.ts` — type signature + JSDoc with `@example`
- [ ] `src/web.ts` — web implementation wrapping `@braze/web-sdk`
- [ ] `ios/Plugin/BrazePlugin.swift` — iOS bridge via BrazeKit
- [ ] `ios/Plugin/BrazePlugin.m` — `CAP_PLUGIN_METHOD` registration
- [ ] `android/src/main/java/com/bma342/braze/BrazePlugin.kt` — Android bridge
- [ ] `test/web/src/<area>.test.ts` — asserts the **wire output** and the validation rejections, not just that the call resolved
- [ ] `android/src/test/.../BrazePluginContractTest.kt` — validation branches byte-exact against `src/web.ts`
- [ ] `ios/PluginTests/BrazePluginContractTests.swift` — the XCTest equivalent (re-run `ruby scripts/ios-add-test-target.rb` and commit the project if you added a *file*)
- [ ] `example/index.html` + `example/src/main.ts` — UI and handler dispatch
- [ ] `SDK_SURFACE.md` — shipped list + coverage matrix updated
- [ ] `CHANGELOG.md` — entry under `[Unreleased]`

## Security review (per SECURITY.md)

- [ ] No plugin log line carries a consumer-supplied value, at any level
- [ ] Error strings name the field, never the value — or the case is on [C04's sanctioned-divergence list](../docs/mdcs/C04-VALIDATION.md) / C06's closed-enum exemption
- [ ] Error strings are byte-identical across web, iOS and Android
- [ ] No new attack surface that bypasses existing defaults
- [ ] `enableLogging` still defaults to `false` **and the `false` branch still silences the SDK on all three platforms**
- [ ] `allowInsecureEndpoint` still defaults to `false`, checked with strict `=== true`
- [ ] No `postinstall` script added to `package.json` (`prepare` exists and runs on git-URL installs only)
- [ ] No real API keys in any file (including `.env.example`)
- [ ] Any claim added to `SECURITY.md` describes behaviour that exists today

## Verification

- [ ] `npm run build` clean, and the README docgen block regenerated if `src/definitions.ts` changed
- [ ] `npm test` passes (205 web tests), and `npm --prefix test/web run test:coverage` still meets the `src/web.ts` thresholds
- [ ] `./gradlew :capacitor-braze:testDebugUnitTest` passes (if Android-affecting)
- [ ] `xcodebuild test` passes (if iOS-affecting)
- [ ] `npm run lint` and `npm run typecheck:tests` clean (ESLint runs with `--max-warnings=0`)
- [ ] `node .github/scripts/assert-size.mjs` passes after a build, if `src/**` changed
- [ ] CI green (linked in this PR)
- [ ] Tested by hand in the example app (`cd example && npm run dev`)
- [ ] Tested against a real Braze trial — **or stated in the Summary that you could not**, which is currently the normal case: no release has been validated against a live Braze backend
