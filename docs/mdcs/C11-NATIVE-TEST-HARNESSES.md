# C11 — Native test harnesses

**iOS and Android bridges need behavioral coverage equivalent to what `test/web` gives the JS bridge. This MDC documents the design for both platforms so the implementation, when it lands, follows a single architectural shape rather than being reinvented per phase.**

The web bridge currently runs against a Fastify mock under jsdom (53 vitest tests, ~2.4s). The native bridges currently have *compile-only* coverage via `verify-ios` and `verify-android`. The gap that closes when this MDC's implementations ship: catching wire-format regressions, validating cross-platform DTO consistency, and proving the bridge translation logic without depending on a real Braze account on every PR.

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

## iOS — XCTest + URLProtocol intercept

### Approach

Use `URLProtocol` to intercept BrazeKit's outbound HTTP at the Foundation layer. BrazeKit uses `URLSession` for its network traffic (verified by reading the published `BrazeKit.swiftinterface`); URLProtocol is the canonical Apple pattern for swapping URL traffic in tests.

**Why not reuse the Fastify mock via Process spawning?**

We considered booting `test/mock-server` from `setUp()` via `Process`. Pros: zero divergence from the web test path; same captured assertions. Cons: requires Node available on the test runner, adds inter-process startup latency, makes test failures harder to diagnose. URLProtocol keeps everything in-process and in Swift; the assertion API ends up tighter.

### Setup

`test/ios/` directory at the repo root, organized as a separate Xcode-loadable target. Recommended structure:

```
test/ios/
├── BrazePluginTests.xcodeproj          # Standalone Xcode project; depends on the plugin Pod
├── BrazePluginTestsTests/              # Test bundle target
│   ├── BrazePluginTestsTests-Bridging-Header.h
│   ├── MockBrazeURLProtocol.swift      # URLProtocol subclass; captures POSTs
│   ├── CapturedRequest.swift           # Same shape as test/mock-server's CapturedRequest
│   ├── PluginCallBuilder.swift         # CAPPluginCall construction helper
│   ├── EventsTests.swift               # mirrors test/web/src/events.test.ts
│   ├── AttributesTests.swift
│   ├── IdentityTests.swift
│   ├── LifecycleTests.swift
│   └── PushTokenTests.swift
└── Podfile                             # depends on CapacitorBraze (file:../..)
```

### `MockBrazeURLProtocol` sketch

```swift
final class MockBrazeURLProtocol: URLProtocol {
    static var captured: [CapturedRequest] = []
    static let clear = { captured.removeAll() }

    override class func canInit(with request: URLRequest) -> Bool {
        guard let host = request.url?.host else { return false }
        return host == "127.0.0.1" || host == "mock.test.braze"
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let body = request.httpBody.flatMap { String(data: $0, encoding: .utf8) }
        Self.captured.append(CapturedRequest(
            path: request.url?.path ?? "",
            method: request.httpMethod ?? "POST",
            bodyText: body
        ))
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json", "Access-Control-Allow-Origin": "*"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: "{\"message\":\"success\"}".data(using: .utf8)!)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
```

Register in `setUp()` via `URLProtocol.registerClass(MockBrazeURLProtocol.self)`. Unregister in `tearDown()` to keep tests hermetic.

### Plugin instantiation pattern

```swift
override func setUp() async throws {
    URLProtocol.registerClass(MockBrazeURLProtocol.self)
    MockBrazeURLProtocol.captured.removeAll()
    plugin = BrazePlugin()
    let initCall = PluginCallBuilder()
        .with("apiKey", "test-key")
        .with("endpoint", "http://mock.test.braze")
        .with("allowInsecureEndpoint", true)
        .build()
    plugin.initialize(initCall)
    try await initCall.waitForResolution()
}
```

`PluginCallBuilder` is a thin helper that constructs a `CAPPluginCall` with synchronous resolution capture — needed because production `CAPPluginCall` resolves to JS asynchronously, and tests need to wait. ~20 lines.

### CI integration

Extend `verify-ios` job in `.github/workflows/test.yml`:

