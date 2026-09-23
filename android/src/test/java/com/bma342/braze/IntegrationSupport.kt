package com.bma342.braze

import com.braze.Braze
import com.braze.configuration.BrazeConfig
import com.getcapacitor.Bridge
import com.getcapacitor.JSObject
import com.getcapacitor.PluginCall
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.json.JSONArray
import org.json.JSONObject
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import org.robolectric.Robolectric
import org.robolectric.RuntimeEnvironment
import java.net.InetAddress
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Harness for the C11 **integration tier** on Android.
 *
 * Where [TestSupport] stops at the bridge boundary — did the right SDK
 * method get called with the right arguments — this harness runs the whole
 * stack: the plugin drives the real `com.braze:android-sdk-ui` 43.2.0, the
 * SDK's own networking posts to a real local HTTP server, and the test
 * asserts the bytes that reached the wire plus whatever came back out
 * through `notifyListeners`.
 *
 * Four things make that work, and none of them are obvious:
 *
 * 1. **The SDK is a process-global singleton.** `Braze.configure` returns
 *    `false` — keeping the *first* configuration, endpoint included — once a
 *    live instance exists, so a second test in the same JVM would silently
 *    post at the previous test's already-closed port. [resetSdk] is the
 *    documented way out: `disableSdk` stops the instance, `enableSdk`
 *    revives it un-configured, and the next `configure` takes. Every test
 *    calls it before `initialize` and again in teardown, which also leaves
 *    the SDK quiet for whatever test class runs next.
 * 2. **`notifyOnMain` goes through `Bridge.executeOnMainThread`.** A bare
 *    Mockito mock swallows the `Runnable`, so every listener event would
 *    vanish. [wireHarness] stubs it to run inline — Braze dispatches its
 *    subscribers off its own threads, and the capture list is concurrent,
 *    so inline execution is both correct and free of looper pumping.
 * 3. **Listener events are captured through the real registry.** Tests call
 *    `plugin.addListener(fakePluginCall({eventName: …}))` — Capacitor's own
 *    `Plugin.addListener` — so the assertion covers `notifyListeners`'
 *    real dispatch path rather than a stub of it. The retained `PluginCall`
 *    is a Mockito mock, so every emission is recoverable via
 *    [WireHarness.eventsFor].
 * 4. **Sessions need an Activity.** `registerSessionLifecycleOnce` only
 *    calls `openSession` when `bridge.activity` is non-null, and
 *    `AppCompatActivity` refuses to start without an AppCompat theme — hence
 *    the explicit `setTheme` before `create()`.
 *
 * Nothing here sleeps as its only synchronisation: every wait is a bounded
 * poll on a predicate over material the server or the plugin has actually
 * produced ([WireHarness.awaitRequest], [WireHarness.awaitEvent],
 * [WireHarness.awaitRequestRetrying]).
 */
internal object IntegrationSupport {

    /** Bound on every poll in this harness. Generous; never reached on a pass. */
    const val TIMEOUT_MS: Long = 20_000

    /**
     * How long a "no traffic" assertion watches the server before
     * concluding nothing is coming. Only ever used *after* a positive
     * control has proven the same server/plugin pair was posting a moment
     * earlier, and (for `disableSDK`) before a second positive control
     * proves it posts again — so the window is corroboration, not the whole
     * assertion.
     */
    const val QUIET_WINDOW_MS: Long = 2_000

    /**
     * Stops and revives the process-global Braze singleton so the next
     * `Braze.configure` is honoured. See the class docs, point 1.
     *
     * Both halves are **asynchronous** — `Braze.isDisabled` still reports the
     * old value when the call returns — so each is waited out. Skipping the
     * wait is not a theoretical risk: configuring while the SDK is still
     * disabled yields an instance whose `currentUser` is null, which shows up
     * as an unrelated test class failing on `getUserId` several classes later.
     * This also leaves a clean, enabled-but-unconfigured singleton behind for
     * whatever test Gradle runs next.
     */
    fun resetSdk() {
        val app = RuntimeEnvironment.getApplication()
        Braze.disableSdk(app)
        awaitSdkState("disabled") { Braze.isDisabled }
        Braze.enableSdk(app)
        awaitSdkState("enabled") { !Braze.isDisabled }
    }

