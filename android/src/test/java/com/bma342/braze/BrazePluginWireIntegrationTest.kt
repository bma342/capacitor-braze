package com.bma342.braze

import com.braze.Braze
import com.getcapacitor.JSObject
import com.google.common.truth.Truth.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * C11 **integration tier** — the plugin's bridge code driving the real
 * `com.braze:android-sdk-ui` 43.2.0 against a real local HTTP server.
 *
 * The unit tier ([BrazePluginContractTest], [BrazePluginSerializerTest],
 * [BrazePluginLifecycleTest]) proves the bridge calls the right SDK method
 * with the right arguments and shapes the right DTO. It cannot prove the SDK
 * then puts the right bytes on the wire, which is the only evidence that
 * iOS, Android and Web actually agree — DTO agreement is not wire agreement.
 * That is what these tests add.
 *
 * Every assertion below is on material the Braze SDK itself produced: an
 * HTTP body the SDK POSTed, a header it attached, or a
 * `notifyListeners` payload the plugin emitted in response to a body the
 * SDK parsed. Nothing is stubbed between `PluginCall` and the socket.
 *
 * ## The wire vocabulary these tests pin
 *
 * Braze's analytics envelope abbreviates aggressively; the mapping was
 * established empirically at 43.2.0 and is what the web suite's captured
 * bodies show too:
 *
 * | Wire | Meaning |
 * |---|---|
 * | `events[].name = "ss"` / `"se"` | session start / session end |
 * | `events[].name = "ce"`, `data.n` | custom event, name |
 * | `events[].name = "p"`, `data.{pid,c,p,q}` | purchase: product, currency, price, quantity |
 * | `events[].name = "sgu"`, `data.{group_id,status}` | subscription-group update |
 * | `attributes[].{user_id,email,push_token,…}` | user-profile attributes |
 * | `X-Braze-Auth-Signature` header | SDK Authentication JWT |
 * | `/api/v3/data/` | analytics + server config |
 * | `/api/v3/feature_flags/sync` | feature-flag refresh |
 * | `/api/v3/content_cards/sync` | content-card refresh |
 *
 * See [IntegrationSupport] for why each test resets the process-global SDK
 * and how the listener capture works.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class BrazePluginWireIntegrationTest {

    private lateinit var wire: WireHarness

    @Before
    fun setUp() {
        wire = IntegrationSupport.wireHarness()
    }

    @After
    fun tearDown() {
        wire.shutdown()
    }

    // -------------------------------------------------------------------------
    // Initialize + handshake
    // -------------------------------------------------------------------------

    @Test
    fun `initialize posts an identified request to the configured endpoint`() {
        wire.initialize()

        val request = wire.awaitRequest("the first /api/v3/data POST") {
            it.path.contains("/api/v3/data")
        }

        assertThat(request.method).isEqualTo("POST")
        // The two fields the TypeScript mock server also enforces on every
        // data POST (`validateDataRequest` in test/mock-server/src/index.ts):
        // without them Braze cannot attribute the request to a workspace or
        // an anonymous profile.
        assertThat(request.json.getString("api_key")).isEqualTo("integration-test-key")
        assertThat(request.json.getString("device_id")).isNotEmpty()
        assertThat(request.json.getString("sdk_version")).isEqualTo("43.2.0")
    }

    @Test
    fun `initialize opens a session on the wire`() {
        wire.initialize()

        val request = wire.awaitRequest("a session-start event") {
            it.event("ss") != null
        }

        // A session-start event carries the id every subsequent event in the
        // session is stamped with. Without `registerSessionLifecycleOnce`
        // there would be no `ss` at all and every event would be
        // session-less — the bug that wiring is there to prevent.
        assertThat(request.event("ss")!!.getString("session_id")).isNotEmpty()
    }

    // -------------------------------------------------------------------------
    // Identity
    // -------------------------------------------------------------------------

    @Test
    fun `changeUser puts the user id on the wire`() {
        wire.initialize()
        wire.plugin.changeUser(wire.call(JSObject().put("userId", "wire-user-42")))
        wire.flush()

        val request = wire.awaitRequest("a request attributed to wire-user-42") {
            it.attributes().any { attr -> attr.optString("user_id") == "wire-user-42" }
        }

        // Braze keys both the profile attributes and the response routing on
        // the user id, so it appears in two places.
        assertThat(request.json.getJSONObject("respond_with").getString("user_id"))
            .isEqualTo("wire-user-42")
    }

    @Test
    fun `setEmail puts the address on the wire as a named attribute`() {
        wire.initialize()
        wire.plugin.changeUser(wire.call(JSObject().put("userId", "wire-user-email")))
        wire.plugin.setEmail(wire.call(JSObject().put("email", "wire@example.test")))
        wire.flush()

        wire.awaitRequest("an email attribute") {
            it.attributes().any { attr -> attr.optString("email") == "wire@example.test" }
        }
    }

    @Test
    fun `setCustomUserAttribute puts the key and value on the wire`() {
        wire.initialize()
        wire.plugin.setCustomUserAttribute(
            wire.call(JSObject().put("key", "loyalty_tier").put("value", "gold")),
        )
        wire.flush()

        // Custom attributes nest under `attributes[].custom`, unlike the
        // standard ones (`email`, `push_token`, …) which sit directly on the
        // attributes object. A bridge that routed a custom attribute through
        // a standard setter would land in the wrong place and Braze would
        // silently ignore it.
        wire.awaitRequest("a custom attribute") { request ->
            request.attributes().any {
                it.optJSONObject("custom")?.optString("loyalty_tier") == "gold"
            }
        }
    }

    @Test
    fun `registerPushToken puts the token on the wire`() {
        wire.initialize()
        wire.plugin.registerPushToken(wire.call(JSObject().put("token", "wire-push-token-7")))
        wire.flush()

        wire.awaitRequest("a push token attribute") {
            it.attributes().any { attr -> attr.optString("push_token") == "wire-push-token-7" }
        }
    }

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    @Test
    fun `logCustomEvent puts the name and properties on the wire`() {
        wire.initialize()
        wire.plugin.logCustomEvent(
            wire.call(
                JSObject()
                    .put("name", "wire_event_A91D")
                    .put("properties", JSObject().put("tier", "gold").put("count", 3)),
            ),
        )
        wire.flush()

        val request = wire.awaitRequest("the custom event") {
            it.customEvent("wire_event_A91D") != null
        }

        // `data.n` is the name; `data.p` is the properties bag. A bridge that
        // dropped `properties` would still satisfy the name assertion, so
        // both are checked.
        val properties = request.customEvent("wire_event_A91D")!!.getJSONObject("data").getJSONObject("p")
        assertThat(properties.getString("tier")).isEqualTo("gold")
        assertThat(properties.getInt("count")).isEqualTo(3)
    }

    @Test
    fun `logPurchase puts product currency price and quantity on the wire`() {
        wire.initialize()
        wire.plugin.logPurchase(
            wire.call(
                JSObject()
                    .put("productId", "wire-sku-1")
                    .put("currency", "USD")
                    .put("price", 9.99)
                    .put("quantity", 2),
            ),
        )
        wire.flush()

        val request = wire.awaitRequest("the purchase event") {
            it.event("p")?.optJSONObject("data")?.optString("pid") == "wire-sku-1"
        }

        val data = request.event("p")!!.getJSONObject("data")
        assertThat(data.getString("c")).isEqualTo("USD")
        // C03: price crosses the bridge as a JS number and must reach Braze
        // as a decimal, not a truncated integer.
        assertThat(data.getDouble("p")).isWithin(1e-9).of(9.99)
        assertThat(data.getInt("q")).isEqualTo(2)
    }

    @Test
    fun `subscription group membership goes on the wire with the right status`() {
        wire.initialize()
        wire.plugin.addToSubscriptionGroup(wire.call(JSObject().put("groupId", "wire-group-in")))
        wire.plugin.removeFromSubscriptionGroup(wire.call(JSObject().put("groupId", "wire-group-out")))
        wire.flush()

        val subscribed = wire.awaitRequest("the add-to-group event") { request ->
            request.events().any {
                it.optString("name") == "sgu" &&
                    it.optJSONObject("data")?.optString("group_id") == "wire-group-in"
            }
        }
        assertThat(
            subscribed.events().first {
                it.optJSONObject("data")?.optString("group_id") == "wire-group-in"
            }.getJSONObject("data").getString("status"),
        ).isEqualTo("subscribed")

        val unsubscribed = wire.awaitRequest("the remove-from-group event") { request ->
            request.events().any {
                it.optString("name") == "sgu" &&
                    it.optJSONObject("data")?.optString("group_id") == "wire-group-out"
            }
        }
        assertThat(
            unsubscribed.events().first {
                it.optJSONObject("data")?.optString("group_id") == "wire-group-out"
            }.getJSONObject("data").getString("status"),
        ).isEqualTo("unsubscribed")
    }

    // -------------------------------------------------------------------------
    // Feature flags — refresh request, parsed response, listener, accessor
    // -------------------------------------------------------------------------

    @Test
    fun `refreshFeatureFlags fetches flags and delivers them to the listener`() {
        wire.initialize()
        val listener = wire.listen("featureFlagsUpdated")
        wire.responder = { request ->
            if (request.path?.contains("feature_flags/sync") == true) {
                BrazeWire.featureFlagsSync(
                    id = "wire_flag",
                    enabled = true,
                    properties = """{"tier":{"type":"string","value":"gold"}}""",
                )
            } else {
                BrazeWire.serverConfig()
            }
        }

        val syncRequest = wire.awaitRequestRetrying(
            label = "a /api/v3/feature_flags/sync POST",
            action = { wire.plugin.refreshFeatureFlags(wire.call()) },
            predicate = { it.path.contains("feature_flags/sync") },
        )
        assertThat(syncRequest.json.getString("api_key")).isEqualTo("integration-test-key")

        val payload = wire.awaitEvent(listener, "featureFlagsUpdated carrying wire_flag") {
            it.getJSONArray("flags").length() > 0
        }
        val flag = payload.getJSONArray("flags").getJSONObject(0)
        assertThat(flag.getString("id")).isEqualTo("wire_flag")
        assertThat(flag.getBoolean("enabled")).isTrue()
        // C02: feature-flag properties are a tagged union, and the value has
        // to survive the SDK's own parse as well as the bridge's serializer.
        assertThat(flag.getJSONObject("properties").getJSONObject("tier").getString("value"))
            .isEqualTo("gold")

        // The same flag must be readable back through the accessor, which is
        // what a consumer actually calls.
        val getCall = wire.call(JSObject().put("id", "wire_flag"))
        wire.plugin.getFeatureFlag(getCall)
        assertThat(TestSupport.resolutionOf(getCall).getJSObject("flag")!!.getString("id"))
            .isEqualTo("wire_flag")
    }

    // -------------------------------------------------------------------------
    // Content cards — refresh request, parsed response, listener, accessor
    // -------------------------------------------------------------------------

    @Test
    fun `requestContentCardsRefresh fetches cards and delivers them to the listener`() {
        wire.initialize()
        val listener = wire.listen("contentCardsUpdated")
        wire.responder = { request ->
            if (request.path?.contains("content_cards/sync") == true) {
                BrazeWire.contentCardsSync(
                    BrazeWire.shortNewsCard("wire-card-1", "Wire title", "Wire description"),
                )
            } else {
                BrazeWire.serverConfig()
            }
        }

        val syncRequest = wire.awaitRequestRetrying(
            label = "a /api/v3/content_cards/sync POST",
            action = { wire.plugin.requestContentCardsRefresh(wire.call()) },
            predicate = { it.path.contains("content_cards/sync") },
        )
        // The sync request is incremental: Braze needs both watermarks to
        // decide between a delta and a full sync.
        assertThat(syncRequest.json.has("last_full_sync_at")).isTrue()
        assertThat(syncRequest.json.has("last_card_updated_at")).isTrue()

        val payload = wire.awaitEvent(listener, "contentCardsUpdated carrying wire-card-1") {
            it.getJSONArray("cards").length() > 0
        }
        val card = payload.getJSONArray("cards").getJSONObject(0)
        assertThat(card.getString("id")).isEqualTo("wire-card-1")
        // `tp: short_news` is the SDK's ShortNewsCard, which C02 maps onto
        // the contract's `classic` discriminator.
        assertThat(card.getString("type")).isEqualTo("classic")
        assertThat(card.getString("title")).isEqualTo("Wire title")
        assertThat(card.getString("description")).isEqualTo("Wire description")
        // C03: the DTO's timestamps are epoch **milliseconds**, while the
        // Android SDK's `ca` is seconds.
        assertThat(card.getLong("updated")).isEqualTo(1_700_000_000_000L)

        val getCall = wire.call()
        wire.plugin.getContentCards(getCall)
        assertThat(TestSupport.resolutionOf(getCall).getJSONArray("cards").length()).isEqualTo(1)
    }

    // -------------------------------------------------------------------------
    // SDK Authentication
    // -------------------------------------------------------------------------

    @Test
    fun `sdk authentication attaches the signature header to every request`() {
        wire.initialize { put("enableSdkAuthentication", true) }
        wire.plugin.changeUser(
            wire.call(JSObject().put("userId", "wire-auth-user").put("sdkAuthSignature", "SIG-WIRE-1")),
        )
        wire.flush()

        val request = wire.awaitRequest("a request signed with SIG-WIRE-1") {
            it.headers[BrazeWire.AUTH_HEADER.lowercase()] == "SIG-WIRE-1"
        }

        // The signature travels as a header, not in the body — a detail no
        // DTO-level test can see.
        assertThat(request.raw).doesNotContain("SIG-WIRE-1")
        assertThat(
            request.attributes().any { it.optString("user_id") == "wire-auth-user" },
        ).isTrue()
    }

    @Test
    fun `an auth_error response is delivered to the sdkAuthError listener`() {
        wire.initialize { put("enableSdkAuthentication", true) }
        val listener = wire.listen("sdkAuthError")
        wire.plugin.changeUser(
            wire.call(JSObject().put("userId", "wire-auth-user").put("sdkAuthSignature", "SIG-BAD")),
        )
        wire.flush()
        wire.awaitRequest("the signed request") {
            it.headers[BrazeWire.AUTH_HEADER.lowercase()] == "SIG-BAD"
        }

        // Braze reports an authentication failure inside an otherwise
        // successful 200 response, so the SDK has to parse it out of the
        // envelope rather than off the status line.
        wire.responder = { BrazeWire.authError(userId = "wire-auth-user", signature = "SIG-BAD") }
        wire.plugin.logCustomEvent(wire.call(JSObject().put("name", "wire_auth_probe")))
        wire.flush()

        val payload = wire.awaitEvent(listener, "an sdkAuthError event") { true }
        assertThat(payload.getString("userId")).isEqualTo("wire-auth-user")
        assertThat(payload.getInt("errorCode")).isEqualTo(401)
        assertThat(payload.getString("errorReason")).isEqualTo("bad signature")
        assertThat(payload.getString("signature")).isEqualTo("SIG-BAD")
    }

    // -------------------------------------------------------------------------
    // Privacy / lifecycle — the only proof the off-switches reach the socket
    // -------------------------------------------------------------------------

    @Test
    fun `disableSDK stops traffic and enableSDK resumes it`() {
        wire.initialize()
        wire.plugin.logCustomEvent(wire.call(JSObject().put("name", "wire_before_disable")))
        wire.flush()
        wire.awaitRequest("the pre-disable event") {
            it.customEvent("wire_before_disable") != null
        }

        wire.plugin.disableSDK(wire.call())
        // `Braze.disableSdk` returns before the opt-out takes effect, so an
        // event logged immediately after can still be queued and flushed — the
        // quiet window below would then see real traffic and fail for the wrong
        // reason. Wait for the SDK's own state to flip first.
        IntegrationSupport.awaitSdkState("disabled") { Braze.isDisabled }
        wire.clearRequests()
        wire.plugin.logCustomEvent(wire.call(JSObject().put("name", "wire_while_disabled")))
        wire.flush()
        // Bracketed by positive controls on both sides: the same plugin and
        // the same server posted a moment ago and will post again below, so
        // silence here can only be the opt-out.
        wire.assertNoFurtherRequests("while the SDK is disabled")

        wire.plugin.enableSDK(wire.call())
        IntegrationSupport.awaitSdkState("enabled") { !Braze.isDisabled }
        wire.initialize()
        wire.plugin.logCustomEvent(wire.call(JSObject().put("name", "wire_after_enable")))
        wire.flush()
        val resumed = wire.awaitRequest("the post-enable event") {
            it.customEvent("wire_after_enable") != null
        }
        // The event logged while disabled must not be resurrected by the
        // re-enable — opting out discards, it does not buffer.
        assertThat(resumed.raw).doesNotContain("wire_while_disabled")
    }

    @Test
    fun `wipeData discards queued analytics and mints a new anonymous identity`() {
        wire.initialize()
        wire.plugin.logCustomEvent(wire.call(JSObject().put("name", "wire_before_wipe")))
        wire.flush()
        val before = wire.awaitRequest("the pre-wipe event") {
            it.customEvent("wire_before_wipe") != null
        }
        val deviceIdBefore = before.json.getString("device_id")

        // Queue an event that must never reach the wire, then wipe.
        wire.plugin.logCustomEvent(wire.call(JSObject().put("name", "wire_wiped_event")))
        wire.plugin.wipeData(wire.call())
        wire.clearRequests()

        // `wipeData` de-initializes the bridge, so a fresh `initialize` is
        // required — and it is the traffic that follows it that proves the
        // wipe reached the SDK's storage rather than only the plugin's flag.
        wire.initialize()
        wire.plugin.logCustomEvent(wire.call(JSObject().put("name", "wire_after_wipe")))
        wire.flush()
        val after = wire.awaitRequest("the post-wipe event") {
            it.customEvent("wire_after_wipe") != null
        }

        assertThat(after.json.getString("device_id")).isNotEqualTo(deviceIdBefore)
        assertThat(wire.requests.none { it.raw.contains("wire_wiped_event") }).isTrue()
    }
}