```yaml
- name: Run iOS XCTest
  working-directory: test/ios
  run: |
    pod install
    xcodebuild test \
      -workspace BrazePluginTests.xcworkspace \
      -scheme BrazePluginTests \
      -sdk iphonesimulator \
      -destination 'platform=iOS Simulator,name=iPhone 16,OS=latest' \
      CODE_SIGNING_ALLOWED=NO
```

Run time estimate: +3-5 min beyond the existing `verify-ios` compile step.

---

## Android — JVM unit tests + OkHttp MockWebServer + Robolectric

### Approach

**MockWebServer** (from OkHttp) for HTTP capture — already a transitive dependency of the Braze Android SDK, no new packages needed. **Robolectric** for the Android runtime stubs (Context, Application, SharedPreferences) — needed because `Braze.getInstance(context)` requires a real Android Context, and JVM tests can't provide one without an emulator or Robolectric.

**Why not instrumented tests on a real emulator?**

Instrumented tests need either a connected device or an emulator running on the CI runner. The android-actions/avd-action GitHub Action can boot an emulator in CI but adds ~5 minutes of startup per job. Robolectric runs on the JVM in ~1 second. The trade-off is Robolectric provides *approximations* of Android APIs — usually good enough for SDK boundary testing, occasionally surprises.

For this plugin's testing needs (boundary between Capacitor's PluginCall and Braze's Java/Kotlin SDK), Robolectric is sufficient. Instrumented tests would catch a narrower set of additional issues at significantly higher CI cost.

### Setup

Add tests to the plugin's existing `android/src/test/` directory (already declared in `android/build.gradle` via `testImplementation`):

```
android/src/test/java/com/bma342/braze/
├── BrazePluginEventsTest.kt
├── BrazePluginAttributesTest.kt
├── BrazePluginIdentityTest.kt
├── BrazePluginLifecycleTest.kt
├── BrazePluginPushTokenTest.kt
└── support/
    ├── MockServerSetup.kt
    └── PluginCallBuilder.kt
```

### `build.gradle` additions

```groovy
android {
    // Existing config...
    testOptions {
        unitTests {
            includeAndroidResources = true
        }
    }
}

dependencies {
    // Existing config...
    testImplementation 'org.robolectric:robolectric:4.13'
    testImplementation 'androidx.test:core:1.6.1'
    testImplementation 'com.squareup.okhttp3:mockwebserver:4.12.0'
    testImplementation 'org.jetbrains.kotlin:kotlin-test:2.2.0'
}
```

### Test pattern

```kotlin
@RunWith(RobolectricTestRunner::class)
class BrazePluginEventsTest {
    private lateinit var mockServer: MockWebServer
    private lateinit var plugin: BrazePlugin
    private lateinit var context: Context

    @Before
    fun setUp() {
        mockServer = MockWebServer().apply {
            // Braze's success envelope; return on every request
            dispatcher = object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    return MockResponse()
                        .setResponseCode(200)
                        .setHeader("Content-Type", "application/json")
                        .setBody("""{"message":"success"}""")
                }
            }
            start()
        }
        context = ApplicationProvider.getApplicationContext()
        plugin = BrazePlugin().also { it.setContext(context) /* via reflection or test helper */ }

        val initCall = PluginCallBuilder()
            .put("apiKey", "test-key")
            .put("endpoint", mockServer.url("/").toString().trimEnd('/'))
            .put("allowInsecureEndpoint", true)
            .build()
        plugin.initialize(initCall)
    }

    @After
    fun tearDown() {
        mockServer.shutdown()
    }

    @Test
    fun `logCustomEvent puts event name on the wire`() {
        val call = PluginCallBuilder()
            .put("name", "test_event_A91D")
            .build()
        plugin.logCustomEvent(call)
        val flush = PluginCallBuilder().build()
        plugin.requestImmediateDataFlush(flush)

        val req = mockServer.takeRequestOrFail(timeoutMs = 5000)
        assertContains(req.body.readUtf8(), "test_event_A91D")
    }
}
```

`PluginCallBuilder` mirrors the iOS one — builds a `PluginCall` with synchronous resolution capture so the test can assert without race conditions.

### CI integration

Extend `verify-android` job:

```yaml
- name: Run plugin unit tests
  working-directory: android
  run: ./gradlew test --no-daemon
```

Run time estimate: +1-2 min beyond the existing compile step.

