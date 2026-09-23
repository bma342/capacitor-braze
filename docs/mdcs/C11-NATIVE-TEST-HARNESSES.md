# C11 — Native test harnesses

**iOS and Android bridges need behavioral coverage equivalent to what `test/web` gives the JS bridge. This MDC documents the shape both platforms follow, so coverage grows rather than being reinvented per phase.**

> **Status: both tiers implemented.** The **unit / contract tier** is live on both platforms —
> **91** Robolectric/JUnit tests on Android, **35** XCTests on iOS. The **integration tier** is live
> too, **15 tests per platform**, driving the real Braze SDKs against a real local HTTP server and
> asserting the bytes on the wire. Totals: **106 Android**, **50 iOS** (1 skipped). Everything runs
> in CI on every PR inside the existing `:capacitor-braze:testDebugUnitTest` and `xcodebuild test`
> invocations — no workflow change was needed. See "Status" at the end for the per-file breakdown
> and the two scenarios that remain out of reach on iOS.

The web bridge runs against a Fastify mock under jsdom (206 vitest tests across 18 files, ~3.5s,
with measured V8 coverage of `src/web.ts` ratcheted in CI). The
native bridges had *compile-only* coverage until 0.2.0. What the unit tier closed: every validation
branch is now pinned byte-exact against `src/web.ts` on all three platforms, and every serializer is
driven against real Braze model objects rather than hand-built fixtures. What the integration tier
closed: the actual HTTP the native SDKs emit, which is the only way to prove cross-platform wire
consistency rather than DTO consistency.

---

## Rule

When implementing native behavioral tests, follow the per-platform patterns documented below. Don't reinvent. Both platforms validate the same shape of contract — "the bridge correctly translates `PluginCall` → SDK call → HTTP wire-output" — using each platform's idiomatic test framework. Both reuse the wire-format insights from `test/web` so cross-platform consistency is the test, not just compilation.

If a platform's native SDK changes its public API such that this MDC's documented approach stops working, update this MDC in the same PR as the workaround.

## Rationale

Three reasons to settle the design before building:

1. **The native test surface is large.** Both XCTest and Gradle/JUnit setups carry significant ceremony. Without a shared design, each engineer would re-discover the patterns from scratch.
2. **Mock-server reuse vs. URLProtocol/MockWebServer tradeoffs are non-obvious.** The choice on each platform locks in a maintenance shape for years. Documenting it before coding lets the choice be deliberate.
3. **CI cost.** Native test jobs run on more expensive runners (macOS for iOS, full Android emulator if instrumented). The decision between "reuse the existing Fastify mock via inter-process" vs. "use platform-native mocking" affects CI minute spend significantly.

---

## iOS — XCTest + a loopback HTTP server

> **This section's original design said `URLProtocol`. The implementation does not, and the reason
> is recorded here because it is the kind of decision that gets silently reverted.** `URLProtocol`
> only intercepts sessions built from `URLSessionConfiguration.default`, and BrazeKit 18.2.1 exposes
> nothing about the session it uses — no `protocolClasses` hook, no injectable configuration
> (`BrazeKit.swiftinterface` does not mention `URLSession` at all). Registering a protocol class
> would be a bet on a private implementation detail that a pin bump could void, and the failure mode
> is a *passing* test that stopped intercepting anything. A loopback listener cannot be bypassed:
> either the SDK connects to the endpoint it was configured with, or the test times out.

### Approach

`LocalHTTPServer` in `ios/PluginTests/BrazeWireHarness.swift` — a real HTTP/1.1 server on
`127.0.0.1` built on `NWListener`, inside the test process. The plugin is initialized against
`http://127.0.0.1:<ephemeral>` with `allowInsecureEndpoint: true`, and the tests assert the captured
request bodies and headers.

**App Transport Security needs no exception.** ATS does not apply to IP-literal hosts, so no
`NSAllowsLocalNetworking` (or any other) entry was added to the test host's `Info.plist`. The
listener binds loopback explicitly via `requiredLocalEndpoint` rather than `0.0.0.0`, so running the
suite never trips the macOS incoming-connections firewall prompt.

**Why not reuse the Fastify mock via Process spawning?**

We considered booting `test/mock-server` from `setUp()` via `Process`. Pros: zero divergence from the web test path; same captured assertions. Cons: requires Node available on the test runner, adds inter-process startup latency, makes test failures harder to diagnose. The in-process listener keeps everything in Swift; the assertion API ends up tighter.