    /**
     * Teardown counterpart to [resetSdk]: leaves the singleton **live and
     * configured**, pointed at a closed loopback port so it can never reach
     * anything.
     *
     * [resetSdk] alone leaves it enabled but unconfigured, and `currentUser` is
     * null in that state. The next test class's `initializedPlugin()` calls
     * `Braze.configure`, which does not populate `currentUser` synchronously —
     * so a test that reads the user immediately (`getUserId reports an
     * anonymous user as JSON null`) intermittently saw null and failed several
     * classes away from the cause. Handing over an SDK that already has a user
     * removes the race: that later `configure` returns false and keeps this
     * configuration, and `currentUser` is non-null from the first instruction.
     */
    fun leaveSdkUsableForOtherTests() {
        resetSdk()
        val app = RuntimeEnvironment.getApplication()
        Braze.configure(
            app,
            BrazeConfig.Builder()
                .setApiKey("integration-teardown")
                // Port 1 is never listening. The cluster-shape warning exempts
                // 127.0.0.1, and nothing here should ever touch a real host.
                .setCustomEndpoint("http://127.0.0.1:1")
                .build(),
        )
        awaitSdkState("usable") { Braze.getInstance(app).currentUser != null }
    }

    /** Polls a Braze state predicate, which is never synchronous. */
    fun awaitSdkState(label: String, predicate: () -> Boolean) {
        val deadline = System.currentTimeMillis() + TIMEOUT_MS
        while (System.currentTimeMillis() < deadline) {
            if (predicate()) return
            Thread.sleep(10)
        }
        throw AssertionError("Braze SDK never became $label within ${TIMEOUT_MS}ms.")
    }

    /**
     * Boots a [WireHarness]: a MockWebServer on 127.0.0.1 answering with
     * [BrazeWire.serverConfig] until a test swaps [WireHarness.responder],
     * plus a [BrazePlugin] wired to a Robolectric Activity and an inline
     * main-thread executor.
     *
     * The plugin is *not* initialized — a test calls
     * [WireHarness.initialize] so it can pass its own options.
     */
    fun wireHarness(): WireHarness {
        resetSdk()

        val requests = CopyOnWriteArrayList<WireRequest>()
        val harnessRef = arrayOfNulls<WireHarness>(1)
        val server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val raw = request.body.readUtf8()
                requests.add(
                    WireRequest(
                        path = request.path.orEmpty(),
                        method = request.method.orEmpty(),
                        raw = raw,
                        headers = request.headers.toMultimap()
                            .mapValues { (_, v) -> v.firstOrNull().orEmpty() },
                    ),
                )
                val responder = harnessRef[0]?.responder ?: { BrazeWire.serverConfig() }
                return MockResponse()
                    .setResponseCode(200)
                    .setHeader("Content-Type", "application/json")
                    .setBody(responder(request))
            }
        }
        server.start(InetAddress.getByName("127.0.0.1"), 0)

        val bridge = mock<Bridge>()
        whenever(bridge.context).thenReturn(RuntimeEnvironment.getApplication())
        val controller =
            Robolectric.buildActivity(androidx.appcompat.app.AppCompatActivity::class.java)
        controller.get().setTheme(androidx.appcompat.R.style.Theme_AppCompat)
        whenever(bridge.activity).thenReturn(controller.create().start().resume().get())
        whenever(bridge.executeOnMainThread(any())).thenAnswer {
            it.getArgument<Runnable>(0).run()
            null
        }
        val plugin = BrazePlugin().also { it.setBridge(bridge) }

        return WireHarness(server, plugin, requests).also { harnessRef[0] = it }
    }
}

/** One request the Braze SDK actually put on the wire. */
internal data class WireRequest(
    val path: String,
    val method: String,
    val raw: String,
    val headers: Map<String, String>,
) {
    /** The body parsed as JSON. Every Braze request body is a JSON object. */
    val json: JSONObject by lazy { JSONObject(raw) }

    /** `events` array, or empty — absent on requests that carry only attributes. */
    fun events(): List<JSONObject> = jsonArray("events")

    /** `attributes` array, or empty. */
    fun attributes(): List<JSONObject> = jsonArray("attributes")

    /** The first `events[]` entry whose `name` is [name], or null. */
    fun event(name: String): JSONObject? = events().firstOrNull { it.optString("name") == name }

    /**
     * The custom event called [name], or null.
     *
     * Not `event("ce")`: Braze batches, so one request routinely carries
     * several `ce` entries and the first is rarely the one a test means. That
     * distinction is the difference between a stable assertion and one that
     * fails whenever the SDK happens to coalesce two flushes.
     */
    fun customEvent(name: String): JSONObject? = events().firstOrNull {
        it.optString("name") == "ce" && it.optJSONObject("data")?.optString("n") == name
    }

    private fun jsonArray(key: String): List<JSONObject> {
        val array: JSONArray = json.optJSONArray(key) ?: return emptyList()
        return (0 until array.length()).mapNotNull { array.optJSONObject(it) }
    }
}