---

## What tests should we write first (when this lands)

When the implementation phase starts, prioritize tests that catch the kind of bugs Phase O / Android-verify unearthed manually:

1. **Wire-format consistency**: assert the same event posted on iOS, Android, and Web produces a body with the same key names + value shapes. This is the single highest-leverage cross-platform check we don't currently have.
2. **`registerPushToken` hex-decode on iOS**: the `dataFromHex` helper hasn't been exercised against a real APNs-style hex string.
3. **Privacy/lifecycle quartet** state transitions per [C07](./C07-INIT-INDEPENDENT-METHODS.md)'s asymmetry — particularly the iOS-specific `enableSDK` post-init requirement.
4. **DTO serialization**: confirm iOS `card.json()` and Android `card.forJsonPut()` produce DTOs that match the canonical Web SDK shape claimed by [C02](./C02-DTO-SHAPES.md). This is the wire-format reconciliation work.

The mock-server harness on `test/web` covers Web-bridge wire output. The native harnesses cover the other two platforms' equivalent. With all three, cross-platform consistency becomes assertable.

## Forbidden

- **Skipping native behavioral tests in favor of "more web tests."** The web bridge is already over-tested relative to native. Net incremental coverage from web tests is low; native tests add new ground truth.
- **Mocking the Braze SDK itself.** The whole point is testing the bridge → real SDK → HTTP path. Replacing the SDK with a mock means testing the mock, not the bridge.
- **Adding emulator-based instrumented tests in CI before Robolectric proves insufficient.** Emulator startup time is a 5-minute tax per job per push; only worth it if Robolectric demonstrably misses a class of bug.
- **Adding XCTest tests in the demo app's test target.** Demo is consumer-facing reference code; mixing plugin tests in muddles its purpose. Tests live in `test/ios/` (separate target, depends on the plugin Pod the same way the demo does).

## Status (as of `0.0.13`)

**Implementation kickoff complete.** Phase 15 of the audit completion pass lands the framework ceremony + the first batch of contract tests:

### Android

- `android/build.gradle` adds Robolectric 4.13 + Mockito 5.14 + Truth 1.4 as `testImplementation` deps, with `testOptions.unitTests.includeAndroidResources = true` so Robolectric can synthesize a working Android context.
- `android/src/test/java/com/bma342/braze/BrazePluginContractTest.kt` covers the audit-fix contract surface:
  - `echo` empty-value rejection (C01 error format)
  - `initialize` validation: empty apiKey, HTTP-without-allowInsecureEndpoint, malformed URL (L5-03), zero `sessionTimeoutInSeconds` (L5-08)
  - `setDateOfBirth` reject path (L2-07)
- CI runs the suite via `./gradlew :capacitor-braze:testDebugUnitTest` in the `verify-android` job.

### iOS

- `ios/PluginTests/BrazePluginContractTests.swift` covers the pure-function serializer surface (`BrazeInAppMessageSerializer`):
  - 5-variant control / html / slideup / modal collapse from BrazeKit's 7-case enum
  - Button array shape per C02
  - Graphic-image flattening to `imageUrl`
- Wiring into the Xcode workspace is documented in the file header. The Capacitor plugin ships as a Pod + SwiftPM target with no host app, so the XCTest bundle hosts inside the demo app's Xcode workspace after `npx cap sync ios` (one-time maintainer setup, ~10 minutes).
- CI wiring is staged for the same setup pass — `xcodebuild test -scheme CapacitorBrazeTests` will run alongside `verify-ios` once the Xcode target lands.

### What's left

- Android: extend coverage to subscription-group rejections, alias validation, customAttribute type dispatch with Long values (L4-K02).
- iOS: extend to `BrazeContentCard` serializer + `BrazeFeatureFlag` typed-accessor walk + the URLProtocol-intercept integration tier this MDC's iOS section originally designed.
- Both: the integration tier (full Capacitor bridge round-trip with mock-server response replay) per the §"What tests should we write first" list above.

The audit's L6-01 finding is closed by this kickoff; ongoing coverage growth tracks against the [`findings/`](../../findings/) punch list and the smoke-test playbooks in [`docs/smoke-tests/`](../smoke-tests/).
