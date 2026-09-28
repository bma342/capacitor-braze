package com.bma342.braze

import com.bma342.braze.TestSupport.VALID_ENDPOINT
import com.bma342.braze.TestSupport.fakePluginCall
import com.bma342.braze.TestSupport.initializedPlugin
import com.bma342.braze.TestSupport.rejectionOf
import com.bma342.braze.TestSupport.resolutionOf
import com.bma342.braze.TestSupport.uninitializedPlugin
import com.getcapacitor.JSObject
import com.google.common.truth.Truth.assertThat
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.kotlin.any
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * C04 validation coverage for the Kotlin bridge.
 *
 * Every assertion here is on a string that `src/web.ts` emits
 * byte-for-byte, because C04's whole point is that a consumer gets the
 * same error text on every platform. The one sanctioned divergence is
 * `requireUser`, which names Android's `currentUser` where web names
 * `getUser()`.
 *
 * Tests come in two shapes:
 *
 *  - **pre-init**: the method is driven on an uninitialized plugin and
 *    asserted to emit the init-guard string (C07).
 *  - **post-init**: the plugin has run the real `initialize` against the
 *    real Braze SDK under Robolectric ([initializedPlugin]), so per-field
 *    validation and the SDK-backed happy paths are actually reached.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class BrazePluginContractTest {

    private val initGuard = "Braze.initialize() must be called before any other Braze method."

    // -------------------------------------------------------------------------
    // echo — the one method with no init guard (besides the C07 quartet)
    // -------------------------------------------------------------------------

    @Test
    fun `echo rejects when value is missing`() {
        val call = fakePluginCall(JSObject())
        uninitializedPlugin().echo(call)
        assertThat(rejectionOf(call)).isEqualTo("Braze.echo: `value` is required (string).")
        verify(call, never()).resolve(any<JSObject>())
    }

    @Test
    fun `echo resolves when value is present`() {
        val call = fakePluginCall(JSObject().put("value", "hello"))
        uninitializedPlugin().echo(call)
        assertThat(resolutionOf(call).getString("value")).isEqualTo("hello")
        verify(call, never()).reject(any<String>())
    }

    // -------------------------------------------------------------------------
    // initialize
    // -------------------------------------------------------------------------

    @Test
    fun `initialize rejects empty apiKey with C01-format error`() {
        val call = fakePluginCall(JSObject().put("apiKey", "").put("endpoint", VALID_ENDPOINT))
        uninitializedPlugin().initialize(call)
        assertThat(rejectionOf(call)).isEqualTo("Braze.initialize: `apiKey` is required (string).")
    }

    @Test
    fun `initialize rejects missing endpoint with C01-format error`() {
        val call = fakePluginCall(JSObject().put("apiKey", "k"))
        uninitializedPlugin().initialize(call)
        assertThat(rejectionOf(call)).isEqualTo("Braze.initialize: `endpoint` is required (string).")
    }

    @Test
    fun `initialize rejects http endpoint with the full SECURITY-md pointer`() {
        val call = fakePluginCall(
            JSObject().put("apiKey", "k").put("endpoint", "http://insecure.example.com"),
        )
        uninitializedPlugin().initialize(call)
        // Byte-identical to src/web.ts, including the trailing reference.
        assertThat(rejectionOf(call)).isEqualTo(
            "Braze.initialize: `endpoint` must use HTTPS. Set `allowInsecureEndpoint: true` " +
                "only for local mock-server testing. See SECURITY.md §4.",
        )
    }

    @Test
    fun `initialize accepts http endpoint when allowInsecureEndpoint is true`() {
        val call = fakePluginCall(
            JSObject()
                .put("apiKey", "k")
                .put("endpoint", "http://localhost:8080")
                .put("allowInsecureEndpoint", true),
        )
        uninitializedPlugin().initialize(call)
        verify(call).resolve()
        verify(call, never()).reject(any<String>())
    }

    @Test
    fun `initialize rejects malformed endpoint with parseable-URL error`() {
        // A space is illegal in a URI authority per RFC 3986, so
        // java.net.URI throws before the endpoint reaches the SDK.
        val call = fakePluginCall(
            JSObject().put("apiKey", "k").put("endpoint", "https://invalid host.example.com"),
        )
        uninitializedPlugin().initialize(call)
        assertThat(rejectionOf(call)).isEqualTo(
            "Braze.initialize: `endpoint` is malformed (must be a parseable URL or bare hostname).",
        )
    }

    @Test
    fun `initialize rejects sessionTimeoutInSeconds of zero`() {
        val call = fakePluginCall(
            JSObject()
                .put("apiKey", "k")
                .put("endpoint", VALID_ENDPOINT)
                .put("sessionTimeoutInSeconds", 0),
        )
        uninitializedPlugin().initialize(call)
        assertThat(rejectionOf(call))
            .isEqualTo("Braze.initialize: `sessionTimeoutInSeconds` must be a positive integer.")
    }

    @Test
    fun `initialize rejects a fractional sessionTimeoutInSeconds instead of dropping it`() {
        // Capacitor's getInt returns null for a JSON Double, which used to
        // collapse "invalid" into "absent" and silently apply the default.
        val call = fakePluginCall(
            JSObject()
                .put("apiKey", "k")
                .put("endpoint", VALID_ENDPOINT)
                .put("sessionTimeoutInSeconds", 1800.5),
        )
        uninitializedPlugin().initialize(call)
        assertThat(rejectionOf(call))
            .isEqualTo("Braze.initialize: `sessionTimeoutInSeconds` must be a positive integer.")
    }

    @Test
    fun `initialize treats an absent sessionTimeoutInSeconds as the default`() {
        val call = fakePluginCall(JSObject().put("apiKey", "k").put("endpoint", VALID_ENDPOINT))
        uninitializedPlugin().initialize(call)
        verify(call).resolve()
        verify(call, never()).reject(any<String>())
    }

    // -------------------------------------------------------------------------
    // Init guard (C07): everything outside echo + the privacy quartet
    // -------------------------------------------------------------------------

    @Test
    fun `post-init methods reject before initialize with the init-guard string`() {
        val plugin = uninitializedPlugin()
        val invocations: List<Pair<String, (com.getcapacitor.PluginCall) -> Unit>> = listOf(
            "changeUser" to plugin::changeUser,
            "getUserId" to plugin::getUserId,
            "setSdkAuthenticationSignature" to plugin::setSdkAuthenticationSignature,
            "setEmail" to plugin::setEmail,
            "setPhoneNumber" to plugin::setPhoneNumber,
            "setFirstName" to plugin::setFirstName,
            "setLastName" to plugin::setLastName,
            "setLanguage" to plugin::setLanguage,
            "setCountry" to plugin::setCountry,
            "setHomeCity" to plugin::setHomeCity,
            "setCustomUserAttribute" to plugin::setCustomUserAttribute,
            "setDateOfBirth" to plugin::setDateOfBirth,
            "setGender" to plugin::setGender,
            "addAlias" to plugin::addAlias,
            "addToSubscriptionGroup" to plugin::addToSubscriptionGroup,
            "removeFromSubscriptionGroup" to plugin::removeFromSubscriptionGroup,
            "getDeviceId" to plugin::getDeviceId,
            "logCustomEvent" to plugin::logCustomEvent,
            "logPurchase" to plugin::logPurchase,
            "getFeatureFlag" to plugin::getFeatureFlag,
            "getAllFeatureFlags" to plugin::getAllFeatureFlags,
            "refreshFeatureFlags" to plugin::refreshFeatureFlags,
            "logFeatureFlagImpression" to plugin::logFeatureFlagImpression,
            "getContentCards" to plugin::getContentCards,
            "requestContentCardsRefresh" to plugin::requestContentCardsRefresh,
            "logContentCardClick" to plugin::logContentCardClick,
            "logContentCardImpression" to plugin::logContentCardImpression,
            "registerPushToken" to plugin::registerPushToken,
            "requestImmediateDataFlush" to plugin::requestImmediateDataFlush,
        )
        for ((name, invoke) in invocations) {
            val call = fakePluginCall(JSObject())
            invoke(call)
            assertThat(rejectionOf(call)).isEqualTo(initGuard)
            verify(call, never()).resolve(any<JSObject>())
            assertThat(name).isNotEmpty()
        }
    }

    // -------------------------------------------------------------------------
    // Identity
    // -------------------------------------------------------------------------

    @Test
    fun `changeUser rejects an empty userId`() {
        val call = fakePluginCall(JSObject().put("userId", ""))
        initializedPlugin().changeUser(call)
        assertThat(rejectionOf(call)).isEqualTo("Braze.changeUser: `userId` is required (string).")
    }

    @Test
    fun `changeUser demands a signature when SDK Authentication is enabled`() {
        val plugin = initializedPlugin { put("enableSdkAuthentication", true) }
        val call = fakePluginCall(JSObject().put("userId", "user-1"))
        plugin.changeUser(call)
        assertThat(rejectionOf(call)).isEqualTo(
            "Braze.changeUser: `sdkAuthSignature` is required (string) when SDK Authentication " +
                "is enabled. See SECURITY.md §2.",
        )
    }

    @Test
    fun `changeUser accepts a signature when SDK Authentication is enabled`() {
        val plugin = initializedPlugin { put("enableSdkAuthentication", true) }
        val call = fakePluginCall(
            JSObject().put("userId", "user-1").put("sdkAuthSignature", "sig"),
        )
        plugin.changeUser(call)
        verify(call).resolve()
    }

    @Test
    fun `changeUser does not demand a signature when SDK Authentication is off`() {
        val call = fakePluginCall(JSObject().put("userId", "user-1"))
        initializedPlugin().changeUser(call)
        verify(call).resolve()
    }

    @Test
    fun `getUserId reports an anonymous user as JSON null`() {
        // The Braze singleton is process-wide and Robolectric shares its
        // sandbox across tests, so the user is wiped first to make this
        // independent of whichever test ran before it. The SDK reports an
        // anonymous user as "", which the bridge normalises to JSON null.
        initializedPlugin().wipeData(fakePluginCall(JSObject()))
        val call = fakePluginCall(JSObject())
        initializedPlugin().getUserId(call)
        assertThat(resolutionOf(call).get("userId")).isEqualTo(JSObject.NULL)
    }

    @Test
    fun `getUserId returns the external id after changeUser`() {
        val plugin = initializedPlugin()
        plugin.changeUser(fakePluginCall(JSObject().put("userId", "user-42")))
        val call = fakePluginCall(JSObject())
        plugin.getUserId(call)
        assertThat(resolutionOf(call).getString("userId")).isEqualTo("user-42")
    }

    @Test
    fun `setSdkAuthenticationSignature rejects an empty signature`() {
        val call = fakePluginCall(JSObject().put("signature", ""))
        initializedPlugin().setSdkAuthenticationSignature(call)
        assertThat(rejectionOf(call))
            .isEqualTo("Braze.setSdkAuthenticationSignature: `signature` is required (string).")
    }

    @Test
    fun `getDeviceId resolves the SDK device identifier`() {
        val call = fakePluginCall(JSObject())
        initializedPlugin().getDeviceId(call)
        assertThat(resolutionOf(call).getString("deviceId")).isNotEmpty()
    }

    @Test
    fun `addAlias rejects a missing alias and a missing label`() {
        val plugin = initializedPlugin()
        val missingAlias = fakePluginCall(JSObject().put("label", "l"))
        plugin.addAlias(missingAlias)
        assertThat(rejectionOf(missingAlias))
            .isEqualTo("Braze.addAlias: `alias` is required (string).")
        val missingLabel = fakePluginCall(JSObject().put("alias", "a"))
        plugin.addAlias(missingLabel)
        assertThat(rejectionOf(missingLabel))
            .isEqualTo("Braze.addAlias: `label` is required (string).")
    }

    // -------------------------------------------------------------------------
    // Demographics — reachable now that the plugin is really initialized
    // -------------------------------------------------------------------------

    @Test
    fun `setDateOfBirth emits per-field year error`() {
        val call = fakePluginCall(JSObject().put("year", 1899).put("month", 6).put("day", 15))
        initializedPlugin().setDateOfBirth(call)
        assertThat(rejectionOf(call))
            .isEqualTo("Braze.setDateOfBirth: `year` must be an integer between 1900 and 2100.")
    }

    @Test
    fun `setDateOfBirth emits per-field month error`() {
        val call = fakePluginCall(JSObject().put("year", 1990).put("month", 13).put("day", 15))
        initializedPlugin().setDateOfBirth(call)
        assertThat(rejectionOf(call))
            .isEqualTo("Braze.setDateOfBirth: `month` must be an integer between 1 and 12.")
    }

    @Test
    fun `setDateOfBirth emits per-field day error`() {
        val call = fakePluginCall(JSObject().put("year", 1990).put("month", 6).put("day", 32))
        initializedPlugin().setDateOfBirth(call)
        assertThat(rejectionOf(call))
            .isEqualTo("Braze.setDateOfBirth: `day` must be an integer between 1 and 31.")
    }

    @Test
    fun `setDateOfBirth accepts a 1-indexed month`() {
        // C03: the contract's month is 1-12 (7 = July), mapped onto
        // com.braze.enums.Month via Month.entries[month - 1].
        val call = fakePluginCall(JSObject().put("year", 1990).put("month", 7).put("day", 4))
        initializedPlugin().setDateOfBirth(call)
        verify(call).resolve()
        verify(call, never()).reject(any<String>())
    }

    @Test
    fun `setGender rejects an unknown value and accepts every documented one`() {
        val plugin = initializedPlugin()
        val bad = fakePluginCall(JSObject().put("gender", "androgynous"))
        plugin.setGender(bad)
        assertThat(rejectionOf(bad)).isEqualTo(
            "Braze.setGender: unknown gender \"androgynous\". " +
                "Allowed: male, female, other, unknown, not_applicable, prefer_not_to_say.",
        )
        for (value in listOf("male", "female", "other", "unknown", "not_applicable", "prefer_not_to_say")) {
            val call = fakePluginCall(JSObject().put("gender", value))
            plugin.setGender(call)
            verify(call).resolve()
        }
    }

    @Test
    fun `setGender rejects a missing value`() {
        val call = fakePluginCall(JSObject())
        initializedPlugin().setGender(call)
        assertThat(rejectionOf(call)).isEqualTo("Braze.setGender: `gender` is required (string).")
    }

    // -------------------------------------------------------------------------
    // Custom attributes / subscription groups
    // -------------------------------------------------------------------------

    @Test
    fun `setCustomUserAttribute rejects a missing key`() {
        val call = fakePluginCall(JSObject().put("value", "v"))
        initializedPlugin().setCustomUserAttribute(call)
        assertThat(rejectionOf(call))
            .isEqualTo("Braze.setCustomUserAttribute: `key` is required (string).")
    }

    @Test
    fun `setCustomUserAttribute rejects non-scalar values`() {
        val plugin = initializedPlugin()
        val nested = fakePluginCall(
            JSObject().put("key", "k").put("value", JSONObject().put("nested", 1)),
        )
        plugin.setCustomUserAttribute(nested)
        assertThat(rejectionOf(nested))
            .isEqualTo("Braze.setCustomUserAttribute: `value` must be string, number, or boolean.")
    }

    @Test
    fun `setCustomUserAttribute accepts every scalar type`() {
        val plugin = initializedPlugin()
        val values = listOf<Any>("text", true, 42, 9_007_199_254_740_991L, 1.5)
        for (value in values) {
            val call = fakePluginCall(JSObject().put("key", "k").put("value", value))
            plugin.setCustomUserAttribute(call)
            verify(call).resolve()
        }
    }

    @Test
    fun `subscription group methods reject an empty groupId`() {
        val plugin = initializedPlugin()
        val add = fakePluginCall(JSObject().put("groupId", ""))
        plugin.addToSubscriptionGroup(add)
        assertThat(rejectionOf(add))
            .isEqualTo("Braze.addToSubscriptionGroup: `groupId` is required (string).")
        val remove = fakePluginCall(JSObject().put("groupId", ""))
        plugin.removeFromSubscriptionGroup(remove)
        assertThat(rejectionOf(remove))
            .isEqualTo("Braze.removeFromSubscriptionGroup: `groupId` is required (string).")
    }

    // -------------------------------------------------------------------------
    // Events and purchases
    // -------------------------------------------------------------------------

    @Test
    fun `logCustomEvent rejects a missing name`() {
        val call = fakePluginCall(JSObject())
        initializedPlugin().logCustomEvent(call)
        assertThat(rejectionOf(call)).isEqualTo("Braze.logCustomEvent: `name` is required (string).")
    }

    @Test
    fun `logCustomEvent rejects a non-scalar property value and names the key`() {
        val call = fakePluginCall(
            JSObject()
                .put("name", "checkout")
                .put("properties", JSONObject().put("cart", JSONObject().put("items", 2))),
        )
        initializedPlugin().logCustomEvent(call)
        assertThat(rejectionOf(call))
            .isEqualTo("Braze.logCustomEvent: `properties.cart` must be string, number, or boolean.")
    }

    @Test
    fun `logCustomEvent accepts scalar properties`() {
        val call = fakePluginCall(
            JSObject()
                .put("name", "checkout")
                .put(
                    "properties",
                    JSONObject().put("sku", "abc").put("qty", 2).put("express", true).put("price", 1.5),
                ),
        )
        initializedPlugin().logCustomEvent(call)
        verify(call).resolve()
    }

    @Test
    fun `logPurchase rejects missing productId and currency`() {
        val plugin = initializedPlugin()
        val noProduct = fakePluginCall(JSObject().put("currency", "USD").put("price", 1.0))
        plugin.logPurchase(noProduct)
        assertThat(rejectionOf(noProduct))
            .isEqualTo("Braze.logPurchase: `productId` is required (string).")
        val noCurrency = fakePluginCall(JSObject().put("productId", "sku").put("price", 1.0))
        plugin.logPurchase(noCurrency)
        assertThat(rejectionOf(noCurrency))
            .isEqualTo("Braze.logPurchase: `currency` is required (ISO 4217 string).")
    }

    @Test
    fun `logPurchase rejects a negative price`() {
        val call = fakePluginCall(
            JSObject().put("productId", "sku").put("currency", "USD").put("price", -1.0),
        )
        initializedPlugin().logPurchase(call)
        assertThat(rejectionOf(call))
            .isEqualTo("Braze.logPurchase: `price` must be a non-negative finite number.")
    }

    @Test
    fun `logPurchase rejects a fractional quantity instead of coercing it to 1`() {
        val call = fakePluginCall(
            JSObject()
                .put("productId", "sku")
                .put("currency", "USD")
                .put("price", 14.99)
                .put("quantity", 2.5),
        )
        initializedPlugin().logPurchase(call)
        assertThat(rejectionOf(call))
            .isEqualTo("Braze.logPurchase: `quantity` must be an integer between 1 and 100.")
    }

    @Test
    fun `logPurchase rejects an out-of-range quantity`() {
        val plugin = initializedPlugin()
        for (quantity in listOf(0, 101)) {
            val call = fakePluginCall(
                JSObject()
                    .put("productId", "sku")
                    .put("currency", "USD")
                    .put("price", 1.0)
                    .put("quantity", quantity),
            )
            plugin.logPurchase(call)
            assertThat(rejectionOf(call))
                .isEqualTo("Braze.logPurchase: `quantity` must be an integer between 1 and 100.")
        }
    }

    @Test
    fun `logPurchase defaults quantity to 1 when absent`() {
        val call = fakePluginCall(
            JSObject().put("productId", "sku").put("currency", "USD").put("price", 14.99),
        )
        initializedPlugin().logPurchase(call)
        verify(call).resolve()
        verify(call, never()).reject(any<String>())
    }

    @Test
    fun `logPurchase rejects a non-scalar property value and names the key`() {
        val call = fakePluginCall(
            JSObject()
                .put("productId", "sku")
                .put("currency", "USD")
                .put("price", 1.0)
                .put("properties", JSONObject().put("tags", org.json.JSONArray().put("a"))),
        )
        initializedPlugin().logPurchase(call)
        assertThat(rejectionOf(call))
            .isEqualTo("Braze.logPurchase: `properties.tags` must be string, number, or boolean.")
    }

    // -------------------------------------------------------------------------
    // Feature flags / content cards / push
    // -------------------------------------------------------------------------

    @Test
    fun `getFeatureFlag rejects a missing id and resolves null for an unknown flag`() {
        val plugin = initializedPlugin()
        val missing = fakePluginCall(JSObject())
        plugin.getFeatureFlag(missing)
        assertThat(rejectionOf(missing))
            .isEqualTo("Braze.getFeatureFlag: `id` is required (string).")
        val unknown = fakePluginCall(JSObject().put("id", "no-such-flag"))
        plugin.getFeatureFlag(unknown)
        assertThat(resolutionOf(unknown).get("flag")).isEqualTo(JSObject.NULL)
    }

    @Test
    fun `logFeatureFlagImpression rejects a missing id`() {
        val call = fakePluginCall(JSObject())
        initializedPlugin().logFeatureFlagImpression(call)
        assertThat(rejectionOf(call))
            .isEqualTo("Braze.logFeatureFlagImpression: `id` is required (string).")
    }

    @Test
    fun `content card logging rejects a missing cardId`() {
        val plugin = initializedPlugin()
        val click = fakePluginCall(JSObject())
        plugin.logContentCardClick(click)
        assertThat(rejectionOf(click))
            .isEqualTo("Braze.logContentCardClick: `cardId` is required (string).")
        val impression = fakePluginCall(JSObject())
        plugin.logContentCardImpression(impression)
        assertThat(rejectionOf(impression))
            .isEqualTo("Braze.logContentCardImpression: `cardId` is required (string).")
    }

    @Test
    fun `content card logging rejects an id that is not in the cache`() {
        val call = fakePluginCall(JSObject().put("cardId", "ghost"))
        initializedPlugin().logContentCardClick(call)
        assertThat(rejectionOf(call)).isEqualTo(
            "Braze.logContentCardClick: no cached content card with id \"ghost\". " +
                "Call getContentCards() to verify the id, or wait for the next refresh.",
        )
    }

    @Test
    fun `registerPushToken rejects an empty token`() {
        val call = fakePluginCall(JSObject().put("token", ""))
        initializedPlugin().registerPushToken(call)
        assertThat(rejectionOf(call))
            .isEqualTo("Braze.registerPushToken: `token` is required (string).")
    }

    // -------------------------------------------------------------------------
    // C07 quartet — no init guard
    // -------------------------------------------------------------------------

    @Test
    fun `the privacy quartet works before initialize`() {
        val plugin = uninitializedPlugin()
        val disabled = fakePluginCall(JSObject())
        plugin.isDisabled(disabled)
        assertThat(resolutionOf(disabled).getBool("disabled")).isFalse()

        val disable = fakePluginCall(JSObject())
        plugin.disableSDK(disable)
        verify(disable).resolve()

        val queryAfterDisable = fakePluginCall(JSObject())
        plugin.isDisabled(queryAfterDisable)
        assertThat(resolutionOf(queryAfterDisable).getBool("disabled")).isTrue()

        val enable = fakePluginCall(JSObject())
        plugin.enableSDK(enable)
        verify(enable).resolve()

        val wipe = fakePluginCall(JSObject())
        plugin.wipeData(wipe)
        verify(wipe).resolve()
    }
}