/**
 * The exact JSON Braze's own backend returns, as established empirically
 * against `com.braze:android-sdk-ui` 43.2.0 and cross-checked against the
 * key tables in the SDK's `com.braze.enums.CardKey` / `bo.app.m4`.
 *
 * Kept in one place so the Android and iOS integration tiers assert against
 * the same envelopes the TypeScript mock server
 * (`test/mock-server/src/index.ts`) serves the web bridge.
 */
internal object BrazeWire {

    /**
     * The server-config envelope. It rides on the response to a
     * `/api/v3/data/` POST, and it is what switches Feature Flags and
     * Content Cards on — without it `requestContentCardsRefresh` logs
     * *"Content Cards are disabled. Not requesting a Content Cards
     * refresh."* and never reaches the network.
     *
     * `time` must be a plausible current unix-*seconds* value: the SDK
     * compares it against the cached `CONFIG_TIME` and ignores anything not
     * newer. `refresh_rate_limit: 0` removes the client-side throttle so a
     * test can refresh immediately after initialize.
     */
    fun serverConfig(extra: String = ""): String =
        """
        {"message":"success",
         "config":{"time":${System.currentTimeMillis() / 1000},
           "feature_flags":{"enabled":true,"refresh_rate_limit":0},
           "content_cards":{"enabled":true,"refresh_rate_limit":0}}$extra}
        """.trimIndent()

    /**
     * A `/api/v3/feature_flags/sync` response. The array is top-level
     * `feature_flags`; each entry is `{id, enabled, properties}` with
     * properties in the C02 tagged-union form.
     */
    fun featureFlagsSync(id: String, enabled: Boolean, properties: String = "{}"): String =
        """{"message":"success","feature_flags":[{"id":"$id","enabled":$enabled,"properties":$properties}]}"""

    /**
     * A `/api/v3/content_cards/sync` response. Top-level `cards` +
     * `full_sync` (both read by `bo.app.m4`); the per-card keys are
     * `com.braze.enums.CardKey`'s wire names — `tp` selects the concrete
     * `Card` subclass from `banner_image` / `captioned_image` /
     * `text_announcement` / `short_news` / `control`.
     */
    fun contentCardsSync(cards: String): String =
        """{"message":"success","full_sync":true,"cards":[$cards]}"""

    /** A `short_news` card: `tt` title, `ds` description, `i` image, `u` url. */
    fun shortNewsCard(id: String, title: String, description: String): String =
        """{"id":"$id","tp":"short_news","ca":1700000000,"tt":"$title","ds":"$description",
           "u":"https://example.test/click","i":"https://example.test/image.png"}"""

    /**
     * The SDK-Authentication failure envelope, delivered on an otherwise
     * successful `/api/v3/data/` response. Key names from `bo.app.kc`:
     * `auth_error` holding `error_code` / `reason` / `signature` /
     * `user_id` / `request_time`.
     */
    fun authError(userId: String, signature: String, code: Int = 401, reason: String = "bad signature"): String =
        """
        {"message":"success",
         "auth_error":{"error_code":$code,"reason":"$reason","signature":"$signature",
           "user_id":"$userId","request_time":${System.currentTimeMillis()}}}
        """.trimIndent()

    /** Header the SDK carries the SDK-Auth JWT in. */
    const val AUTH_HEADER: String = "X-Braze-Auth-Signature"
}

/**
 * A live MockWebServer + initialized [BrazePlugin] pair, with the polling
 * helpers the tests assert through.
 */