### As built

Both tiers live in `ios/PluginTests/`, in the same generated `CapacitorBrazeTests` bundle:

```
ios/PluginTests/
├── BrazePluginContractTests.swift        # unit tier — 35 tests
├── BrazeWireHarness.swift                # integration harness (no tests of its own)
└── BrazePluginWireIntegrationTests.swift # integration tier — 15 tests
```

`BrazeWireHarness.swift` holds three things:

- **`LocalHTTPServer`** — the loopback HTTP/1.1 server, with a swappable `responder` so a test can
  script a payload onto whichever endpoint it cares about, and a captured-request list that parses
  each body as JSON.
- **`WireHarness`** — the server plus a real `BrazePlugin`, and the polling helpers every assertion
  goes through (`awaitRequest`, `awaitFlushedRequest`, `awaitEvent`, `assertNoFurtherRequests`).
- **`BrazeWire`** — the response envelopes, mirrored from the Android tier and the TypeScript mock
  so all three platforms assert against the same JSON.

### Plugin instantiation pattern

```swift
override func setUp() async throws {
    try await super.setUp()
    wire = try WireHarness()          // binds a loopback port, constructs the plugin
}

func testSomething() async throws {
    try await wire.initialize()       // wipe → initialize → enable → prove live
    try await wire.invoke("logCustomEvent", ["name": "x"]) { wire.plugin.logCustomEvent($0) }
    let request = try await wire.awaitFlushedRequest("the event") { $0.customEvent("x") != nil }
    // assert on request.json / request.headers
}
```

`RecordedCall` constructs a `CAPPluginCall` whose success/error handlers record into it, because
production `CAPPluginCall` resolves asynchronously and every plugin entry point hops to the main
actor first. Listener events are captured by registering a `RecordedCall` through Capacitor's own
`addEventListener`, so the assertion covers the real `notifyListeners` dispatch path.

### The four things that made iOS hard

Each of these cost a debugging session, and each is a trap the next person would otherwise re-enter.
All four are documented at their call sites; this is the index.

1. **`options` must be a `JSObject`, not `[String: Any]`.** `CAPPluginCall`'s accessors go through
   `options as? JSObject`, which is all-or-nothing — one nested dictionary Swift inferred as
   `[String: Any]` makes the whole cast fail, so `getString("name")` returns nil and the bridge
   rejects with "`name` is required (string)" for a payload that plainly contains it. `invoke`'s
   parameter is typed so this is a compile error.
2. **`wipeData` disables the SDK, and the disable is persisted in the app container.** BrazeKit's
   instance `wipeData()` is the rename of `wipeDataAndDisableForAppRun()` and keeps that second
   half; a later launch comes up disabled until something re-enables it (`_requestEnableSDKOnNextAppRun`
   exists for exactly this). A `wipeData` in *teardown* therefore poisons the next run of the suite
   on the same simulator. A `wipeData` at the *start* of `initialize`, followed by an enable, is
   what gives each test a clean store — and it is what took the suite from intermittently failing to
   three clean runs in a row.
3. **Never enable a departing instance.** Setting `enabled = true` on the previous test's `Braze`
   spins it back up, and for a moment two live instances share one on-disk event store; the next
   test's `logCustomEvent` then enqueues into a store the departing instance still holds and every
   flush reports "no new data to flush". The enable belongs *after* `initialize`, never before.
4. **The server config is a strict `Codable`.** A `config` block missing any non-optional member
   fails the whole data response with "Unable to decode either 'Error' or 'DataResponse'", the
   config is dropped, and Feature Flags and Content Cards stay disabled with no other symptom. The
   members, recovered from the shipped binary's coding keys in declaration order: `time`,
   `events_blacklist`, `attributes_blacklist`, `purchases_blacklist`, `messaging_session_timeout`,
   `geofences`, `ephemeral_events`, `content_cards`, `feature_flags`, `banners`,
   `global_request_rate_limit`, `request_backoff`, `sdk_debugger`. The three `*_blacklist` arrays
   are required; `BrazeWire.serverConfig` is the smallest shape verified to decode.

