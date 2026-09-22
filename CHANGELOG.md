# Changelog

All notable changes to `capacitor-braze` are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pre-1.0: minor versions may include breaking changes (documented loudly here). Post-1.0: strict semver.

## [Unreleased]

Nothing yet.

## [0.3.0] — Unreleased — Capacitor 8 and Swift Package Manager

`0.2.0` capped at Capacitor 7, which meant two things for anyone on a current Capacitor project:
`npm install` conflicted on the peer dependency, and even if you forced past it, `npx cap add ios`
on Capacitor 8 generates a **Swift Package Manager** project that a CocoaPods-only plugin cannot
install into. This release fixes both, without dropping Capacitor 6 or 7 and without dropping
CocoaPods.

### Pinned native SDK versions

Unchanged from 0.2.0 — no Braze SDK moved in this release:

- `com.braze:android-sdk-ui` **43.2.0**
- `BrazeKit` / `BrazeUI` **18.2.1** — **requires Xcode 26+**. Now pinned in **two** manifests:
  `CapacitorBraze.podspec` (CocoaPods) and `Package.swift` (`exact: "18.2.1"`, SPM). Per
  [C08](./docs/mdcs/C08-NATIVE-SDK-PINNING.md) they move together, always.
- `@braze/web-sdk` peer dep **`^6.13.0`**

### Capacitor compat

- Peer dependency: `@capacitor/core` **`^6.0.0 || ^7.0.0 || ^8.0.0`** (was `^6.0.0 || ^7.0.0`)
- Podspec dependency: `Capacitor` **`>= 6.0, < 9.0`** (was `>= 6.0, < 8.0`)
- `Package.swift`: `capacitor-swift-pm` **`"6.0.0"..<"9.0.0"`** — a bounded range, not `from:`, so
  Capacitor 9 cannot absorb consumers' installs before anyone has built against it
- `demo/` and `example/` both run **Capacitor 8.5.2**; Capacitor **6.2.2** and **7.6.9** are built
  every PR by the new `verify-capacitor-compat-*` jobs (below), so the advertised range and the
  built range are now the same range

### Added

- **Swift Package Manager support.** A root [`Package.swift`](./Package.swift) (swift-tools 5.9)
  exposes the library `CapacitorBraze`, depending on `capacitor-swift-pm` and `braze-swift-sdk`
  (products `BrazeKit` + `BrazeUI`). On Capacitor 8 there is nothing for you to configure:
  `npx cap sync ios` writes the plugin into your app's generated `ios/App/CapApp-SPM/Package.swift`
  and Xcode resolves BrazeKit/BrazeUI transitively. `PrivacyInfo.xcprivacy` ships as an SPM target
  resource, so the privacy manifest is present on both install paths.
- **`example/ios` is now a committed Capacitor 8 SPM project** (`cap add ios --packagemanager SPM`),
  built in CI by `verify-ios`. Between it and `demo/ios` (CocoaPods), every cell of the
  Pods × SPM matrix compiles on every PR.
