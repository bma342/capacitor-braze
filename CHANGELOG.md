# Changelog

All notable changes to `capacitor-braze` are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pre-1.0: minor versions may include breaking changes (documented loudly here). Post-1.0: strict semver.

## [Unreleased]

### Pinned native SDK versions
- `com.braze:android-sdk-ui` — **42.2.0**
- `BrazeKit` / `BrazeUI` — **14.1.0**
- `@braze/web-sdk` — peer dep `^6.0.0`

## [0.0.1] — 2026-05-19

Initial scaffold. Not published to npm yet.

### Added
- Plugin scaffolding for Capacitor 6+ (iOS, Android, Web).
- `echo({ value })` method working end-to-end on all three platforms (bridge sanity check).
- TypeScript interface for `initialize({ apiKey, endpoint, ... })` — bridges defined; web impl wraps `@braze/web-sdk`; native impls store config (real Braze SDK init wiring lands in 0.0.2).
- Strategic documentation: `PLAN.md`, `SDK_SURFACE.md`, `SECURITY.md`, `REVIEW_READINESS.md`, `CLAUDE.md`.
- MIT license.
- Braze SDK dependencies declared in `android/build.gradle` and `BrazePlugin.podspec`.

### Notes
- This is a scaffolding release. Functional Braze methods (`changeUser`, `logCustomEvent`, etc.) ship in 0.1.0 per [`PLAN.md` §7](./PLAN.md#7-phased-roadmap).
