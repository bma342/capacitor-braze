# C08 — Native SDK pinning & bump protocol

**Native SDK versions are pinned exactly, never as ranges. The plugin promises consumers the exact iOS, Android, and Web SDK versions it has been validated against. Bumping any of the three is a deliberate, recorded act.**

The CI pipeline catches build-time breakage. Layer 4 smoke testing catches runtime breakage. Neither catches a silent shift in SDK behavior that a range pin would let through.

---

## Rule

Native SDK pins live in three files and follow three different conventions imposed by their package managers:

| Platform | File | Form | Current pin |
|---|---|---|---|
| iOS | [`BrazePlugin.podspec`](../../BrazePlugin.podspec) | `s.dependency 'BrazeKit', '14.1.0'` (exact) | **14.1.0** |
| Android | [`android/build.gradle`](../../android/build.gradle) | `implementation 'com.braze:android-sdk-ui:42.2.0'` (exact) | **42.2.0** |
| Web | [`package.json`](../../package.json) | `peerDependencies: { "@braze/web-sdk": "^6.0.0" }` (caret range) | **^6.0.0** |

iOS and Android are exact pins. Web is a caret range (`^6.0.0`) because the package is a peer dependency the consumer installs themselves — the plugin can't force a precise version on the consumer's npm tree without breaking other Capacitor plugins they may have. The caret allows non-breaking SDK updates to flow without a plugin republish.

This asymmetry is intentional. The two native pins are validated end-to-end every plugin release. The web pin trusts the SDK's SemVer.

## Rationale

Three reasons for exact pins on native:

1. **Layer 4 smoke testing only validates one version.** When we run the example app against real Braze, the build is locked to one combination of plugin code + iOS SDK + Android SDK + Web SDK. A range pin would mean "this plugin works against some version in this range" — which is a claim we haven't tested.
2. **Braze SDK minor versions occasionally ship behavior changes the API doesn't capture.** Per the [`braze-swift-sdk` CHANGELOG](https://github.com/braze-inc/braze-swift-sdk/blob/main/CHANGELOG.md), behavior fixes ("X now triggers Y in case Z") regularly ship inside non-breaking version bumps. A range pin would let those changes through silently, with no opportunity for the plugin to update docs or migrate consumers.
3. **Consumer debugging gets harder with ranges.** "Plugin 0.0.8 + BrazeKit 14.1.0" is a reproducible bug report. "Plugin 0.0.8 + BrazeKit 14.x" is a triage exercise.

The web peer-dep range is the deliberate counterpoint. Web SDKs ship in the consumer's npm tree, not the plugin's. Forcing exact alignment would mean every plugin patch release also republished the peer dep, defeating the point of peer dependencies.

---

## Where the pins are documented

Each pin is documented in three places, with a comment pointing at this MDC:

1. **The manifest file** (`.podspec`, `build.gradle`, `package.json` peerDependencies). One-line comment cross-references [`SDK_SURFACE.md §4`](../../SDK_SURFACE.md) — the user-facing pinning policy.
2. **`CHANGELOG.md`'s `[Unreleased]` section** lists the active pins under "Pinned native SDK versions". Every release inherits this block.
3. **`docs/mdcs/README.md`** lists C08 in its index, so a contributor finds the policy from the MDC set.

The three locations are duplicative on purpose. Changing the pin in one place without the others is the most common drift source; CI does not catch it because the manifest pins still build.

---

## Bump protocol

When Braze ships a new SDK that the plugin should adopt:

1. **Read the upstream changelog.** Look for behavior changes inside the version bump. BrazeKit and the Android SDK have published changelogs — read them top to bottom, not just the breaking-change section. Behavior changes that aren't called out as breaking are exactly the class of thing the exact pin protects consumers from.
2. **Branch from `main`.** Don't bump on `main` directly.
3. **Update the pin in the relevant manifest.** One platform per branch is fine; coordinating all three is also fine, but don't bundle a major Android bump with a minor iOS bump unless they ship together upstream.
4. **Update [`SDK_SURFACE.md §1`](../../SDK_SURFACE.md)** capability table if the bump adds new SDK surface. If it just changes behavior, no SDK_SURFACE change.
5. **Update CHANGELOG.md** under `[Unreleased]` → `Changed`. Note the upstream version, what changed in the upstream changelog that's relevant, and any consumer migration steps.
6. **Run the full CI matrix locally.** `npm run build` from repo root + `npm run build` in `example/`. CI runs both on push.
7. **Run Layer 4 smoke against a real Braze trial account.** This is the only step that catches a behavior change the upstream changelog didn't surface. See [`PLAN.md §5`](../../PLAN.md) for the smoke-test process.
8. **Decide the plugin version bump:**
   - If the upstream bump is a patch (no API change, behavior fix only): plugin patch bump.
   - If the upstream bump is a minor (new SDK surface, no breaks): plugin minor bump if you're exposing the new surface, else plugin patch bump.
   - If the upstream bump is a major (breaking changes): plugin major bump always. Document the migration in the CHANGELOG with a `BREAKING:` line.
9. **Open the PR with the upstream changelog excerpt in the description.** Reviewer should be able to see what changed upstream without leaving the PR.
10. **After merge, tag and publish per the [release section in CLAUDE.md](../../CLAUDE.md#release-process).**

## Bumping the Web SDK peer dep range

The Web SDK uses a caret range, not an exact pin. Bumping the *range* is different from bumping an *exact pin*:

- **Widen the range** (e.g. `^6.0.0` → `^6.0.0 || ^7.0.0`) only after Layer 4 smoke against both versions passes.
- **Bump the floor** (e.g. `^6.0.0` → `^6.1.0`) when the plugin starts using a method the older range didn't include. This is a plugin minor bump.
- **Replace the range** (e.g. `^6.0.0` → `^7.0.0`) when the upstream SDK ships a major version with breaking changes. This is a plugin major bump.

When in doubt, treat the Web peer dep with the same care as the native pins.

## What doesn't count as a bump

Some changes look like they touch SDK pinning but don't:

- **Plugin code change that calls a method introduced in the same SDK version we already pin to.** Not a bump. Document in CHANGELOG under `Added` for the new plugin method.
- **Adding a CI matrix row to test against a newer SDK version we don't yet ship to.** Not a bump. The pin in the manifest is what matters.
- **Documentation updates that mention a newer SDK exists.** Not a bump. The pin's authority is the manifest.

## CI and the daily spec-drift job

[`PLAN.md §5`](../../PLAN.md) describes the daily spec-drift CI job that runs against real Braze and catches REST API changes. **This job does not catch SDK changes.** SDK changes are caught by subscribing to upstream changelogs and running the bump protocol when one ships.

If you maintain the plugin, you are also responsible for watching the [BrazeKit](https://github.com/braze-inc/braze-swift-sdk/releases) and [Braze Android SDK](https://github.com/braze-inc/braze-android-sdk/releases) release feeds. The Web SDK doesn't have a public release feed at the repo level; check npm or the Braze docs site quarterly.

## Forbidden

- **Range pins on native SDKs.** `s.dependency 'BrazeKit', '~> 14.0'` looks innocent but routinely lets behavior changes through. Use exact pins.
- **Updating one pin without the others when the upstream change is cross-platform.** If Braze ships a CHANGELOG entry that affects both iOS and Android (e.g. consent-API parity), bump both in the same PR. Tracker drift here is the worst kind.
- **Bumping a pin without running Layer 4 smoke.** CI green isn't enough; behavior changes only surface against real Braze.
- **Bumping a pin in a patch release across a Braze SDK major version boundary.** Plugin major bump only. This will surface as "I upgraded the plugin and my push handler broke" in support tickets if you skip it.
- **Letting the pin drift behind the upstream LTS line for more than two minor versions.** Braze drops support for older SDK versions on a published schedule; plugin support has to follow.
- **Committing an SDK pin bump without the CHANGELOG entry.** The CHANGELOG is the only durable consumer-facing record of which SDK version each plugin release was validated against.