A fifth, smaller one: BrazeKit rate-limits outbound requests, and an immediate flush that arrives
too soon is *dropped, not deferred*. The symptom is alternating pass/fail down the suite, because
every timeout refills the bucket for the test after it. `awaitFlushedRequest` re-issues the flush
until the request lands.

### CI integration

None needed. The integration tests are in the same bundle the `verify-ios` job already builds and
runs, so `xcodebuild test` picks them up. Run time is unchanged in practice (the whole iOS suite is
~5s).

---

## Android — JVM unit tests + OkHttp MockWebServer + Robolectric

### Approach

**MockWebServer** (from OkHttp) for HTTP capture — already a transitive dependency of the Braze Android SDK, no new packages needed. **Robolectric** for the Android runtime stubs (Context, Application, SharedPreferences) — needed because `Braze.getInstance(context)` requires a real Android Context, and JVM tests can't provide one without an emulator or Robolectric.

**Why not instrumented tests on a real emulator?**

Instrumented tests need either a connected device or an emulator running on the CI runner. The android-actions/avd-action GitHub Action can boot an emulator in CI but adds ~5 minutes of startup per job. Robolectric runs on the JVM in ~1 second. The trade-off is Robolectric provides *approximations* of Android APIs — usually good enough for SDK boundary testing, occasionally surprises.

For this plugin's testing needs (boundary between Capacitor's PluginCall and Braze's Java/Kotlin SDK), Robolectric is sufficient. Instrumented tests would catch a narrower set of additional issues at significantly higher CI cost.

### As built

Both tiers live in `android/src/test/java/com/bma342/braze/`:

```
android/src/test/java/com/bma342/braze/
├── TestSupport.kt                      # unit-tier harness (fakePluginCall, initializedPlugin)
├── BrazePluginContractTest.kt          # 45 tests
├── BrazePluginSerializerTest.kt        # 24 tests
├── BrazePluginLifecycleTest.kt         # 22 tests
├── IntegrationSupport.kt               # integration harness (no tests of its own)
└── BrazePluginWireIntegrationTest.kt   # 15 tests
```

`IntegrationSupport.kt` holds `IntegrationSupport` (SDK reset, harness construction), `WireRequest`
(a captured request with JSON accessors), `WireHarness` (server + plugin + polling helpers) and
`BrazeWire` (the response envelopes, shared in shape with the iOS tier and the TypeScript mock).

### `build.gradle` additions

The unit tier's dependencies were already there. The integration tier added one line:

```groovy
testImplementation 'com.squareup.okhttp3:mockwebserver:4.12.0'
```

MockWebServer 4.x matches the OkHttp 4.x line the Braze SDK already pulls in transitively.

### Test pattern

```kotlin
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class BrazePluginWireIntegrationTest {

    private lateinit var wire: WireHarness

    @Before fun setUp() { wire = IntegrationSupport.wireHarness() }
    @After fun tearDown() { wire.shutdown() }

    @Test
    fun `logCustomEvent puts the name and properties on the wire`() {
        wire.initialize()
        wire.plugin.logCustomEvent(wire.call(JSObject().put("name", "wire_event_A91D")))
        wire.flush()
        wire.awaitRequest("the custom event") { it.customEvent("wire_event_A91D") != null }
    }
}
```

### The four things that made Android hard

1. **`Braze.configure` is a no-op once a live instance exists.** It returns `false`, keeps the first
   configuration — endpoint included — and changes nothing, so the second test in a JVM would
   silently post at the previous test's closed port. `IntegrationSupport.resetSdk()` is the way out:
   `disableSdk` stops the instance, `enableSdk` revives it un-configured, and the next `configure`
   takes.
2. **Every Braze state transition is asynchronous.** `Braze.isDisabled` still reports the old value
   when `disableSdk` returns, and `currentUser` is null for a while after `configure`. Both are
   waited out — the first in `resetSdk`, the second in `TestSupport.initializedPlugin`. Skipping
   either produces failures several test *classes* away from the cause: an integration teardown that
   left the SDK mid-transition is what made `getUserId reports an anonymous user as JSON null`
   flaky.
3. **`notifyOnMain` goes through `Bridge.executeOnMainThread`.** A bare Mockito mock swallows the
   `Runnable`, so every listener event would vanish. The harness stubs it to run inline.
4. **Sessions need an Activity, and `AppCompatActivity` needs a theme.** `registerSessionLifecycleOnce`
   only calls `openSession` when `bridge.activity` is non-null, and the Robolectric-built activity
   must have `Theme_AppCompat` set *before* `create()` or it throws.