- **A support matrix in [C10](./docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md#the-support-matrix-030)**
  in which every cell is a named CI job, plus a Capacitor range policy in
  [C08](./docs/mdcs/C08-NATIVE-SDK-PINNING.md) covering what widening to Capacitor 9 will require.
- **Capacitor 6 and 7 are now built by CI, not merely allowed by the manifests.** Two new jobs —
  `verify-capacitor-compat-android` (ubuntu) and `verify-capacitor-compat-ios` (macOS), each a
  matrix over majors 6 and 7 — run [`scripts/compat-app.sh`](./scripts/compat-app.sh), which
  scaffolds a throwaway copy of `example/` against the **latest release of that major**, applies
  exactly the consumer edits C10 documents, builds it (CocoaPods *and* SPM on iOS, Gradle on
  Android) and then asserts the bridge actually shipped: `_OBJC_CLASS_$_BrazePlugin` linked into
  `App.debug.dylib`, `Lcom/bma342/braze/BrazePlugin;` in the APK's dex. Verified at Capacitor
  **6.2.2** and **7.6.9**. Because the script resolves the major at run time, a newly published
  6.x/7.x that breaks the plugin turns CI red without a commit behind it — deliberate.

### Changed

- **Android: no Gradle edits are required on Capacitor 8.** Its stock template ships AGP 8.13.0,
  Gradle 8.14.3, compileSdk 36, minSdk 24 and JDK 21, all above the floors Braze's transitive
  androidx dependencies impose. The three edits the README demanded through 0.2.0 now apply only to
  Capacitor **6** projects — Capacitor 7's template clears the floors too (see below).
- The plugin's own standalone Android defaults move to Capacitor 8's: AGP **8.13.0** (was 8.6.0),
  Kotlin **2.2.20** (was 2.2.0), compileSdk **36** (was 35), targetSdk **36** (was 35), minSdk **24**
  (was 22). Every one is still read from `rootProject.ext` first, so a Capacitor 6/7 consumer's
  `variables.gradle` keeps overriding them.
- The library still emits **JVM 17 bytecode**. This was verified rather than assumed: the demo's
  `:app:assembleDebug` links the JVM-17 plugin AAR against Capacitor 8's Java-21
  `:capacitor-android` and succeeds.
- `verify-android` installs `platforms;android-36` / `build-tools;36.0.0`; `verify-ios` builds the
  SPM leg in addition to the Pods leg. `test.yml` is now **11 jobs**, and because `release.yml`
  gates publishing on the whole workflow via `workflow_call`, the compat matrix gates releases too.
- **The Capacitor 6/7 Android edit list is shorter and more accurate than 0.2.0's docs said.**
  Capacitor **7** needs *no* Android edits at all — its template's AGP 8.7.2 / Gradle 8.11.1 /
  compileSdk 35 already clear every Braze floor. Capacitor **6** needs three (Gradle wrapper 8.7,
  AGP 8.6.0, compileSdk 35) and **not** the Kotlin-plugin classpath bump the README and C10 used to
  demand: the plugin puts `kotlin-gradle-plugin:2.2.20` on its own buildscript classpath, and
  Capacitor's app template declares none. Both corrections come from the new compat builds.
- **C10 now documents the SPM path on Capacitor 6/7**, whose one non-obvious requirement is that the
  **App target's** `IPHONEOS_DEPLOYMENT_TARGET` must be 15.0 before `cap sync` — the CLI derives the
  generated `CapApp-SPM/Package.swift`'s platform from the pbxproj, and that file is regenerated on
  every sync, so editing it is not a fix.
- Dependabot no longer ignores `@capacitor/*` majors. The ignore rule existed because the plugin
  capped at Capacitor 7; now that it tracks current Capacitor, the rule only hid drift. Majors are
  still maintainer-verified via CI rather than auto-merged.

### BREAKING

Pre-1.0, breaking changes ship in a minor. Consumers installing from npm are unaffected by all
three; these matter to forks, patches and anyone who vendored the source.

- **`ios/Plugin/BrazePlugin.m` is deleted.** A Swift Package Manager target cannot mix Swift and
  Objective-C sources, so the 35 `CAP_PLUGIN_METHOD` registrations became `CAPBridgedPlugin`
  conformance (`identifier` / `jsName` / `pluginMethods`) inside `BrazePlugin.swift`. **This is not
  a Capacitor 8-only mechanism** — `CAPBridgedPlugin.h` and `CapacitorBridge.registerPlugins()`'s
  `as? (CAPPlugin & CAPBridgedPlugin).Type` check are byte-identical in the Capacitor 6.2.2, 7.6.9
  and 8.5.2 iOS runtimes, and `@capacitor/cli`'s `findPluginClasses` discovers the class from the
  `@objc(BrazePlugin)` attribute in both the 6.x and 8.x CLIs. Verified end to end: the
  `capacitor.config.json` written by `cap sync ios` still lists `packageClassList: ["BrazePlugin"]`
  with no `.m` present. If you patch or vendor the bridge, move your method registration.
- **iOS sources moved to Capacitor's conventional SPM layout**: `ios/Plugin/*.swift` →
  `ios/Sources/BrazePlugin/*.swift`, `ios/PluginTests/` → `ios/Tests/BrazePluginTests/`, and
  `PrivacyInfo.xcprivacy` moved with them. The podspec's `source_files`, the package's `files`
  list, `.swiftlint.yml` and `scripts/ios-add-test-target.rb` were all updated in the same commit,
  so an npm install sees no difference — a `patch-package` diff or a `:path` Podfile reference will.
- **Consumer toolchain floors, for a Capacitor 8 project**: **JDK 21** and **AGP 8.13 / Gradle
  8.14.3 / compileSdk 36 / minSdk 24** on Android, **Xcode 26** on iOS. All four come from Capacitor
  8 itself, so upgrading Capacitor is what imposes them, not this plugin — but they are consumer
  requirements either way and [C10](./docs/mdcs/C10-CONSUMER-INTEGRATION-REQUIREMENTS.md) records
  them. `minSdk` rising from 22 to 24 drops Android 5.1 devices for consumers who take Capacitor 8's
  default; a Capacitor 6/7 consumer's own `variables.gradle` still wins.

### Known limitations

- **The Capacitor 6/7 compat jobs compile and link the bridge; they do not run the native tests.**
  `demo/`'s richer flows and the 35 iOS / 91 Android tests still only run against Capacitor 8. A
  behavioural difference between majors inside the bridge would not be caught.
- **`use_frameworks! :linkage => :static` and `platform :ios, '15.0'` remain mandatory Podfile edits
  on every major that uses CocoaPods**, including Capacitor 8 when you opt out of SPM. The plugin
  cannot apply them for you; C10 explains why each is non-optional.
- **Still no Layer 4 smoke against a live Braze backend**, exactly as at 0.2.0.

## [0.2.0] — 2026-09-22 — Native SDK bumps, real native test tiers, and an audited release pipeline

The second full-repo self-audit ([`docs/audits/2026-09/`](./docs/audits/2026-09/)) went over the TypeScript contract, both native bridges, the security model, the test/CI surface, the docs, and the SDK drift since 0.1.0. This release closes what it found. Three themes:

1. **The native SDKs moved a long way.** BrazeKit/BrazeUI 14.1.0 → 18.2.1 and `com.braze:android-sdk-ui` 42.2.0 → 43.2.0, plus a security floor on `@braze/web-sdk`.
2. **Whole features were wired but dead.** iOS `sdkAuthError` was attached to the wrong delegate protocol and never fired. Android never opened a Braze session, so every event was logged outside one. `enableLogging: false` silenced nothing on either native platform.
3. **The gates were softer than the docs claimed.** SwiftLint had never run, Android Lint could not fail a build, the iOS XCTests had no target, the Snyk step could never execute (it is now removed rather than repaired), there was no SAST and no enforced bundle budget, coverage was a hand-maintained markdown table, and `npm publish` ran on a tag with no tests in front of it.

### Pinned native SDK versions
- `com.braze:android-sdk-ui` **43.2.0** (from 42.2.0)
- `BrazeKit` / `BrazeUI` **18.2.1** (from 14.1.0) — **requires Xcode 26+**
- `@braze/web-sdk` peer dep **`^6.13.0`** (from `^6.0.0`)

### Capacitor compat
- Peer dependency: `@capacitor/core` `^6.0.0 || ^7.0.0` — unchanged
- Podspec dependency: `Capacitor` `>= 6.0, < 8.0` — unchanged
- **Capacitor 8 is not supported yet.** It requires AGP 8.13.0, Gradle 8.14.3, Kotlin 2.2.20 and compileSdk 36, and its CLI generates SPM-based iOS projects by default while this plugin is CocoaPods-only. Tracked as a follow-up, not shipped here.

### Security

- **`@braze/web-sdk`'s peer floor is now `^6.13.0`, and this is a security floor.** Web SDK 6.12.1 fixed a bug where an in-app message with multiple buttons could be displayed even when one of its buttons used a `javascript:` or `data:` URI and the `allowUserSuppliedJavascript` initialization option was disabled — a bypass of an explicit safety toggle. Do not pin below 6.13.0.
- **iOS: `enableLogging: false` now silences the Braze SDK.** It previously set BrazeKit's `.info` level — the second-most-verbose level, which logs session lifecycle, request dispatch and SDK state — contradicting `SECURITY.md` §8 and C06's default-deny posture. It now sets `.error`.
- **Android: `enableLogging: false` did not silence the Braze SDK either.** The SDK's default log level is INFO and the plugin only ever set the verbose branch, so the "off" setting was a no-op. The level is now set in **both** branches (errors-only when off) and is reversible across re-initialization; the old one-way `enableVerboseLogging()` was not.
- **iOS: the `sdkAuthError` listener works.** It was wired to `BrazeDelegate`, which does not declare `sdkAuthenticationFailedWithError` — that is `BrazeSDKAuthDelegate`, delivered via `braze.sdkAuthDelegate`. The conformance compiled and the event never fired, so the documented recovery path for an expired SDK Authentication signature did not exist on iOS.
- **Android feature flags leaked an undeclared `fts` key** containing Braze's internal impression-attribution token, because the DTO was built from `FeatureFlag.forJsonPut()`. The DTO is now exactly `{ id, enabled, properties }`.
- The endpoint cluster-sanity warning no longer logs the endpoint value on any platform, and now exists on **all three** (it was web-only).
- **Deep links can now be gated by the host app.** `initialize({ deepLinkHandling: 'app' })` suppresses the Braze SDK's own URL opening and emits `deepLinkReceived` instead, so a consumer can vet every campaign URL before anything navigates. The per-platform, per-channel coverage matrix — including the two channels the plugin *cannot* intercept — is in [`SECURITY.md` §7](./SECURITY.md#7-deep-link-security).
- **HTML in-app messages are off by default on web.** The new `allowUserSuppliedJavascript` option (default `false`) is what enables them, and it is what lets Braze dashboard authors run JavaScript in your page. iOS and Android ignore it — neither SDK has a counterpart.
- **CodeQL static analysis runs on every push and PR to `main`**, plus weekly, for `javascript-typescript` and `actions`. The `actions` analysis covers the workflow files themselves — injection into `run:` blocks, over-broad permissions — which matters on a repo whose CI publishes to npm. Swift and Kotlin are deliberately excluded; the reasoning is in the workflow header.
- **`release.yml` no longer passes `secrets: inherit` to the reusable CI call.** Nothing in `test.yml` reads a secret other than the automatically-provided `GITHUB_TOKEN`, so `inherit` only served to expose `NPM_TOKEN` to all nine CI jobs — two of which run CocoaPods and Gradle over a dependency graph this repo does not own.
- **The `github-release` job checks out with `persist-credentials: false`.** It is the only job holding `contents: write`, and it neither pushes nor reads history; the token no longer sits in the checkout's local config where a later step could reach it.
- **`npm audit` including dev dependencies now reports 0 vulnerabilities**, down from 2 high. Both were `js-yaml` DoS advisories reachable only through end-of-life ESLint 8's config loader (audit finding **A4-21**); the CI gate remains `--omit=dev`. The dev tree also shrank from 358 packages to 191.
- `SECURITY.md` has been reconciled against the implementation end to end — §3 (PII), §6 (in-app message XSS), §7 (deep links), §8 (logging), §12 and §13 (scanners, branch protection, provenance) previously described controls the plugin does not have. §6 and §7 in particular documented a `{ allow, replaceWith }` interception contract that was never built and that Capacitor cannot support; both now describe what ships. See "Documentation" below.

### Breaking

Pre-1.0, breaking changes ship in a minor. Each of these can change behaviour in an existing app:

- **iOS now requires Xcode 26.** BrazeKit 15.0.0 raised its Xcode floor to 26.0 and this release pins 18.2.1. Additionally, an Xcode 26 install whose iOS simulator *runtime* is older than its iOS SDK reports **no simulator destinations at all** rather than a version error — run `xcodebuild -downloadPlatform iOS` if you hit that.
- **`@braze/web-sdk` below 6.13.0 will now fail peer-dependency resolution.** This is deliberate (see Security).
- **iOS `getUserId` returns `null` after `wipeData`** (BrazeKit 17.0), matching Android and Web. Code relying on the old iOS-only behaviour will see `null`.
- **iOS `contentCardsUpdated` now fires on `changeUser`** (BrazeKit 17.0 Android-parity change). Listeners that deduplicated by assuming it did not will see an extra event.
- **iOS Content Cards reflect view/dismiss/click state immediately** (BrazeKit 16.0.0) instead of after the next sync.
- **`enableLogging: false` now genuinely silences the SDK on iOS and Android.** If you were relying on Braze's log output while passing `false`, pass `true`.
- **iOS `extras` values are stringified like the other platforms**: booleans as `"true"`/`"false"` (previously `"1"`/`"0"`) and containers as compact JSON (previously Swift debug descriptions). A visible output change for anyone reading `card.extras` / `message.extras` on iOS.
- **`sdkAuthError.userId` is `null` for an anonymous user** on every platform, instead of an empty-string sentinel.
- **Unrecognized in-app message and content-card variants are now dropped** with a single non-PII warning instead of being reshaped into a variant they are not (web previously emitted an empty slide-up). `getContentCards()` and `inAppMessageReceived` may therefore return/emit less than before where the SDK produced something the bridge cannot classify — by design, rather than emitting a fabricated shape.
- **Android: a second `initialize()` in the same process resolves with a warning** rather than appearing to have applied the new options. `Braze.configure()` returns `false` once the SDK is configured, and the SDK keeps its first configuration for the process lifetime. (Activity recreation legitimately re-runs `initialize`, so rejecting would have been worse.) Note the residual: the plugin's own `sdkAuthenticationEnabled` flag follows the *second* call while the SDK keeps the first's — the warning names exactly that.
- **iOS: `disableSDK()` before `initialize` is now honoured**, and `enableSDK()` works before `initialize` too. The previously documented iOS C07 asymmetry is gone; `isDisabled()` no longer reports `false` after a pre-init `disableSDK()`.
- **Non-integer `quantity` and `sessionTimeoutInSeconds` are rejected on iOS and Android** instead of being silently coerced to the default.
- **Event and purchase `properties` reject non-scalar values on all three platforms** with ``Braze.<method>: `properties.<key>` must be string, number, or boolean.`` — previously forwarded on web/iOS and silently dropped on Android.
- **Swift API: `BrazeKitDelegate` is renamed `BrazeSdkAuthDelegate`** and now conforms to `BrazeSDKAuthDelegate`. This type is an implementation detail of the bridge; no JS API changes.

### Added

- **`deepLinkReceived` listener + `initialize({ deepLinkHandling: 'sdk' | 'app' })`.** In `'app'` mode the plugin suppresses the Braze SDK's own URL opening and emits `{ url, source, useWebView }` instead. `source` is `'inAppMessage' | 'push' | 'contentCard' | 'banner' | 'other'` — widened past the three obvious channels because BrazeKit's `Braze.Channel` has a `banner` case and Android's `com.braze.enums.Channel` has `BANNER` and `UNKNOWN`, and coercing those into a neighbouring tag would be a silent provider-data drop. `useWebView` is a plain `boolean`: nothing on any platform can produce `null`. Default is `'sdk'` (unchanged behaviour). Per-platform, per-channel coverage — including the two channels it cannot cover — is in [`SECURITY.md` §7](./SECURITY.md#7-deep-link-security).
- `initialize` option **`allowUserSuppliedJavascript`**, default `false`. Web-only; it is what enables HTML in-app messages on web, and what lets Braze dashboard authors run JavaScript in your page. iOS and Android ignore it because neither SDK has a counterpart.
- **`useWebView` on content cards.** Optional field on `BrazeContentCardBase`, read from `ContentCard.ClickAction.url(_, useWebView:)` (iOS) and `Card.openUriInWebView` (Android). Absent on web, where the SDK's `Card` has no such member. This closes the asymmetry with the in-app message click action, which always carried it.
- **CodeQL static analysis** (`.github/workflows/codeql.yml`) for `javascript-typescript` and `actions`, on every push and PR to `main` plus a weekly schedule. Swift and Kotlin are not analysed: both require a full native compile inside the CodeQL tracer, which would duplicate `verify-ios` / `verify-android` and roughly double their runtime. The reasoning is in the workflow header and it is a tracked follow-up.
- **A bundle-size budget that is actually enforced.** `.github/scripts/assert-size.mjs` runs in the `build-plugin` job and fails the build if the gzipped `dist/esm/**/*.js` tree exceeds **20,480 B**. The measured total at `0.2.0` is **17,472 B**. `@braze/web-sdk` is a peer dependency and is never bundled, so this covers the bridge layer only — which is what the published budget always meant.
- **End-to-end `inAppMessageReceived` delivery tests on web.** The mock Braze server now returns real in-app-message trigger envelopes, so the Web SDK's own trigger engine parses them, evaluates the condition, constructs a real `InAppMessage` through its own factory, and invokes the subscription the plugin registered in `initialize`. The assertions are on the DTO a consumer's `addListener` callback actually receives — slideup, modal with buttons, full-screen, control, the `enableInAppMessageUI` opt-out, and one-native-subscription fan-out to two JS listeners. Nothing is stubbed or spied.
- **Coverage instrumentation for the web bridge.** `npm --prefix test/web run test:coverage` reports `src/web.ts` at **97.38%** statements/lines, **90.66%** branches and **100%** functions, with ratcheted thresholds that fail the run on a regression; the `test-web` CI job runs it. Plain `npm test` is unchanged and uninstrumented so the fast loop stays fast. The three remaining uncovered regions are unreachable without stubbing the SDK module and are documented in [`docs/TEST-COVERAGE-AUDIT.md`](./docs/TEST-COVERAGE-AUDIT.md).
- **The mock Braze server validates `/api/v3/data/` request shape** (JSON object body, non-empty `api_key`, non-empty `device_id`). Violations are recorded on `mock.violations` and asserted at teardown rather than answered with a 4xx, which would push the SDK into its retry/backoff path and surface ten seconds later in an unrelated test. It can also now delay a scripted response (`delayMs`), so ordering-sensitive SDK behaviour can be tested deterministically.
- `initialize` option **`enableInAppMessageUI`** (default `true`). Set `false` to present in-app messages yourself: `inAppMessageReceived` still fires and the plugin draws nothing. On iOS the plugin installs a non-rendering observer presenter (BrazeKit routes a message to exactly one presenter, so leaving the slot empty would kill the event); on Android it skips `registerInAppMessageManager`; on web it subscribes without calling `showInAppMessage`.
- `initialize` option **`enablePushAutomation`** (default `false`, **iOS only**). Hands notification opens, deep links, rich push and background push to BrazeKit and registers Braze's notification categories. Without it, only push *token registration* reached Braze, so push campaigns recorded sends but no opens. Because `initialize` runs after app launch, a push that launched the app may not be attributed.
- **Braze sessions are now opened and closed on Android.** The plugin registers `BrazeActivityLifecycleCallbackListener` once per process during `initialize` and opens a session for the host Activity, so session-scoped analytics (DAU/MAU, session length, sessions per user), session-start triggers and flush-on-background work. Previously no session was ever opened and every event was logged outside one. Do not register your own listener as well.
- `BrazeSlideupInAppMessage.icon` — the Font Awesome icon for icon-graphic slide-ups, which iOS and Android previously dropped entirely.
- `BrazeClassicContentCard.aspectRatio` — always present, `null` where the SDK supplies none.
- Android emits `imageAltText` on every non-control in-app message variant.
- The endpoint cluster-sanity warning now runs on iOS (`os.Logger`) and Android (`BrazeLogger.w`) as well as web, and never logs the endpoint value.
- Web: `echo` and `setGender` validate required inputs with the same messages the native bridges already used.
- **A runnable iOS unit-test target.** `ruby scripts/ios-add-test-target.rb` adds `CapacitorBrazeTests` to the demo app's Xcode project (idempotent; the generated target and shared scheme are committed) and `xcodebuild test` runs the **35** tests in `ios/PluginTests/`. The suite had previously never been compiled, let alone run.
- **Tarball manifest gate in CI.** A new `pack-check` job asserts that the published package contains every artifact a consumer's build needs (podspec, privacy manifest, consumer ProGuard rules, type declarations, license, changelog, security policy) and that no repo-internal directory leaks into it. Runnable locally with `npm run pack:check`.
- **Publish safety rails.** The release workflow verifies the CHANGELOG has a section for the version being released, fails loudly if that version is already on the registry, performs a `--dry-run` publish first, and checks that the provenance attestation landed afterwards.
- Type-checking for the test directories in CI (`npm run typecheck:tests`); vitest transpiles without type-checking, so `test/web`'s strict compiler settings had never been enforced.
- Dependabot now covers `test/web` and `test/mock-server` npm dependencies.
- A `## Security` section and a `## Troubleshooting` section in the README, and a "Privacy declarations you must make" section in C10.

### Changed

- **Tooling: migrated to ESLint 10 flat config.** `.eslintrc.cjs` is replaced by `eslint.config.cjs`, and the `eslint` script drops both `ESLINT_USE_FLAT_CONFIG=false` and `--ext ts` (flat config ignores the flag; the Ionic rule sets scope themselves to TypeScript). **ESLint 10, not 9** — `@ionic/eslint-config` 0.5.0 is the flat-config rewrite of Capacitor's official preset and it peer-requires `eslint@^10`, so 9 would have meant either staying on the eslintrc preset or hand-rolling the rules, which C09 exists to prevent. The lint scope is provably identical to the ESLint 8 baseline: the same 19 files.
- **`npm run eslint` now runs with `--max-warnings=0`**, so a warning fails the build exactly like an error.
- **`no-console` is enabled** (C09 L9-01). ESLint 9+ reports unused disable directives by default, which revealed that the five `// eslint-disable-next-line no-console` comments in `src/web.ts` had never suppressed anything — the rule was in neither `eslint:recommended` nor either Ionic preset. Enabling it matches the intent and backs `SECURITY.md` §3's no-PII-in-logs rule with a gate instead of reviewer attention.
- **Dev-dependency bumps** absorbed from Dependabot PR #22: `eslint` 8.57.1 → 10.11.0, `@ionic/eslint-config` 0.4.0 → 0.5.0, `prettier` 3.8.3 → 3.9.8, `rollup` 4.60.4 → 4.63.4, `@rollup/plugin-node-resolve` 15.3.1 → 16.0.3, `rimraf` 5.0.10 → 6.1.3, `@capacitor/docgen` 0.3.0 → 0.3.1. TypeScript stays on `~5.4.2`; PR #22's TypeScript 6.0 major is deliberately deferred to its own change. Prettier 3.9 reformatted exactly one file — the `BrazeContentCard` union in `src/definitions.ts` now fits on one line under the preset's 120-char width. Formatting only; `npm run docgen` reproduces the same README.
- **`tsconfig.json` pins `"types": []`.** The plugin source targets the browser/WebView and uses no Node API, but `@capacitor/docgen` 0.3.1 moving `@types/node` to devDependencies let the transitively-installed copy float to v26, which uses lib types TypeScript 5.4 does not ship — and broke `npm run build`. Pinning the empty set stops any transitive `@types/*` leaking into the public surface or the build, permanently.
- **A value the Braze SDK rejects now logs instead of vanishing.** Web and Android emit one non-PII `Braze.<method>: the Braze SDK rejected the value (see SDK logs)` warning when a `User.set*`, `addAlias`, subscription-group, `logCustomEvent`, `logPurchase`, `logContentCard*` or `logFeatureFlagImpression` call is rejected. The call still resolves; iOS has no equivalent signal, because BrazeKit's setters return `Void`. Android's previous, longer warning string is replaced so the two platforms match byte for byte.
- **`initialize` rejects an unrecognised `deepLinkHandling`** — ``Braze.initialize: unknown deepLinkHandling "<value>". Allowed: sdk, app.`` — rather than falling back to `'sdk'`, so a typo cannot leave a consumer believing deep links are gated. The value is echoed because the enum is closed, documented and non-secret (C06 §4 exemption, same as `setGender`).
- **Web: a second `initialize` only rebuilds the SDK instance when a construction-time option changed.** The plugin fingerprints the options the Web SDK fixes at construction (`apiKey`, `endpoint`, `enableLogging`, `enableSdkAuthentication`, `allowUserSuppliedJavascript`, `sessionTimeoutInSeconds`); a re-`initialize` with the same values tears down and re-wires the listener subscriptions but keeps the instance, while a changed workspace key or endpoint still goes through `destroy()` and a clean re-initialize. `wipeData` / `disableSDK` / `enableSDK` clear the fingerprint so the next `initialize` always rebuilds.
- **`REVIEW_READINESS.md` §2's aspirational performance budgets are gone.** The `<5 KB gzipped` web-bundle target is replaced by the measured **17,472 B** and its enforced **20,480 B** budget; the `.aar` (<50 KB), `.framework` (<100 KB), init-time and bridge-round-trip budgets were never measured, had no instrument, and are deleted rather than left standing.
- **Release pipeline now gates on the full CI suite.** `release.yml` calls `test.yml` as a reusable workflow, so `npm publish` waits on lint, build, tarball verification, the web behavioral tests, the security audit, and both native verify jobs (iOS/Xcode and Android/Gradle compiling and testing the bridges against the pinned Braze SDKs). Previously a tag published whatever was at that commit with no tests at all. `0.2.0` is the **first release published by the workflow**; `0.1.0` was published by hand and therefore carries no provenance attestation.
- **All GitHub Actions are pinned to full commit SHAs** with a trailing version comment, replacing floating major tags — including the two new `github/codeql-action` steps. Actions moved to current majors in the same pass (checkout v7, setup-node v7, gitleaks-action v3).
- Workflow `GITHUB_TOKEN` permissions are declared per file and per job at least privilege, rather than inherited from a repository setting.
- CI installs sub-project dependencies with `npm ci` instead of `npm install`, so every job builds the tree the committed lockfiles describe.
- `verify-android` runs on JDK 21 and now runs Android Lint on the library module; Lint is configured `abortOnError true`, so it can fail a build for the first time.
- `verify-ios` pins an Xcode 26.x toolchain, installs SwiftLint explicitly, builds once instead of twice, and runs `xcodebuild test`.
- The npm tarball now ships `CHANGELOG.md` and `SECURITY.md`.
- **The whole iOS bridge runs in a single main-actor isolation domain.** `initialize` and `wipeData` are strictly ordered with respect to each other, and the in-app-message presenter and delegates can no longer be attached to an SDK instance a concurrent `wipeData` already disowned.
- iOS `getUserId` / `getDeviceId` use BrazeKit's asynchronous accessors (added in 17.0); the synchronous properties block until the SDK settles.
- iOS reports itself to Braze with `addSDKMetadata([.npm, .cocoapods])`. `sdkFlavor` is deliberately left unset: BrazeKit has no Capacitor case and reporting `.cordova` would misattribute the wrapper.
- Android `consumer-rules.pro` no longer widens Braze's own deliberate `-keepnames` rules to `-keep … { *; }` across ~910 SDK classes, and the dead `com.appboy.**` rules are gone. The inert `android/proguard-rules.pro` was deleted.
- The plugin's default Android `minSdkVersion` drops from 26 to 22 to match Capacitor 6's stock template and C10; your `variables.gradle` always wins.
- Android unit tests: 7 → **91**, now covering every `@PluginMethod` validation branch and every serializer against real Braze model objects parsed from Braze's own wire JSON, plus the deep-link handler chain. `initialize` now runs end-to-end under Robolectric, which is what made the post-init branches reachable.
- Web tests: 108 → **206** across 18 files, adding wire-key assertions for every user attribute and subscription-group call, the full `serializeInAppMessage` surface against real SDK message classes, end-to-end `sdkAuthError` **and** `inAppMessageReceived` delivery tests, the deep-link and security-option suites, mock-server mechanics, and the disable → enable → initialize GDPR consent round-trip. iOS XCTests: 26 → **35**.
- SwiftLint actually runs: the config pointed `parent_config` at a file that does not exist (`@ionic/swiftlint-config` ships a JS module, not YAML), so none of the Ionic rules were enforced. The ruleset is inlined, `ios/PluginTests` is now linted, and CI installs the binary instead of assuming the runner image provides it. Result: 0 violations under `--strict`.
- **`tsconfig.json` forward-compat for TypeScript 5.6+.** `moduleResolution` moved from the deprecated implicit `node`/`node10` to `bundler` (matching the Rollup pipeline), plus an explicit `rootDir: "./src"`. No-ops on the pinned TS 5.4.
- Dependabot ignores `@capacitor/*` major bumps across the plugin, example, and demo; Capacitor majors land via deliberate maintainer-driven migration.
- Maintenance bumps: `actions/setup-java@4 → @5`, `android-actions/setup-android@3 → @4`, example dev-deps refresh.

### Removed

- **The Snyk CI step.** It was gated on `if: env.SNYK_TOKEN != ''`, the token was never provisioned, and a step that always skips reads as coverage in the job list while delivering none. `npm audit`, gitleaks, Dependabot and now CodeQL are the scanners that run. This also removes the last `snyk/actions/node` pin.
- **The IIFE browser bundle and the `unpkg` package field.** `dist/plugin.js` was an IIFE intended for a `<script>` tag, but the web bridge loads `@braze/web-sdk` through `await import('@braze/web-sdk')` — a bare specifier no browser can resolve without an import map — so the artifact could never have worked standalone. The package now ships ESM (`dist/esm`) and CJS (`dist/plugin.cjs.js`) only, which is what Capacitor consumers actually use.

### Fixed

- **Web: re-`initialize`-ing before the first network round trip completed silently gated content-card and feature-flag refreshes.** The Web SDK reads its server config exactly once per instance; destroying and rebuilding the instance while the first `/api/v3/data/` response was still in flight left the fresh instance with defaults in which both features are disabled, so every later `requestContentCardsRefresh()` / `refreshFeatureFlags()` resolved without sending a request and no listener fired. Keeping the instance across a same-configuration re-`initialize` (see *Changed*) removes the failure mode; `lifecycle.test.ts` pins both the mid-flight and the settled case deterministically.
- **Tests: `sessionTimeoutInSeconds` was only covered by its rejection case**, so the code path that forwards a valid value to the Braze SDK had never executed — a plugin option was shipping unexercised. Coverage instrumentation found it on its first run. Also added the missing `logPurchase` empty-`currency` rejection and a content-card refresh-failure test.
- **Tests: mock-server teardown no longer waits indefinitely on an abandoned keep-alive connection** (one test's teardown took ~6 s; it now runs in ~250 ms), and jsdom's XHR `ECONNREFUSED` / `socket hang up` teardown stacks no longer flood stderr — a passing run now reads like a passing run.
- **Root, `demo/`, `example/` and `test/web/` lockfiles still recorded the plugin at `0.1.0`** after the `0.2.0` bump, which breaks `npm ci`. Resynced.
- **Web: `initialize` no longer reports success when the Braze Web SDK declines to initialize.** The SDK's success flag was discarded, so a bad API key left every listener silently dead for the page lifetime.
- **Web: `openSession()` now runs after the event subscriptions**, as the Braze Web SDK documents. Previously the session that `initialize` opened never triggered a content-card refresh and any session-start in-app message was dropped before the plugin subscribed.
- **Web: listener subscriptions are cancelled and re-created instead of guarded by booleans.** `wipeData` + `initialize` no longer stacks duplicate subscriptions (events fired N times after N cycles), and `disableSDK` → `enableSDK` → `initialize` no longer leaves every listener dead.
- **Web: `disableSDK` and `enableSDK` clear the plugin's initialized state**, matching the SDK, which destroys its instance in both. A call after either now fails with the init-required error instead of an internal "getUser() returned null" message.
- **Web: a second `initialize` re-initializes the SDK** (destroy + re-init) instead of silently keeping the first API key and endpoint.
- **Web: `getDeviceId` is init-gated**, matching iOS, Android, and its own documentation. (0.1.0 claimed to have fixed this — finding L1-01 — but only the JSDoc changed; the guard is now genuinely there.)
- Web: `requestImmediateDataFlush` resolves when the flush completes and rejects when the SDK reports it failed, instead of resolving on dispatch.
- Web: in-app message button `useWebView` reflects the campaign's open target instead of being hard-coded `true` for every button.
- Web: feature-flag properties and content-card extras are copied, so consumer mutations no longer reach into the SDK's cache.
- Web: a failed `@braze/web-sdk` import is no longer reported as a missing peer dependency; the underlying error is included as the `cause`.
- **iOS: `setCustomUserAttribute` wrote booleans for the numbers `0` and `1`.** `getBool` succeeds for any `NSNumber` whose value is 0 or 1, so `{ key: 'lifetime_orders', value: 1 }` set `true` on the Braze profile — silently, permanently, and only on iOS. The bridge now discriminates with `CFGetTypeID`.
- **iOS: `registerPushToken` accepted `"<>"` and `"  "`**, hex-decoded them to zero bytes and registered an empty APNs token — a silent push outage. Whitespace and newlines are stripped and zero-byte / over-length tokens are rejected.
- iOS: unrecognized in-app-message, content-card and feature-flag-property variants are reported with a diagnostic instead of vanishing.
- iOS: the HTTPS and content-card-not-found error strings are byte-identical to the web bridge again; both had lost their actionable second sentence.
- iOS: `braze.delegate` is no longer assigned at all, leaving the slot free for host apps.
- **Android in-app messages reported `id: null` and `slideFrom: 'bottom'` for every message.** Both are real SDK accessors (`InAppMessageBase.getTriggerId()`, `InAppMessageSlideup.getSlideFrom()`); a top-anchored campaign now correctly reports `'top'`, and analytics keyed on `message.id` work.
- **Android content cards always reported `clicked: false`.** Now read from `Card.isClicked()`.
- **Android leaked the Activity and WebView on every Activity recreation.** The three Braze event subscriptions created at `initialize` are removed in `handleOnDestroy`, with an identity check so tearing down the outgoing Activity cannot silently kill the incoming one's in-app message listener.
- Android listener events are delivered to the WebView on the main thread instead of Braze's dispatcher thread, where a failed post was swallowed silently.
- Android surfaces a warning when the Braze SDK rejects a user-attribute value (the SDK's boolean return was previously discarded); the value itself is never logged.
- Android's HTTPS and `getDeviceId` error strings are byte-identical to the web bridge again.
- **The Snyk CI step could never execute:** its `if: env.SNYK_TOKEN != ''` condition read a variable defined in the step's own `env:` block, which binds after the condition is evaluated. Rather than repair a step whose token was never going to be provisioned, it was removed — see *Removed*.
- **The SwiftLint CI gate could pass without SwiftLint ever running** — `node-swiftlint` warns and exits 0 when the binary is absent, and the macOS runner image does not ship it.
- **The `test/mock-server` Dependabot entry declared the wrong ecosystem** (`gradle`, a leftover from an abandoned Ktor plan) and had been failing on every weekly run since July; its dependencies were unmonitored.
- `npm run smoke:{web,ios,android}` build the plugin before the demo consumes it, run correctly from any working directory, and document the cluster they actually default to.
- **Documentation:** the docs have been reconciled against the code repo-wide. The README no longer says the plugin is unpublished, advertises the right test counts and listener events, documents the Android Gradle requirements it previously said were unnecessary, and gained Security and Troubleshooting sections. `CLAUDE.md`'s test stack (Jest/Ktor/Maestro) and commands were fiction and are now real. `SECURITY.md` §§3, 6, 7, 8, 12, 13 described controls that do not exist. `SDK_SURFACE.md`'s version matrix contradicted the shipped surface. `REVIEW_READINESS.md` had 130 unchecked boxes for work that was done. Every `file:line` reference in C01–C11 pointed at the wrong line. The May 2026 audit is archived at [`docs/audits/2026-05/`](./docs/audits/2026-05/) with a resolution status per finding, joined by [`docs/audits/2026-09/`](./docs/audits/2026-09/). [`docs/TEST-COVERAGE-AUDIT.md`](./docs/TEST-COVERAGE-AUDIT.md) now reports **measured** coverage rather than a hand-maintained claim, and documents why the three remaining uncovered regions in `src/web.ts` are unreachable.

### Deliberately not fixed in 0.2.0

Stated so they are not mistaken for oversights:

- **Setter return values are still discarded (audit A1-10).** `setEmail('nonsense')` resolves on every platform. Web and Android now log a non-PII warning when the SDK rejects a value; **iOS reports nothing**, because BrazeKit 18.2.1's setters return `Void`. Turning a rejection into a promise rejection would therefore break cross-platform parity. Deferred as a contract change.
- **No Layer 4 smoke capture.** Nothing in this release has been verified against a live Braze backend.
- **`-strict-concurrency=complete` is not clean on iOS** (~40 warnings), because `CAPPlugin` / `CAPPluginCall` are non-`Sendable` in Capacitor 6/7 and any correct main-actor hop trips the checker. Swift 5 mode — what the podspec builds with — is clean apart from one deliberate deprecation warning at the pre-init `wipeData` branch, where `Braze.wipeDataAndDisableForAppRun()` remains the only class-level wipe BrazeKit 18.2.1 offers.
- **CodeQL does not analyse Swift or Kotlin.** The `javascript-typescript` and `actions` analyses do run on every push, PR and weekly; the native languages need a traced compile that would roughly double the `verify-ios` / `verify-android` runtime.
- **No coverage instrumentation on the native bridges.** The web bridge is measured and ratcheted; the 91 Android and 35 iOS numbers are test counts. JaCoCo / `xcodebuild -enableCodeCoverage` is a tracked follow-up.
- **`deepLinkReceived` cannot intercept HTML in-app message iframes on web**, whose renderer never consults the SDK's click-action path, and on Android it covers content-card clicks only through Braze's own feed UI — an app rendering cards from `getContentCards()` owns those clicks itself. The full matrix is in [`SECURITY.md` §7](./SECURITY.md#7-deep-link-security).


## [0.1.0] — 2026-05-22 — Audit cleanup + first credible npm tag

This is the first release the project's own audit ([`docs/audits/2026-05/SUMMARY.md`](./docs/audits/2026-05/SUMMARY.md), archived) judges credible to publish. 17 phases of cleanup close the BLOCKER + MAJOR findings across contract integrity, cross-platform translation, native code quality, security, CI/tooling, and documentation. The plugin is now consumable from npm as `npm install capacitor-braze` (Capacitor 6 or 7), with iOS in-app message rendering wired out of the box, SDK Authentication enforced client-side, and `inAppMessageReceived` / `sdkAuthError` listener events on every platform.

### Pinned native SDK versions
- `com.braze:android-sdk-ui` **42.2.0**
- `BrazeKit` / `BrazeUI` **14.1.0**
- `@braze/web-sdk` peer dep `^6.0.0`

### Capacitor compat
- Peer dependency: `@capacitor/core` `^6.0.0 || ^7.0.0`
- Podspec dependency: `Capacitor` `>= 6.0, < 8.0`

### Added

- **`inAppMessageReceived` listener event** across all three platforms. Cross-platform DTO is a 5-variant tagged union (`slideup` / `modal` / `full` / `html` / `control`) that collapses BrazeKit iOS's 7-case enum and Braze Android's 5-case MessageType onto a single contract. Full button + click-action + extras serialization. Listener fires on every IAM trigger immediately before the SDK's presenter displays the message; the plugin always returns `DISPLAY_NOW` / `.now` to preserve out-of-the-box rendering. Closes L4-S11.
- **`sdkAuthError` listener event** across all three platforms. Fires when Braze rejects an authenticated request; consumer pushes a fresh signature via `setSdkAuthenticationSignature`. Closes L5-04 / SECURITY.md §2 promise.
- **iOS in-app message rendering out of the box.** `import BrazeUI` + `braze.inAppMessagePresenter = BrazeInAppMessageUI()` in `initialize`, dispatched to the main actor for Swift 6 strict-concurrency compliance.
- **Android in-app message rendering lifecycle wiring.** `BrazeInAppMessageManager.getInstance().registerInAppMessageManager(activity)` in `handleOnResume` + the matching unregister in `handleOnPause`. IAMs now render automatically against the Capacitor host Activity.
- **URL parsing + cluster sanity check at `initialize`** on all three platforms. Malformed endpoints reject before the SDK ever sees them; web additionally warns on unknown cluster patterns. Closes L5-03 / SECURITY.md §4 promise.
- **gitleaks + Snyk CI steps** in the `audit` job. Snyk is gated on `SNYK_TOKEN`. Closes L5-05 (partial).
- **Required signed-commit branch protection on `main`.** Closes L5-05 (signed commits).
- **`prepare` script** so `npm install bma342/capacitor-braze` git-URL installs build `dist/*` on the consumer side.
- **Native test harnesses.** Android Robolectric/JUnit contract tests under `android/src/test/`, run via `./gradlew :capacitor-braze:testDebugUnitTest` in CI. iOS XCTest contract tests under `ios/PluginTests/`. Closes L6-01.
- **Layer 4 smoke scripts.** `npm run smoke:web` / `:ios` / `:android` env-validating wrappers around the demo app + Xcode-/Android-Studio-open prereqs. Closes L6-02 to the extent it can be closed without trial credentials.
- **MDC glossary + 8-file-lockstep walkthrough + Tips for AI assistants** sections in `CLAUDE.md`.
- **SwiftLint check in CI** (`verify-ios` job, `--strict`).
- **Dependabot watches `/demo` and `/test/mock-server`** in addition to plugin + example.

### Fixed

- **L1-01 (BLOCKER): `getDeviceId` JSDoc lie.** Contract claimed init-independence; all three bridges actually require `initialize`. JSDoc rewritten.
- **L1-02 (MAJOR): `enableSDK` / `isDisabled` JSDoc.** Documents the iOS BrazeKit 14.x asymmetry.
- **L2-01 (BLOCKER): iOS `serializeFeatureFlag` shape.** Now walks BrazeKit's typed accessors and emits the C02 tagged-union `{ type, value }` shape.
- **L2-02 (BLOCKER): iOS + Android `serializeContentCard` discriminator.** Pattern-matches the SDK's enum cases (iOS) / class hierarchy (Android) to emit the 4-string contract discriminator.
- **L2-05 (MAJOR): web content-card classification** via `instanceof` instead of the field-presence heuristic.
- **L2-07 + L4-K04 + L5-08: cross-platform error message parity.** Per-field DOB errors byte-identical across platforms; `Month.entries`; explicit `sessionTimeoutInSeconds <= 0` rejection.
- **L4-K01 / L4-S01 / L4-T01 / L5-01: SDK Authentication enforcement.** All three bridges reject signature-less `changeUser` calls when SDK Auth was enabled at init. Closes SECURITY.md §2 defense-in-depth.
- **L4-K02 (MAJOR): Android `setCustomUserAttribute` Long truncation.** Uses the SDK's `Long` overload directly.
- **L4-S02 (MAJOR): iOS `setCustomUserAttribute` dispatch order.** `getDouble`-first; only dispatches to Int when the value is truly integer.
- **L4-S03 + L4-S04: iOS init re-entrance + closure lifetime.**
- **L2-03 + L2-04 + L2-06: integer-vs-float JSDoc claim removed; null/undefined rejection cross-platform.**
- **L4-T02 + L4-P03: Capacitor 7 forward-compat ranges.**
- **L5-02: SECURITY.md §5 push handoff design** rewritten to match what the plugin actually does.
- **L5-07: SECURITY.md disclosure placeholder** replaced with GitHub Security Advisories pointer.
- **L4-T03: `noUncheckedIndexedAccess` enabled** in main tsconfig (zero new errors surfaced).
- **L4-T06: web subscription flag reset on `wipeData`.**
- **L4-T09 + L10-01: ESLint coverage on `test/web/`** + `_options` warning suppression.
- **L9-MAJOR-1: stale CLAUDE.md SDK pins + wrong podspec filename.**

### Changed

- **CLAUDE.md** refresh for AI ingestion: MDC glossary table, 8-file-lockstep walkthrough, Tips section with grep-this-first patterns + common gotchas + BrazeKit xcframework download trick.
- **SECURITY.md §2 + §4 + §5 + §13:** doc-to-reality reconciliation per the audit's L5 findings.
- **CapacitorBraze.podspec:** bounded `Capacitor` dependency range.
- **android/build.gradle:** dropped the legacy `appboy.github.io/appboy-android-sdk/sdk` Maven URL (L4-K05).

### Deferred (post-`0.1.0`)

- Full Layer 4 smoke captures — wrappers ship; captures land when the maintainer provisions a Braze trial and walks the playbook.
- C11 native test harness coverage expansion beyond the contract surface this PR covers.
- iOS XCTest target wiring inside the demo's Xcode workspace (the test files live in `ios/PluginTests/` ready to add as a Unit Testing Bundle target — one-time maintainer setup).

## Pre-0.1.0 staging notes

These entries were staged under `[Unreleased]` before `0.1.0` and shipped as part of it.
Kept for detail; they are not a separate release. (Historically this heading read
`## [0.0.12] earlier [Unreleased] items…`, which made two `0.0.12` sections in one file.)

### Fixed — `PrivacyInfo.xcprivacy` now actually ships (Phase S, App Store gate)

The placeholder manifest at `ios/Plugin/PrivacyInfo.xcprivacy` existed
since early Phases but was unreachable to consumers: the podspec's
`source_files` glob only matched code files. Apple requires the
manifest at the framework bundle root.

  - Added `resource_bundles` declaration to `CapacitorBraze.podspec`
    so the manifest lands inside `CapacitorBraze.bundle` alongside
    the compiled framework.
  - Expanded the manifest with an XML comment explaining scope: the
    plugin binary declares its own behavior (none of the required-
    reason APIs per a grep of `ios/Plugin/`); BrazeKit's own manifest
    covers UserDefaults (CA92.1) + FileTimestamp (C617.1) + UserID/
    DeviceID/ProductInteraction data types; consumer app manifest
    covers ATT.
  - Verified on a fresh `cap-init` install 2026-05-20:
    `CapacitorBraze.bundle` resource target is generated in
    Pods.xcodeproj with the manifest as a build file.

### Added — Quick-start docs surface the iOS Podfile requirement

Walked the README quick-start verbatim on a fresh Capacitor 6 app.
`npm install` clean, TS snippet compiles green, `cap add android`
auto-wired, but `cap add ios` failed pod install with "required a
higher minimum deployment target." Cause: BrazeKit 14.x pins iOS 15
+ requires static linkage; default Capacitor Podfile uses iOS 13 +
bare `use_frameworks!`. C10 documented this from Day 1 but the quick-
start told consumers "just run cap sync" with no link. Now inlined
into the quick-start so the first failure mode a consumer would hit
is now the first thing they read.

### Added — Prominent "unofficial / not from Braze" disclaimers

User-facing surfaces (README header + bottom, demo README, example
README) and strategic docs (PLAN, SDK_SURFACE, SECURITY) all carry
an explicit statement that this is an independent personal project,
not from or endorsed by Braze, Inc. `package.json` description
prefixed with the same. README adds an "Unofficial Personal Project"
shield + prominent disclaimer blockquote under the badges.

### Added — `docs/REPO-HYGIENE.md` one-pager + branch protection

Applied via `gh` CLI on `bma342/capacitor-braze`:
  - 8 required CI status checks (strict; branch up-to-date)
  - `allow_force_pushes`: false, `allow_deletions`: false
  - `required_conversation_resolution`: true
  - `required_signatures`: true (enabled; admin bypass available)
  - `enforce_admins`: false (solo-project hotfix path)

Doc covers the remaining personal-account setup: SSH signing (recommended
over GPG), uploading SSH key as a *signing* key on GitHub (separate from
auth), npm 2FA (`auth-and-writes`), tag-release flow + NPM_TOKEN secret.

### Added — Smoke-test capture templates pre-staged

`docs/smoke-tests/_template-{web,ios,android}.md` give each trial-smoke
pass a consistent shape: setup block, pre-flight checklist, 10-12
numbered steps from playbook §3/4/5, plus four "highest-leverage"
captures (`logCustomEvent` body, `setDateOfBirth` body with the "web
emits `1987-7-14`" anchor pre-filled, `FeatureFlag` DTO, `ContentCard`
DTO) and a cross-platform drift table. Real passes get renamed
`<platform>-YYYY-MM-DD.md`.

### Added — Defensive validation tests (+18 tests, 92 total)

New `test/web/src/validation.test.ts` exercises every input-validation
branch in `src/web.ts`:

  - `initialize`: empty `apiKey`, empty `endpoint`, `http://` endpoint
    without `allowInsecureEndpoint` (default-deny per C06), negative
    `sessionTimeoutInSeconds`.
  - `setDateOfBirth`: out-of-range `year` (1899, 2101, -1), `month`
    (0, 13, -1), `day` (0, 32, -1). C03's month-1-indexed convention
    is now pinned in tests.
  - Empty-arg rejection on `logCustomEvent` (name), `setCustomUserAttribute`
    (key), `changeUser` (userId), `logContentCardClick` (cardId),
    `logContentCardImpression` (cardId).

Goal: defense in depth. Every method has its primary behavioral test
elsewhere; this file specifically pins the validation contract so a
future refactor that drops a guard fails CI immediately. Errors throw
synchronously before any HTTP dispatch, per C04 ("validate at the
boundary, fail loud, never queue garbage").

### Added — Listener end-to-end + echo round-trip (74 tests, 37/37 web methods covered)

Closes the last remaining web-bridge coverage gaps from the audit.

`test/web/src/listeners.test.ts` (2 tests):
  - `addListener('featureFlagsUpdated', cb)` + `addListener('contentCardsUpdated', cb)`:
    registers consumer callbacks, triggers refresh via mock-server scripted
    responses, asserts each callback fires with the canonical DTO payload
    (`{flags: BrazeFeatureFlag[]}` and `{cards: BrazeContentCard[], lastUpdated}`).
  - `removeAllListeners`: subsequent refresh after removal does not invoke
    the previously-registered callback.

`test/web/src/privacy-lifecycle.test.ts` extended with:
  - `echo({value})` round-trip: the Capacitor convention smoke method,
    init-independent by design.

Tests use `freshPluginWithConfig` to ensure the SDK has the server-config
that enables refreshes (same pattern as the populated-cache tests).
Module-singleton constraint navigated via per-test plugin instances.

Total: 71 -> 74 behavioral tests. Audit doc updated: every one of the
37 surface methods now has at least one direct behavioral test. The
remaining work outside the audit is platform-native (C11 post-smoke).

### Added — Wire-level POST capture for impression methods (FF + CC)

Extended the populated-cache fat tests with assertions that
`logFeatureFlagImpression`, `logContentCardClick`, and
`logContentCardImpression` actually POST events to `/api/v3/data/`
with the correct event-type codes and payload shape:

  - `logFeatureFlagImpression` → event name `"ffi"` (EventTypes.xo)
    with data `{ fid: <flag id>, fts: <tracking string> }`.
  - `logContentCardClick` → event name `"ccc"` (EventTypes.os) with
    data `{ ids: [<card id>] }`.
  - `logContentCardImpression` → event name `"cci"` (EventTypes.ds)
    with data `{ ids: [<card id>] }`. (Control-card impressions use
    `"ccic"`/EventTypes.js; not yet covered separately.)

Codes verified against `@braze/web-sdk` source
(`shared-lib/event-types.js` + `src/Card/card-manager.js` +
`src/FeatureFlags/log-feature-flag-impression.js`). Assertions are
nested in the existing populated-cache fat tests rather than separate
`it()` blocks because of the same module-singleton constraint that
required consolidation in the first place.

Test count stays at 71 (per-it boundary), but the contract validated
is meaningfully stronger. The audit now lists all three impression
methods as ✅ wire-level covered.

### Added — Populated-cache FF + CC tests via initialize-time config scripting (+3 tests, 68 → 71)

Closes the populated-cache gap that the original test-coverage audit
called out. Two infrastructure additions + two new test files now
validate that real Feature Flag and Content Card DTOs flow through
the bridge end-to-end (not just the serializer in isolation):

  - `mock-server` 0.0.2: `respondTo({pathPattern, body, method?})`
    with a method filter that excludes CORS preflight `OPTIONS` from
    consuming oneShot scripts (real bug found during the spike that
    revealed the issue).
  - `test/web/src/test-utils.ts` `freshPluginWithConfig()`: helper
    that boots a fresh mock-server, scripts the FIRST `/api/v3/data/`
    POST response with a server-config block enabling FF + CC
    refreshes, then constructs + initializes a fresh `BrazeWeb`. The
    initial data POST is where `@braze/web-sdk` reads its server
    config; without enabling FF/CC there, `refreshFeatureFlags`
    short-circuits at the SDK's `yo()` gate.
  - `test/web/src/feature-flags-populated.test.ts` (2 tests):
    `refreshFeatureFlags → getFeatureFlag / getAllFeatureFlags` with
    3 flags including all 6 property types (`string`, `number`,
    `boolean`, `image`, `datetime`, `jsonobject`) roundtripping
    end-to-end. Cache-miss returns `flag:null`.
  - `test/web/src/content-cards-populated.test.ts` (1 fat test):
    `requestContentCardsRefresh → getContentCards` with 3 card-type
    variants validating the C02 discriminator rules
    (`captionedImage` / `imageOnly` / `classic`). Click + impression
    resolve once the cardId is in the cache.

Tests are consolidated rather than focused because `@braze/web-sdk`
is a module-level singleton within a vitest worker. Once initialize()
runs, subsequent init calls in tests 2+ don't fully re-init the SDK's
internal state. One-file-per-scenario works but the per-file boot
overhead outweighs the clarity benefit.

Total: 53 → 71 web behavioral tests since Phase P.3. Coverage audit
updated to reflect 35-of-37 methods directly covered.

### Added — Web behavioral tests for the previously-uncovered methods (+15 tests)

Coverage audit ([`docs/TEST-COVERAGE-AUDIT.md`](./docs/TEST-COVERAGE-AUDIT.md))
found 9 plugin methods with zero direct behavioral tests, including the
privacy-critical `wipeData` and 8 of the Feature Flags / Content Cards
surface. This closes the easy half of that gap.

  - `test/web/src/feature-flags.test.ts` (6 tests): `refreshFeatureFlags`
    no-throw; `getFeatureFlag` empty-cache + empty-id reject;
    `getAllFeatureFlags` empty-cache; `logFeatureFlagImpression` no-throw
    when flag absent + empty-id reject.
  - `test/web/src/content-cards.test.ts` (4 tests): `requestContentCardsRefresh`
    no-throw; `getContentCards` empty-cache; `logContentCardClick` and
    `logContentCardImpression` reject unknown cardId with a clear message
    that names the missing id.
  - `test/web/src/privacy-lifecycle.test.ts` (5 tests): init guard message
    on `logCustomEvent`, `getFeatureFlag`, `getContentCards` without
    `initialize()`; `wipeData()` works pre-init per C07; `wipeData()`
    resets `initialized` state so post-wipe calls hit the init guard.

Total: 53 → 68 vitest behavioral tests, 2.4s. Plus 17 serializer unit
tests = 85 total. Real findings during this work:
  - Content card rejection message wording got pinned in the assertion
    so any future regression is caught (was 'no cached content card
    with id ...').
  - `logFeatureFlagImpression` silently no-ops at the wire layer when the
    flag isn't in the cache. Test now asserts the no-throw contract and
    the doc explains why the wire-level assertion is gated on
    mock-server enhancement.

The doc captures remaining gaps and how to close them (mock-server
enhancement for populated-cache cases; SDK event injection for listener
lifecycle; C11 for native platforms). The 4 still-uncovered methods
(`echo`, `addListener`, `removeAllListeners`, populated-cache variants)
are listed with their unblock plan.

### Added — Root `npm test` + `npm test:watch` passthrough

Was previously `cd test/web && npm test`. The README's "Local
development & testing" section documented `npm test` from root; the
root package.json didn't actually have the script. Added passthroughs
so the documented commands match reality. Also added a "Local
development & testing" section to README covering: vitest, lint,
example/demo dev servers, native compile gates (`xcodebuild` /
`./gradlew assembleDebug`), and what is honestly NOT yet locally
testable (native bridge behavior, real-Braze backend acceptance).

### Added — C11 native test harness design + trial smoke-test playbook (Phase R)

The honest framing: implementing native behavioral test harnesses
takes significant per-platform setup (Robolectric + Gradle ceremony
on Android, Xcode test target creation on iOS) AND requires real
wire-format ground truth to write the assertions against. Without
that ground truth, the harness would test "what we think Braze
emits" — recreating the Phase O vibe-coding trap one layer deeper.

The trial smoke is both cheaper (~2-3 hrs) and produces the ground
truth the harnesses need. So Phase R splits in two:

  C11 (this commit, design only): documents URLProtocol intercept
  for iOS XCTest, MockWebServer + Robolectric for Android JUnit.
  Concrete code patterns for both platforms so the implementation,
  when it lands, follows one shape rather than being reinvented
  per phase.

  docs/SMOKE-TEST-PLAYBOOK.md: walks every shipped method against
  a Braze trial dashboard. Step-by-step instructions, dashboard
  verification, wire-format capture template. Three platforms x
  10-12 steps each. The output is the ground truth that future
  C11 implementations assert against.

Phase R implementation (the actual native test bodies) is sequenced
after the smoke. The blocker to tag 0.1.0 changes shape:

  Before:
    1. Layer 4 trial smoke
    2. Native mock harnesses
    3. PrivacyInfo.xcprivacy + various hygiene

  After:
    1. Layer 4 trial smoke (per playbook)
    2. PrivacyInfo.xcprivacy + various hygiene
    Post-0.1.0: native mock harnesses (per C11)

This isn't a deferral — it's correct sequencing. The harness can't
write meaningful assertions until the smoke validates which assertions
are correct.

REVIEW_READINESS.md §7 updated to reflect the revised blocker list.
CLAUDE.md MDC list adds C11; docs/mdcs/README.md index too.

### Added — serializer unit tests (Phase P.3)

`test/web/src/serializers.test.ts` (17 tests) covers the pure
serialization logic inside BrazeWeb — the functions that drive the
`addListener('featureFlagsUpdated')` and `addListener('contentCardsUpdated')`
payloads:

- **`serializeFeatureFlag`**: roundtrips `id` + `enabled` + every
  valid property type (`string` / `number` / `boolean` / `image` /
  `datetime` / `jsonobject`). Drops properties with unknown type
  tags (future SDK additions won't break the consumer's DTO).
  Tolerates missing / empty properties.
- **`serializeContentCards`**: handles undefined input + Date →
  epoch ms for lastUpdated.
- **`serializeContentCard`**: validated for each of the four DTO
  variants (`classic`, `captionedImage`, `imageOnly`, `control`).
  Confirms `isControl` flag short-circuits the type-detection
  heuristic.
- **`detectContentCardType`**: pins the field-presence heuristic
  (captionedImage = title+description+imageUrl; imageOnly =
  imageUrl without title; classic = title+description without
  imageUrl; null for nothing matched).

These tests don't drive a full SDK round-trip — the listener
callback only fires on real flag/card refreshes, which would
require teaching the mock Braze's exact flag-sync wire format.
Calling the serializers directly with synthetic SDK-shaped inputs
pins the contract more sharply with less ceremony.

Total test count is now **53** across 7 files, runtime ~2.4s.

### Added — expanded web behavioral test coverage (Phase P.2)

Six test files now cover **36 behavioral tests** in under 3 seconds:

| File | Tests | Surface |
|---|---|---|
| `events.test.ts` | 6 | `logCustomEvent`, `logPurchase` + 3 input-validation rejection paths |
| `attributes.test.ts` | 11 | `setEmail`, `setPhoneNumber`, `setFirstName`, `setLastName`, `setLanguage`, `setCountry`, `setHomeCity`, `setDateOfBirth`, `setGender`, `setCustomUserAttribute`, gender-rejection |
| `identity.test.ts` | 8 | `changeUser`, `getUserId`, `addAlias`, `setSdkAuthenticationSignature`, `getDeviceId` + 3 rejection paths |
| `subscription-groups.test.ts` | 4 | `addToSubscriptionGroup`, `removeFromSubscriptionGroup` + 2 rejections |
| `lifecycle.test.ts` | 4 | `wipeData`, `disableSDK`, `enableSDK`, `isDisabled`, `requestImmediateDataFlush` no-op |
| `push.test.ts` | 3 | `registerPushToken` web divergence — pins the three-part error shape per C03 |

### Real wire-format facts discovered during P.2

Three concrete things the mock-server reveals about Braze's Web SDK
wire format (verified by inspecting actual captured POSTs):

- **DOB serializes as `<year>-<month>-<day>` without zero-padding.**
  `setDateOfBirth(1987, 7, 14)` → `"dob":"1987-7-14"`. The plugin's
  assertion now matches the canonical form.
- **Endpoint path is `/api/v3/data/`** for events + attributes.
- **Wire envelope shape** (verified):
  ```
  { respond_with, events: [...], attributes: [...], device,
    api_key, time, sdk_version, device_id }
  ```
  Events have `{ name: "ce", time, data: { n, p }, session_id }`.
  Attributes are a list of objects, each holding key→value pairs.

### Lifecycle correction

Initial P.1 commit used `beforeEach`/`afterEach` to boot a fresh mock
+ initialize per test. The Braze Web SDK is module-level singleton
state — calling `initialize` twice in the same process retains the
first endpoint, so the second test would XHR to a closed mock port
and time out.

Fix: every test file now uses `beforeAll` for the mock + SDK init,
`beforeEach` for `mock.clearCaptured()`, `afterAll` for cleanup.
Vitest forks per file so the singleton-per-file model is correct.

The first behavioral validation that doesn't depend on a real Braze
account. Two new packages under `test/`:

- **`test/mock-server/`** — in-process Fastify HTTP capture endpoint.
  Catch-all handler logs every request body; permissive CORS so jsdom
  can XHR it; returns Braze's canonical `{ message: 'success' }`.
- **`test/web/`** — vitest under jsdom. First test (`events.test.ts`)
  exercises the full chain: `BrazeWeb` → `@braze/web-sdk` → HTTP →
  mock receives a payload whose body contains the event name.

This proves the plumbing works end-to-end on the web platform. Real
behavioral coverage of the remaining 34 methods is incremental work
on the same harness; the scaffolding is in place. Native bridges
still need a real Braze trial account for behavioral validation
(compile-validation already runs in `verify-ios` / `verify-android`).

CI gains a `test-web` job that installs both test packages and runs
`npm test` in `test/web/`. ~30s per run on ubuntu.

The harness `waitForCaptured` polls for matching requests with a 5s
default timeout — the Web SDK's `requestImmediateDataFlush` is itself
async, and there's a small async hop between flush and the HTTP
landing on the mock.

Plugin's `.eslintrc.cjs` now ignores `test/` (it has its own
tsconfig + module setup that the plugin's eslint config doesn't
apply to cleanly). `.prettierignore` adds the test package
node_modules / lock files.

## [0.0.12] — 2026-05-20

### Added — session timeout config + SDK Auth signature rotation (Phase N)

Two tightly-scoped enrichment additions from the v0.2 list:

- **`sessionTimeoutInSeconds`** on `BrazeInitializeOptions`. Overrides
  Braze's default 30-minute (1800-second) session timeout. Validated
  at the TS boundary as a positive integer per C04; rejected at all
  three native bridges with the same error text per C01.
  Cross-platform unit normalization (per C03): the plugin contract
  uses seconds. iOS converts to `TimeInterval`, Android takes Int
  seconds directly via `setSessionTimeout`, Web passes through as
  `sessionTimeoutInSeconds`.

- **`Braze.setSdkAuthenticationSignature({ signature })`** —
  rotates the SDK Authentication JWT on the live SDK instance
  without re-running `changeUser`. Use when:
  - The previous signature expires (typical JWT lifetime: 12-24h)
  - An `sdkAuthError` event fires indicating backend rejection
  No-op at the SDK level when `enableSdkAuthentication: true` was
  not set at init time — the signature is stored but never sent.

Both additions touch the existing `initialize` / identity surface
without new DTO design or listener plumbing.

Surface: **35 callable methods** + `addListener` / `removeAllListeners`
for two events.

## [0.0.11] — 2026-05-19

### Added — `registerPushToken` (Phase M)

`Braze.registerPushToken({ token })` on iOS + Android. The plugin's
first method that diverges by absence on one platform — web throws.

Recommended consumer wiring:

```ts
import { PushNotifications } from '@capacitor/push-notifications';
import { Braze } from 'capacitor-braze';

PushNotifications.addListener('registration', async ({ value }) => {
  await Braze.registerPushToken({ token: value });
});
```

Per-platform behavior:

- **iOS:** hex-decodes the APNs token string with a local `dataFromHex`
  helper (tolerates whitespace and the `<...>` debug-print wrapper) and
  hands the `Data` to BrazeKit's `notifications.register(deviceToken:)`.
- **Android:** assigns the FCM token string to
  `Braze.getInstance(context).registeredPushToken`. No decoding step
  — FCM tokens are already strings.
- **Web:** throws `Error` with the C03-prescribed shape: what failed,
  why (Web Push uses VAPID + Service Worker subscriptions), what to do
  instead (`Capacitor.getPlatform()` branch).

[C03](./docs/mdcs/C03-CROSS-PLATFORM-TRANSLATION.md) gains a new
section "When a method legitimately doesn't exist on one platform"
codifying the pattern. Future divergent methods (banners, geofences,
Push Stories) follow the same shape.

Surface: **34 callable methods** + `addListener` / `removeAllListeners`
for two events.

### Changed — podspec renamed to `CapacitorBraze.podspec`

Capacitor's plugin convention is that the Pod name matches the PascalCase
of the npm package name: `@capacitor/preferences` → `CapacitorPreferences`,
`capacitor-braze` → `CapacitorBraze`. Renaming our podspec to match means
`cap sync` in consumer apps resolves the plugin automatically without any
Podfile customization.

`BrazePlugin.podspec` → `CapacitorBraze.podspec`. `s.name = 'BrazePlugin'`
→ `s.name = 'CapacitorBraze'`. The npm package itself stays
`capacitor-braze`. No Swift class name change — the bridge class is still
`@objc(BrazePlugin)` on the Obj-C runtime side, and the JS plugin name
`Braze` is unchanged.

Pre-1.0 breaking change: any external Podfile that hardcoded
`pod 'BrazePlugin'` will need to update to `pod 'CapacitorBraze'`.
No npm consumers are affected because the plugin hasn't been published
to npm yet.

### Changed — plugin re-exports `PluginListenerHandle`

`PluginListenerHandle` (from `@capacitor/core`) is now re-exported from
`capacitor-braze` so consumers writing typed listener handlers can rely
on a single import line:

```ts
import { Braze, type PluginListenerHandle } from 'capacitor-braze';
```

No behavior change — it's literally the same type from `@capacitor/core`.
The re-export removes a paper cut that surfaced when wiring the demo's
content-cards listener.

### Added — iOS + Android Capacitor platforms in `demo/`

`demo/` now ships with both native projects added via `npx cap add ios`
and `npx cap add android`. A consumer cloning this repo can open the
Xcode workspace or Android Studio project directly — no separate
bootstrap step beyond `npm install && npx cap sync`.

iOS Podfile pins:

  platform :ios, '15.0'
  use_frameworks! :linkage => :static

`platform 15.0` because BrazeKit 14.x requires iOS 15+. Capacitor's
default `13.0` is below BrazeKit's floor and would fail `pod install`.

`use_frameworks! :linkage => :static` because BrazeKit ships as a
static XCFramework. Capacitor's default `use_frameworks!` (dynamic) is
incompatible — CocoaPods refuses to mix static dependencies into a
dynamic-linkage target and aborts with a not-quite-warning. Per Braze
iOS install docs, static linkage across the whole app target is the
recommended setup when BrazeKit is in the dependency graph.

Both platforms' `.gitignore` files keep Pods, build artifacts, and
local Xcode user data out of the repo. Total committed footprint for
both platforms is ~700K + 70 files.

### Added — `demo/` Capacitor reference app (not published, dev artifact)

A second app alongside `example/`, purpose-built as a fork-as-starter
reference. Different audience from `example/`:

- `example/` is the developer testbed (every plugin method = a button +
  log line). For maintainers verifying changes.
- `demo/` is a production-feeling Capacitor app with realistic flows
  across two verticals (restaurant ordering + e-commerce). For
  consumers evaluating the plugin or starting a real integration.

L.1 ships the scaffold: Vite 6 + React 19 + Tailwind 4 (CSS-first
config) + TanStack Router + Zustand 5 + Capacitor 6. Mock auth via
Zustand persist. Bottom nav, top bar with cart badge, login page,
home page wired to `Braze.changeUser` + `Braze.logCustomEvent`. The
other tabs (`/restaurants`, `/shop`, `/cart`, `/checkout`,
`/promotions`, `/profile`, `/settings`) are routed but contain
placeholders — phased rollout per `demo/README.md`.

Not Aromo-derived. The demo is a standalone reference; no Aromo
backend, branding, or code is involved.

CI gains a `build-demo` job that builds the demo against the freshly
built plugin (mirrors `build-example`).

## [0.0.10] — 2026-05-19

### Added — Content cards read API + `contentCardsUpdated` listener (Phase K)

The first phase to apply the MDC set end-to-end. Four read-side
methods plus a listener event. The DTO is a discriminated union
matching the Web SDK's `Card` class hierarchy per [C02](./docs/mdcs/C02-DTO-SHAPES.md);
the listener wiring follows the eager-on-init pattern per [C05](./docs/mdcs/C05-LISTENERS.md).

- `Braze.getContentCards()` → `{ cards: BrazeContentCard[]; lastUpdated: number | null }`.
  Reads from the SDK's local cache. `lastUpdated` is Unix epoch ms
  (`null` if never fetched).
- `Braze.requestContentCardsRefresh()` — fire-and-forget; resolves
  once the refresh has been dispatched. Use the listener for the
  fresh card payload, or re-read after a short delay.
- `Braze.logContentCardClick({ cardId })` — call when the user
  taps a card. Only needed when bypassing Braze's built-in display.
- `Braze.logContentCardImpression({ cardId })` — call when a card
  scrolls into view.
- `Braze.addListener('contentCardsUpdated', cb)` — fires on every
  card refresh. Payload matches `getContentCards` shape; no initial
  state replay (consumer reads via `getContentCards` once after
  `addListener` to seed UI).

### `BrazeContentCard` DTO

Tagged union over four card variants:

- `'classic'` — title + description + optional image + optional URL
- `'captionedImage'` — title + description + required image
- `'imageOnly'` — required image, no title
- `'control'` — multivariate-test control arm; impression-logged
  but not rendered

`type` is the discriminator; narrow with
`if (card.type === 'classic') { ... }`. The shape mirrors the
Web SDK's `Card` class hierarchy verbatim; iOS maps from
`Braze.ContentCard` enum cases (`.classic`, `.captionedImage`,
`.imageOnly`, `.control`); Android maps from the SDK subclass
hierarchy (`ShortNewsCard`, `CaptionedImageCard`, `BannerImageCard`,
`TextAnnouncementCard`, `ControlCard`).

### Cross-platform translation notes

- **Android `TextAnnouncementCard`** folds into the `'classic'` type
  (title + description, no image). The Android SDK distinguishes
  short-news from text-announcement based on whether an image is
  configured; the plugin contract treats both as classic since the
  visible shape is identical.
- **Date fields** are Unix epoch milliseconds across all three
  platforms. Web converts via `Date.getTime()`; iOS via
  `timeIntervalSince1970 * 1000`; Android via the SDK's
  seconds-from-epoch fields multiplied by 1000.
- **Web `logContentCardClick` takes a `Card` instance** (not an id).
  The web bridge looks up the cached card by id before forwarding;
  cache-miss is a reject pointing the consumer at `getContentCards`.

### Improved

- C02 (DTO shapes) and C05 (listeners) MDCs gain content-card worked
  examples.
- Plugin surface: **33 callable methods** + `addListener` /
  `removeAllListeners` for two events.

### Improved — Capacitor official toolchain alignment

Adopts the dev-tooling stack that Capacitor's own first-party plugins use
(ESLint + Prettier + SwiftLint + `@capacitor/docgen`) with the matching
`@ionic/*` config presets. No source-code logic change; the same plugin
surface ships, now under the conventions a Capacitor plugin author
expects to find.

- Dev deps added: `eslint`, `prettier`, `swiftlint`, `@capacitor/docgen`,
  `@ionic/eslint-config`, `@ionic/prettier-config`, `@ionic/swiftlint-config`.
- Scripts added: `lint`, `fmt`, `eslint`, `prettier`, `swiftlint`,
  `docgen`, `verify`, `verify:web`.
- `npm run build` now also runs `docgen`, regenerating the API reference
  section of `README.md` from `definitions.ts` JSDoc on every build.
- CI gains a `lint` job (ESLint + Prettier --check). The `build-plugin`
  job additionally asserts the README's docgen markers are populated.
- One-time source edits to match the rule set: type import order fix in
  `src/web.ts`, Prettier reformat of `src/definitions.ts`, `src/web.ts`,
  `example/index.html`, `example/src/main.ts`, `example/src/style.css`.

## [0.0.9] — 2026-05-19

### Added — Listener infrastructure + feature flag update events (Phase H)

First event-based surface in the plugin. Same pattern will host in-app
message and content card update events in later versions; this commit
establishes the cross-platform shape so those land as additions, not
infrastructure work.

- `Braze.addListener('featureFlagsUpdated', cb)` →
  `Promise<PluginListenerHandle>`. The callback receives
  `{ flags: BrazeFeatureFlag[] }` — the full current set, not a delta.
- `Braze.removeAllListeners()`.

### Implementation notes

The native subscription is created once per `initialize` and torn down
in `wipeData`, so listener registration on the JS side is cheap (no
extra native traffic per addListener call). All registered JS listeners
share the same native subscription.

- **iOS:** `braze.featureFlags.subscribeToUpdates { flags in ... }`
  returns a `Braze.Cancellable`; retained on the plugin instance, set
  to `nil` in `wipeData`.
- **Android:** `Braze.getInstance(context).subscribeToFeatureFlagsUpdates(
  IEventSubscriber<FeatureFlagsUpdatedEvent>)`. The same subscriber
  instance is passed to `removeSingleSubscription` during teardown —
  the Android SDK identifies subscriptions by listener identity, not by
  a returned handle.
- **Web:** `braze.subscribeToFeatureFlagsUpdates(cb)`. The Web SDK has
  no unsubscribe handle, so the bridge uses a one-shot subscribe guard
  and lets the subscription live for the page lifetime.

Initial state is not replayed on `addListener` — Capacitor adds
listeners on the JS side without triggering the native callback. If
the consumer needs the current snapshot, they call
`Braze.getAllFeatureFlags()` once after `addListener`. This is
documented in the JSDoc.

### Improved

- Plugin surface: 29 callable methods + `addListener` /
  `removeAllListeners` (Capacitor-native bridge methods).

## [0.0.8] — 2026-05-19

### Added — Feature flags read API (Phase G)

Four methods that cover the read-side of Braze's feature flag system.
All three platforms; eight-file lockstep. The `subscribeToFeatureFlagsUpdates`
listener is deferred — it lands together with the in-app message and
content cards listeners in a dedicated listener-infrastructure phase.

- `Braze.getFeatureFlag({ id })` → `{ flag: BrazeFeatureFlag | null }`.
  Reads from the SDK's local cache; returns `null` when no flag with
  the given id exists for the current user.
- `Braze.getAllFeatureFlags()` → `{ flags: BrazeFeatureFlag[] }`.
- `Braze.refreshFeatureFlags()` — fire-and-forget. The returned promise
  resolves once the refresh has been dispatched, not when new flags
  arrive. Re-read after a short delay; full completion semantics will
  ride alongside the forthcoming subscribe-to-updates listener.
- `Braze.logFeatureFlagImpression({ id })` — limited by Braze to one
  impression per session per flag id.

### Added — `BrazeFeatureFlag` DTO

Portable wire-format shape: `{ id, enabled, properties }`. The
`properties` map mirrors the Web SDK `PropertiesJson` exactly so the
web path is zero-conversion; the Android bridge round-trips the SDK's
underlying `JSONObject` (already in the same shape); the iOS bridge
maps each `Braze.FeatureFlag.Property` enum case into the same wire
record. Property value types: `'string' | 'number' | 'boolean' |
'image' | 'datetime' | 'jsonobject'` (matches Braze's wire format).

### Improved

- Plugin surface: **29 methods** across all three platforms.

## [0.0.7] — 2026-05-19

### Added — `getUserId` + `logPurchase` (Phase F)

Closes the last two v0.1-roadmap methods that don't need listener
plumbing. All three platforms; eight-file lockstep.

- `Braze.getUserId()` → `{ userId: string | null }`. Returns the current
  external user ID, or `null` for anonymous users. iOS reads
  `braze.user.id` (sync property since BrazeKit 14.x); Android reads
  `currentUser.userId` and coerces the SDK's empty-string anonymous
  sentinel to `null`; Web reads `getUser().getUserId()` and coalesces
  `undefined` to `null`.
- `Braze.logPurchase({ productId, currency, price, quantity?, properties? })`.
  Required currency on the public contract even though the Web SDK
  treats it as optional — revenue analytics roll up incorrectly when
  some events lack currency. Android wraps `price` via
  `BigDecimal.valueOf(double)` so the stored value is the exact
  decimal a human typed (`14.99`), not a float-precision artifact.
  Quantity defaults to `1`, validated to integer in 1-100 per Braze.

### Improved

- Example app: shared `parseJsonProperties(id)` helper used for both
  event and purchase property inputs; replaces the per-input helper.
- Plugin surface: **25 methods** across all three platforms.

## [0.0.6] — 2026-05-19

### Added — Subscription groups, aliases, demographics, device ID (Phase E)

Pull-forward of seven v0.2-roadmap methods that consumers reach for almost
immediately after the basic identify/event surface lands. All seven on all
three platforms.

- `Braze.addToSubscriptionGroup({ groupId })` — adds the current user to a
  Braze email/SMS subscription group.
- `Braze.removeFromSubscriptionGroup({ groupId })` — counterpart.
- `Braze.addAlias({ alias, label })` — non-primary identifier; `(alias,
  label)` pairs are unique across users.
- `Braze.getDeviceId()` → `{ deviceId: string }` — Braze SDK device id,
  for backend-side targeted messaging or debugging.
- `Braze.setDateOfBirth({ year, month, day })` — `month` is 1-12 (matches
  Web SDK contract; the Android bridge maps to `com.braze.enums.Month`).
- `Braze.setGender({ gender })` — string union `'male' | 'female' | 'other' |
  'unknown' | 'not_applicable' | 'prefer_not_to_say'`. Bridges map to the
  matching native enum case so consumers never see the SDK's
  single-letter / enum-case shorthand.
- `Braze.setHomeCity({ homeCity })` — string or `null` to clear.

### Added — `example/` Capacitor app (not published, dev tool only)

Minimal Capacitor app under `example/` that exercises every plugin method
end-to-end. Originally committed under Unreleased; ships in 0.0.6 alongside
the Phase E methods.

- Vite + vanilla TypeScript (no framework coupling).
- Single page with UI for every method, grouped by category.
- Live log panel shows each call's result or error.
- Runs in browser today via `@braze/web-sdk`; iOS/Android added via
  `npx cap add` per the example README.

### Improved

- TS types: new `BrazeGender` union and per-method option types
  (`BrazeSubscriptionGroupOptions`, `BrazeAddAliasOptions`,
  `BrazeSetDateOfBirthOptions`, etc.) exported so consumers can write
  helper functions with full type safety.
- iOS bridge: dates are constructed against a UTC Gregorian calendar so a
  stored DOB doesn't drift by a day based on device timezone, matching the
  Android and Web semantics.
- Web bridge: `WEB_GENDER_MAP` centralizes the public string → SDK
  single-letter constant mapping in one place.
- Plugin now exposes **23 methods** across all three platforms.

## [0.0.5] — 2026-05-19

### Added — User attributes (standard + custom)

All work against the current user (anonymous or identified). Pass `null` to
clear a standard attribute. Email/phone are treated as PII per SECURITY.md §3;
the bridge never logs attribute values at any level.

- `Braze.setEmail({ email })` — string | null
- `Braze.setPhoneNumber({ phoneNumber })` — E.164 recommended
- `Braze.setFirstName({ firstName })`
- `Braze.setLastName({ lastName })`
- `Braze.setLanguage({ language })` — ISO 639-1
- `Braze.setCountry({ country })` — ISO 3166-1 alpha-2
- `Braze.setCustomUserAttribute({ key, value })` — value is `string | number |
  boolean`; native bridges dispatch on the inferred type to the matching Braze
  SDK overload.

### Improved

- Android: new `requireUser(call)` helper that combines init guard +
  `currentUser` null check, returning the user object or rejecting cleanly.
- iOS: `setCustomAttribute` dispatch order is `getBool` → `getString` →
  `getInt` → `getDouble`. Booleans-first prevents JSON `true`/`false` from
  being misread as integer 1/0.
- Android: `setCustomUserAttribute` reads from `call.data.opt("value")` (raw
  JSONObject) to preserve the original value type before Capacitor's getter
  coercion gets a chance to confuse it.
- TS: explicit `BrazeAttributeValue` and `BrazeAttributeValueType` types
  exported so consumers can write helper functions that produce attribute
  payloads with full type safety.

### Notes
- v0.0.5 is the first cut where a consumer can deliver a complete Braze
  customer profile: identify a user (`changeUser`), set their standard
  attributes (email, name, etc.), tag them with custom attributes, log
  events, and respect privacy methods. This is the minimum viable profile
  surface — push, content cards, IAM, feature flags still pending.
- Plugin currently exposes **16 methods** across all three platforms.

## [0.0.4] — 2026-05-19

### Added — Privacy & lifecycle methods

The minimum production-safety surface per SECURITY.md §10. All five are
init-independent except `requestImmediateDataFlush` (which needs a configured
Braze instance to flush from).

- `Braze.wipeData()` — destructive local data removal; for GDPR Article 17
  flows. Drops the plugin's init state so subsequent post-init calls fail
  cleanly until `initialize` is called again.
- `Braze.disableSDK()` — halts all data collection.
- `Braze.enableSDK()` — re-enables after `disableSDK`.
- `Braze.isDisabled()` — returns `{ disabled: boolean }`.
- `Braze.requestImmediateDataFlush()` — bypasses Braze's network batching.
  Useful for Layer 4 smoke testing and edge cases where the app may be killed
  before the next batch.

### Improved

- Exhaustive JSDoc on every method in `definitions.ts` with `@example` blocks,
  cross-references to SECURITY.md sections, and clear notes on which methods
  are init-independent.
- iOS: `MARK:` section comments grouping bridge methods by category.
- Android: KDoc on helpers explaining narrow-to-primitive contract for
  `jsObjectToBrazeProperties`.
- `BrazePlugin.m`: ordered CAP_PLUGIN_METHOD registrations by category to
  match the Swift file structure (review-friendly).
- Web: `loadSdk()` helper centralizes the dynamic `@braze/web-sdk` import with
  a friendly error message if the peer dep isn't installed.

## [0.0.3] — 2026-05-19

### Added
- `Braze.changeUser({ userId, sdkAuthSignature? })` — identifies the current
  user. Required JWT signature parameter (optional in TS, validated server-side
  by Braze when SDK Authentication is enabled). All three platforms.
- `Braze.logCustomEvent({ name, properties? })` — logs a custom event with
  optional string / number / boolean properties. All three platforms.
- TS types: `BrazeChangeUserOptions`, `BrazeLogCustomEventOptions`,
  `BrazeEventProperties`, `BrazeEventPropertyValue`.
- Init guard on all platforms — any plugin method other than `initialize` /
  `echo` rejects with a clear error if `initialize` wasn't called first.
- Android: `jsObjectToBrazeProperties` helper that narrows JSObject to
  `BrazeProperties` while only accepting primitive values per the TS
  interface contract.

### Notes
- This is the first commit where the plugin actually pushes data into Braze.
  A consumer can call `initialize` → `changeUser` → `logCustomEvent` against
  a real Braze account and see the user profile + event appear in the
  dashboard within ~30 seconds.
- Date / array property values not yet supported (TS interface excludes them);
  lands in a later 0.0.x patch.

## [0.0.2] — 2026-05-19

### Changed
- `Braze.initialize()` now performs real native SDK initialization on iOS and Android (web was already wired in 0.0.1):
  - **iOS:** constructs `Braze.Configuration(apiKey:endpoint:)`, sets `configuration.logger.level` (`.debug` if `enableLogging`, else `.info`), toggles `configuration.api.sdkAuthentication`, instantiates `Braze` and retains as `BrazePlugin.braze` static for future push delegate hooks.
  - **Android:** builds `BrazeConfig` via builder pattern (`setApiKey`, `setCustomEndpoint`, `setIsSdkAuthenticationEnabled`, optional `setLoggerLevel(Log.VERBOSE)`), calls `Braze.configure(context, config)`.

### Notes
- `initialize` is now sufficient to integrate the Braze SDK end-to-end. Consumer apps can call it and see device profiles created in their Braze dashboard, even though no `changeUser` / `logCustomEvent` methods exist yet — Braze tracks anonymous sessions automatically.
- Next: 0.1.0-alpha with `changeUser` + `logCustomEvent` per [`PLAN.md` §7](./PLAN.md#7-phased-roadmap).

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

<!-- Keep a Changelog link references -->
[Unreleased]: https://github.com/bma342/capacitor-braze/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/bma342/capacitor-braze/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/bma342/capacitor-braze/releases/tag/v0.2.0
[0.1.0]: https://github.com/bma342/capacitor-braze/releases/tag/v0.1.0
[0.0.12]: https://github.com/bma342/capacitor-braze/blob/main/CHANGELOG.md
[0.0.11]: https://github.com/bma342/capacitor-braze/blob/main/CHANGELOG.md
[0.0.10]: https://github.com/bma342/capacitor-braze/blob/main/CHANGELOG.md
[0.0.9]: https://github.com/bma342/capacitor-braze/blob/main/CHANGELOG.md
[0.0.8]: https://github.com/bma342/capacitor-braze/blob/main/CHANGELOG.md
[0.0.7]: https://github.com/bma342/capacitor-braze/blob/main/CHANGELOG.md
[0.0.6]: https://github.com/bma342/capacitor-braze/blob/main/CHANGELOG.md
[0.0.5]: https://github.com/bma342/capacitor-braze/blob/main/CHANGELOG.md
[0.0.4]: https://github.com/bma342/capacitor-braze/blob/main/CHANGELOG.md
[0.0.3]: https://github.com/bma342/capacitor-braze/blob/main/CHANGELOG.md
[0.0.2]: https://github.com/bma342/capacitor-braze/blob/main/CHANGELOG.md
[0.0.1]: https://github.com/bma342/capacitor-braze/blob/main/CHANGELOG.md