internal class WireHarness(
    private val server: MockWebServer,
    val plugin: BrazePlugin,
    val requests: CopyOnWriteArrayList<WireRequest>,
) {

    /**
     * What the server answers with. Swap it mid-test to deliver a scripted
     * payload (feature flags, content cards, an auth error) on the next
     * request the SDK happens to make.
     */
    @Volatile
    var responder: (RecordedRequest) -> String = { BrazeWire.serverConfig() }

    /** `http://127.0.0.1:<ephemeral>` — what `initialize` is pointed at. */
    val endpoint: String get() = server.url("/").toString().trimEnd('/')

    /** Runs the plugin's real `initialize` against [endpoint]. */
    fun initialize(extraOptions: JSObject.() -> Unit = {}): PluginCall {
        val data = JSObject()
            .put("apiKey", "integration-test-key")
            .put("endpoint", endpoint)
            .put("allowInsecureEndpoint", true)
        data.extraOptions()
        val call = TestSupport.fakePluginCall(data)
        plugin.initialize(call)
        Mockito.verify(call).resolve()
        return call
    }

    /** Invokes a plugin method with [data] and returns the call for assertions. */
    fun call(data: JSObject = JSObject()): PluginCall = TestSupport.fakePluginCall(data)

    /** Registers a real listener for [eventName]; read it back with [eventsFor]. */
    fun listen(eventName: String): PluginCall {
        val call = TestSupport.fakePluginCall(JSObject().put("eventName", eventName))
        plugin.addListener(call)
        return call
    }

    /** Every payload `notifyListeners` has delivered to [listener] so far. */
    fun eventsFor(listener: PluginCall): List<JSObject> = try {
        val captor = ArgumentCaptor.forClass(JSObject::class.java)
        Mockito.verify(listener, Mockito.atLeastOnce()).resolve(captor.capture())
        captor.allValues.toList()
    } catch (_: Throwable) {
        emptyList()
    }

    /** Forces the SDK to drain its queue now rather than on its own cadence. */
    fun flush() {
        plugin.requestImmediateDataFlush(TestSupport.fakePluginCall(JSObject()))
    }

    /**
     * Polls until a captured request satisfies [predicate]. Fails with a
     * dump of everything the server did see, which is the difference
     * between a useful failure and a bare timeout.
     */
    fun awaitRequest(label: String, predicate: (WireRequest) -> Boolean): WireRequest {
        val deadline = System.currentTimeMillis() + IntegrationSupport.TIMEOUT_MS
        while (System.currentTimeMillis() < deadline) {
            requests.firstOrNull(predicate)?.let { return it }
            Thread.sleep(25)
        }
        throw AssertionError(
            "Timed out after ${IntegrationSupport.TIMEOUT_MS}ms waiting for $label.\n" + dump(),
        )
    }

    /**
     * [awaitRequest], but re-running [action] on every poll.
     *
     * Feature Flags and Content Cards are gated on the server config, which
     * arrives on the response to the *first* data POST — so a refresh issued
     * immediately after `initialize` can lose the race and be dropped by the
     * SDK with "…are disabled". Retrying the refresh until the sync request
     * appears removes the race without a sleep-and-hope.
     */
    fun awaitRequestRetrying(label: String, action: () -> Unit, predicate: (WireRequest) -> Boolean): WireRequest {
        val deadline = System.currentTimeMillis() + IntegrationSupport.TIMEOUT_MS
        while (System.currentTimeMillis() < deadline) {
            action()
            val innerDeadline = System.currentTimeMillis() + 500
            while (System.currentTimeMillis() < innerDeadline) {
                requests.firstOrNull(predicate)?.let { return it }
                Thread.sleep(25)
            }
        }
        throw AssertionError(
            "Timed out after ${IntegrationSupport.TIMEOUT_MS}ms waiting for $label.\n" + dump(),
        )
    }

    /** Polls until [listener] has received a payload satisfying [predicate]. */
    fun awaitEvent(listener: PluginCall, label: String, predicate: (JSObject) -> Boolean): JSObject {
        val deadline = System.currentTimeMillis() + IntegrationSupport.TIMEOUT_MS
        while (System.currentTimeMillis() < deadline) {
            eventsFor(listener).firstOrNull(predicate)?.let { return it }
            Thread.sleep(25)
        }
        throw AssertionError(
            "Timed out after ${IntegrationSupport.TIMEOUT_MS}ms waiting for $label.\n" +
                "Events delivered: ${eventsFor(listener)}\n" + dump(),
        )
    }

    /**
     * Watches for [IntegrationSupport.QUIET_WINDOW_MS] and asserts nothing
     * new reached the server. Callers pair this with a positive control so
     * it can't pass because the harness was broken.
     */
    fun assertNoFurtherRequests(label: String) {
        val before = requests.size
        val deadline = System.currentTimeMillis() + IntegrationSupport.QUIET_WINDOW_MS
        while (System.currentTimeMillis() < deadline) {
            if (requests.size > before) {
                throw AssertionError(
                    "Expected no traffic $label, but the server received " +
                        "${requests.size - before} more request(s).\n" + dump(),
                )
            }
            Thread.sleep(25)
        }
    }

    /** Drops captured requests so a later assertion can't match an earlier one. */
    fun clearRequests() {
        requests.clear()
    }

    private fun dump(): String =
        "Captured ${requests.size} request(s):\n" +
            requests.joinToString("\n") { "  ${it.method} ${it.path}\n    ${it.raw.take(1200)}" }

    /**
     * Stops the SDK *before* the port goes away, so a queued flush cannot
     * fire at a dead socket during the next test, then shuts the server down
     * and hands the next test class a live, configured singleton
     * ([IntegrationSupport.leaveSdkUsableForOtherTests]).
     */
    fun shutdown() {
        try {
            plugin.handleOnDestroy()
        } catch (_: Throwable) {
            // The plugin is being discarded; a teardown failure here would
            // mask the real assertion failure.
        }
        IntegrationSupport.leaveSdkUsableForOtherTests()
        server.shutdown()
    }
}