Listener events are captured by registering a `fakePluginCall` through Capacitor's own
`Plugin.addListener`, so assertions cover the real `notifyListeners` dispatch rather than a stub of
it.

### CI integration

None needed. The integration tests are in the same Gradle module the `verify-android` job already
runs via `:capacitor-braze:testDebugUnitTest`.

---

## Scenario coverage

The integration tier covers one scenario per row, on each platform, against the real SDK. `wire`
means the assertion is on the HTTP body or headers; `listener` means it also asserts the
`notifyListeners` payload the response produced.

| Scenario | Android | iOS |
|---|---|---|
| `initialize` posts an identified request to the configured endpoint | wire | wire |
| A session is open and stamps events | wire (`ss`) | wire (`ss`, on `changeUser`) |
| `changeUser` | wire (`attributes[].user_id`) | wire (`respond_with.user_id`) |
| `setEmail` | wire | wire |
| `setCustomUserAttribute` | wire (`attributes[].custom`) | wire (`attributes[].custom`) |
| `registerPushToken` | wire | wire (via a real 32-byte hex token) |
| `logCustomEvent` + properties | wire (`ce` / `n` / `p`) | wire (`ce` / `n` / `p`) |
| `logPurchase` | wire (`p` / `pid,c,p,q`) | wire (`p` / `pid,c,p,q`) |
| Subscription groups, both directions | wire (`sgu` / `status`) | wire (`sgu` / `status`) |
| `refreshFeatureFlags` | wire + listener + `getFeatureFlag` | wire only ¹ |
| `requestContentCardsRefresh` | wire + listener + `getContentCards` | wire only ¹ |
| SDK-Auth signature on the wire | wire (header) | wire (header) |
| `sdkAuthError` delivery | wire + listener | **skipped** ² |
| `disableSDK` stops traffic, `enableSDK` resumes | wire (bracketed by positive controls) | same |
| `wipeData` discards queued analytics, new device id | wire | wire |

¹ The sync *request* is asserted. Getting BrazeKit to turn the sync *response* into a
`subscribeToUpdates` emission was not reachable from a mock; the response is accepted without a
decoding error and the subscription never fires. Covered end to end on Android.

² BrazeKit 18.2.1 does not surface a mock server's `auth_error` response to `sdkAuthDelegate`. Four
envelope/status combinations were tried and are recorded in the test's doc comment. The signature
*is* asserted on the wire, the payload shape is unit-tested, and the whole path is covered on
Android.

Both gaps are iOS response-*parsing*, not bridge behaviour, and both are what a Layer 4 smoke
capture would close: record the real responses, replay them through the harness.

## Forbidden

- **Skipping native behavioral tests in favor of "more web tests."** The web bridge is already over-tested relative to native. Net incremental coverage from web tests is low; native tests add new ground truth.
- **Mocking the Braze SDK itself.** The whole point is testing the bridge → real SDK → HTTP path. Replacing the SDK with a mock means testing the mock, not the bridge.
- **Adding emulator-based instrumented tests in CI before Robolectric proves insufficient.** Emulator startup time is a 5-minute tax per job per push; only worth it if Robolectric demonstrably misses a class of bug.
- **Mocking the Capacitor bridge instead of stubbing it.** Android's `TestSupport.fakePluginCall` replicates `PluginCall`'s *strict* accessor semantics (`getInt` returning null for a non-integer, etc.). A permissive fake would pass tests the real bridge fails.
- **Writing a test that only asserts "does not throw."** The 2026-09 audit found eleven tests that would survive their implementation being replaced with `return;`. Assert the wire output or the exact error string.
- **Trusting a native test tier you have not seen fail.** Both tiers here shipped in a state where they could not run: the iOS suite had no target for four months, and the Android suite's own docstring claimed a mocked bridge it never created. Break something on purpose and confirm red.
- **Sleeping as the only synchronisation.** Every wait in both harnesses is a bounded poll on
  material the SDK or the server actually produced. The one exception is `assertNoFurtherRequests`,
  which is a quiet window by nature — and it is only ever used bracketed by positive controls, so
  silence cannot pass for a broken harness.
- **Leaving the SDK in an unknown state at teardown.** Both SDKs keep process- and container-level
  state that outlives any one instance, so a test that hands over a disabled, mid-transition or
  mid-flush SDK breaks a *later* test class and the failure names the wrong culprit. The Android
  harness hands over a live, configured singleton; the iOS harness wipes on the way *in*.

## Status

**Both tiers are implemented on both platforms and run in CI**, inside the existing test invocations — no workflow change was required.

### Android — 106 Robolectric/JUnit tests, in CI

Run with `cd demo/android && ./gradlew :capacitor-braze:testDebugUnitTest --no-daemon` (JDK 21 +
`ANDROID_HOME`). CI runs it in `verify-android`, followed by `:capacitor-braze:lintDebug`.

| File | Tests | Covers |
|---|---|---|
| `TestSupport.kt` | — | `fakePluginCall` replicating `PluginCall`'s strict accessor semantics; `initializedPlugin()`; reject/resolve captors |
| `BrazePluginContractTest.kt` | 45 | Every `@PluginMethod` validation branch, byte-exact against `src/web.ts`, plus a table-driven init-guard sweep over all 29 guarded methods (C07) |
| `BrazePluginSerializerTest.kt` | 24 | Every serializer, driven against **real Braze model objects parsed from Braze's own wire JSON**, including content-card `useWebView` |
| `BrazePluginLifecycleTest.kt` | 22 | Log level (both branches + reversibility), double-`initialize`, `handleOnDestroy` / `wipeData` teardown, the listener-ordering guard, `sdkAuthError` payload, the `IBrazeDeeplinkHandler` install/chain for `deepLinkHandling: 'app'`, and the SDK-rejection warning |
| `IntegrationSupport.kt` | — | MockWebServer harness: SDK reset, `WireRequest` JSON accessors, `WireHarness` polling helpers, `BrazeWire` envelopes |
| `BrazePluginWireIntegrationTest.kt` | 15 | The integration tier — see the scenario matrix above |

**The unlock was running `initialize` end-to-end under Robolectric.** Stub the `Bridge` so
`getContext()` returns the Robolectric application, and `Braze.configure`, `currentUser`, `deviceId`,
`getCachedContentCards`, `getAllFeatureFlags` and the subscriptions all work. That is what makes
post-init branches and SDK-backed happy paths reachable; the previous suite stopped at the init
guard, which is why it covered 3 of 35 methods.

**Fixture notes for whoever extends this.** Braze's Content Card wire keys at 43.2.0 are `id`, `ca`
(created, required), `ea`, `v`, `p`, `r`, `cl`, `d`, `db`, `dm`, `u`, `ar`, `e`, `t`, `uw`, `tt`,
`ds`, `i`, `image_alt`, established empirically against the published AAR and documented in the test
file. `FeatureFlag`'s constructors and `BrazeSdkAuthenticationErrorEvent`'s only constructor are
`internal` to the SDK, so those two fixtures use reflection and a Mockito mock respectively;
everything else is a real object from real JSON. The serializers were widened `private` → `internal`
(name-mangled, invisible to consumers) with a comment saying why.

**To add a test:** write it in the matching file. Nothing else — the Gradle module is already wired
through the demo's `settings.gradle`.

### iOS — 50 XCTests (1 skipped), in CI

```bash
ruby scripts/ios-add-test-target.rb      # idempotent; regenerates the target from the directory
cd demo/ios/App && pod install
xcodebuild test -workspace App.xcworkspace -scheme App \
  -destination 'platform=iOS Simulator,name=iPhone 17,OS=latest' CODE_SIGNING_ALLOWED=NO
```

`scripts/ios-add-test-target.rb` adds a `CapacitorBrazeTests` unit-test bundle to
`demo/ios/App/App.xcodeproj` via the `xcodeproj` gem, hosted by `App`, with `ios/Tests/BrazePluginTests/*.swift`
as its sources. It re-globs the directory and rewrites the settings on every run, and the resulting
`project.pbxproj` and **shared** scheme are committed — so CI runs the script and fails if the
committed project is stale, which makes it a consistency check as well as a generator.

Implementation notes worth keeping:

- The gem is not on system Ruby's path; the script borrows CocoaPods' `GEM_HOME` out of the Homebrew `pod` shim and re-execs, so a contributor needs no extra `gem install`.
- The scheme must be **shared** (`App.xcodeproj/xcshareddata/xcschemes/App.xcscheme`) — the autocreated one is per-user and invisible to CI.
- `PRODUCT_NAME = $(TARGET_NAME)` is not optional: without it the generated target links to `PlugIns/.xctest` (no stem) and the build dies with *"Multiple commands produce …/PlugIns/.xctest"*.
- `demo/ios/App/Podfile` nests `target 'CapacitorBrazeTests' do inherit! :search_paths end` under `App`, which is what makes `@testable import CapacitorBraze` resolve. `ENABLE_TESTABILITY = YES` is already set for Debug in the generated Pods project, so no post-install hook is needed.

Unit tier (35, in `BrazePluginContractTests.swift`): the 5 pre-existing serializer tests, plus
`classifyAttributeValue` bool/int/double dispatch including the `0`/`1` regression (5),
`dataFromHex` including `"<>"` / `"   "` / over-length (4), `propertiesError` + `integerValue` C04
strings (4), `BrazeExtras.stringify` (3), the `sdkAuthError` payload including `userId: null` and
the `BrazeSDKAuthDelegate`-not-`BrazeDelegate` type assertion (4), the slide-up icon (1), and the
`deepLinkHandling` validation + `Braze.Channel` → `source` mapping + content-card `useWebView` (9).

Integration tier (15, in `BrazePluginWireIntegrationTests.swift` on `BrazeWireHarness.swift`): the
scenario matrix above. One is skipped — `sdkAuthError` delivery — and carries the full account of
what was tried in its doc comment.

**To add a test:** add the file to `ios/Tests/BrazePluginTests/`, then re-run `ruby scripts/ios-add-test-target.rb`
and commit the regenerated project. Adding a test *method* to an existing file needs neither.

**Note the deviation from this MDC's original "Forbidden" list**, which said plugin tests must not
live in the demo app's target. They do, via a *separate* target inside the demo's project, because a
Capacitor plugin Pod has no host app of its own and an XCTest bundle needs one. The demo's own source
is untouched; only the `.xcodeproj` and `Podfile` gained a nested target. The rule's intent — don't
muddle consumer-facing reference code with plugin tests — is preserved.

### What's left

- **Two iOS response-parsing scenarios**, both detailed in the scenario matrix above:
  `featureFlagsUpdated` / `contentCardsUpdated` delivery (the refresh *request* is asserted; the
  response never reaches `subscribeToUpdates`) and `sdkAuthError` delivery (skipped). Both are
  BrazeKit-side unknowns, both are covered end to end on Android, and both are what a Layer 4 smoke
  capture would close.
- **`inAppMessageReceived` delivery on the native tiers.** Web is covered end to end as of `0.2.0` —
  the mock server returns real trigger envelopes and the Web SDK's own trigger engine builds the
  message. Nothing reproduces that on iOS or Android; the DTO is covered at the serializer level on
  all three platforms. The harnesses can now host it; what is missing is a trigger envelope each
  native SDK's trigger engine accepts.
- **Coverage instrumentation on the native bridges.** The web bridge is measured by
  `@vitest/coverage-v8` (`npm --prefix test/web run test:coverage`) at 97.45% statements/lines on
  `src/web.ts`, with thresholds that fail the `test-web` job on a regression. The native tiers report
  **test counts, not coverage**: neither JaCoCo (a `jacocoTestReport` task wired to
  `testDebugUnitTest`) nor `xcodebuild -enableCodeCoverage YES` is configured, so nobody knows which
  bridge branches the 106 + 50 tests actually reach. `docs/TEST-COVERAGE-AUDIT.md` tracks it as the
  open coverage item.
- **Per-class JVM forking on Android.** Robolectric shares one sandbox across test classes in a JVM,
  so the process-global Braze singleton carries state between them. The harnesses handle this
  explicitly (reset on the way in, hand over a usable SDK on the way out), and the suite is stable —
  but `testOptions { unitTests { all { forkEvery 1 } } }` in `android/build.gradle` would make the
  isolation structural rather than by convention, for the cost of three extra JVM starts.

The 2026-05 audit's L6-01 finding is closed. Ongoing coverage tracks against
[`docs/audits/2026-09/A5-tests-ci.md`](../audits/2026-09/A5-tests-ci.md) and the smoke-test
playbooks in [`docs/smoke-tests/`](../smoke-tests/).
