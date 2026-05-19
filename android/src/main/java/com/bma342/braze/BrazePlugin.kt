package com.bma342.braze

import android.util.Log
import com.braze.Braze
import com.braze.configuration.BrazeConfig
import com.braze.enums.Gender
import com.braze.enums.Month
import com.braze.events.FeatureFlagsUpdatedEvent
import com.braze.events.IEventSubscriber
import com.braze.models.FeatureFlag
import com.braze.models.outgoing.BrazeProperties
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.math.BigDecimal

/**
 * Capacitor bridge for the Braze Android SDK (com.braze:android-sdk-ui 42.2.0).
 *
 * ## Surface in 0.0.9
 *
 * - **Bridge sanity:** `echo(value)`
 * - **Configuration:** `initialize(apiKey, endpoint, ...)`
 * - **User identity:** `changeUser(userId, sdkAuthSignature?)`, `getUserId`,
 *   `addAlias(alias, label)`
 * - **Device ID:** `getDeviceId`
 * - **User attributes (standard):** `setEmail`, `setPhoneNumber`,
 *   `setFirstName`, `setLastName`, `setLanguage`, `setCountry`
 * - **User attributes (demographics):** `setDateOfBirth(year, month, day)`,
 *   `setGender(gender)`, `setHomeCity(homeCity?)`
 * - **User attributes (custom):** `setCustomUserAttribute(key, value)` —
 *   dispatches on inferred value type
 * - **Subscription groups:** `addToSubscriptionGroup(groupId)`,
 *   `removeFromSubscriptionGroup(groupId)`
 * - **Events:** `logCustomEvent(name, properties?)`,
 *   `logPurchase(productId, currency, price, quantity?, properties?)`
 * - **Feature flags:** `getFeatureFlag(id)`, `getAllFeatureFlags`,
 *   `refreshFeatureFlags`, `logFeatureFlagImpression(id)`
 * - **Listeners:** `addListener('featureFlagsUpdated', ...)`
 * - **Privacy/lifecycle:** `wipeData`, `disableSDK`, `enableSDK`, `isDisabled`,
 *   `requestImmediateDataFlush`
 *
 * ## Design notes
 *
 * Unlike the iOS SDK (which exposes an instance-based `Braze` class), the
 * Android SDK uses a global singleton retrieved via `Braze.getInstance(context)`.
 * No instance retention is needed on the plugin side; the SDK manages its own
 * lifecycle.
 *
 * Privacy methods (`wipeData`, `disableSdk`, `enableSdk`, isDisabled query) are
 * **init-independent** — they are static methods on the `Braze` class that
 * operate on global SDK state, not the configured instance. They work even
 * before `initialize` has been called, which matches the semantics of GDPR/CCPA
 * consent flows.
 *
 * User attribute setters operate on `Braze.getInstance(context).currentUser`,
 * which is non-null post-init (the SDK creates an anonymous user profile by
 * default until `changeUser` is called).
 *
 * PII handling per SECURITY.md §3: this bridge never logs attribute values.
 *
 * See PLAN.md, SDK_SURFACE.md, and SECURITY.md for design context.
 */
@CapacitorPlugin(name = "Braze")
class BrazePlugin : Plugin() {

    /** `true` once `initialize` has been called successfully. */
    private var initialized: Boolean = false

    /**
     * Retained reference to the feature-flag update subscriber created at
     * `initialize` time. Held so we can unsubscribe in `wipeData`; the
     * Android SDK identifies subscriptions by listener identity, not by
     * a returned handle, so the same instance must be passed to
     * `removeSingleSubscription`.
     */
    private var featureFlagsSubscriber: IEventSubscriber<FeatureFlagsUpdatedEvent>? = null

    // -------------------------------------------------------------------------
    // Bridge sanity check
    // -------------------------------------------------------------------------

    @PluginMethod
    fun echo(call: PluginCall) {
        val value = call.getString("value")
        if (value == null) {
            call.reject("Braze.echo: `value` is required (string).")
            return
        }
        val result = JSObject()
        result.put("value", value)
        call.resolve(result)
    }

    // -------------------------------------------------------------------------
    // Configuration
    // -------------------------------------------------------------------------

    @PluginMethod
    fun initialize(call: PluginCall) {
        val apiKey = call.getString("apiKey")
        if (apiKey.isNullOrEmpty()) {
            call.reject("Braze.initialize: `apiKey` is required (string).")
            return
        }
        val endpoint = call.getString("endpoint")
        if (endpoint.isNullOrEmpty()) {
            call.reject("Braze.initialize: `endpoint` is required (string).")
            return
        }

        val allowInsecure = call.getBoolean("allowInsecureEndpoint", false) ?: false
        if (endpoint.startsWith("http://") && !allowInsecure) {
            call.reject(
                "Braze.initialize: `endpoint` must use HTTPS. " +
                    "Set `allowInsecureEndpoint: true` only for local mock-server testing.",
            )
            return
        }

        val enableLogging = call.getBoolean("enableLogging", false) ?: false
        val enableSdkAuthentication = call.getBoolean("enableSdkAuthentication", false) ?: false

        val builder = BrazeConfig.Builder()
            .setApiKey(apiKey)
            .setCustomEndpoint(endpoint)
            .setIsSdkAuthenticationEnabled(enableSdkAuthentication)

        if (enableLogging) {
            builder.setLoggerLevel(Log.VERBOSE)
        }

        Braze.configure(context, builder.build())
        initialized = true

        // Wire the persistent feature-flag update subscription. Drop any
        // previous subscriber first so re-init doesn't double-fire events
        // through stacked subscriptions.
        teardownFeatureFlagsSubscription()
        val subscriber = IEventSubscriber<FeatureFlagsUpdatedEvent> { event ->
            val flags = JSArray()
            for (flag in event.featureFlags) {
                flags.put(serializeFeatureFlag(flag))
            }
            val payload = JSObject()
            payload.put("flags", flags)
            notifyListeners("featureFlagsUpdated", payload)
        }
        Braze.getInstance(context).subscribeToFeatureFlagsUpdates(subscriber)
        featureFlagsSubscriber = subscriber

        call.resolve()
    }

    // -------------------------------------------------------------------------
    // User identity
    // -------------------------------------------------------------------------

    @PluginMethod
    fun changeUser(call: PluginCall) {
        if (!requireInitialized(call)) return
        val userId = call.getString("userId")
        if (userId.isNullOrEmpty()) {
            call.reject("Braze.changeUser: `userId` is required (string).")
            return
        }
        val sdkAuthSignature = call.getString("sdkAuthSignature")
        if (sdkAuthSignature != null) {
            Braze.getInstance(context).changeUser(userId, sdkAuthSignature)
        } else {
            Braze.getInstance(context).changeUser(userId)
        }
        call.resolve()
    }

    /**
     * Returns the current external user ID, or null when the user is still
     * anonymous. The Braze Android SDK reports anonymous users as an empty
     * string (`""`) on `currentUser.userId`; we translate that to JSON
     * `null` so the public contract is a clean nullable string across all
     * three platforms.
     */
    @PluginMethod
    fun getUserId(call: PluginCall) {
        val user = requireUser(call) ?: return
        val raw = user.userId
        val result = JSObject()
        if (raw.isNullOrEmpty()) {
            result.put("userId", JSObject.NULL)
        } else {
            result.put("userId", raw)
        }
        call.resolve(result)
    }

    // -------------------------------------------------------------------------
    // User attributes (standard)
    //
    // Each setter retrieves the optional string from the call (null clears the
    // attribute, matching native SDK semantics). currentUser is non-null
    // post-init; we still null-check defensively.
    // -------------------------------------------------------------------------

    @PluginMethod
    fun setEmail(call: PluginCall) {
        val user = requireUser(call) ?: return
        user.setEmail(call.getString("email"))
        call.resolve()
    }

    @PluginMethod
    fun setPhoneNumber(call: PluginCall) {
        val user = requireUser(call) ?: return
        user.setPhoneNumber(call.getString("phoneNumber"))
        call.resolve()
    }

    @PluginMethod
    fun setFirstName(call: PluginCall) {
        val user = requireUser(call) ?: return
        user.setFirstName(call.getString("firstName"))
        call.resolve()
    }

    @PluginMethod
    fun setLastName(call: PluginCall) {
        val user = requireUser(call) ?: return
        user.setLastName(call.getString("lastName"))
        call.resolve()
    }

    @PluginMethod
    fun setLanguage(call: PluginCall) {
        val user = requireUser(call) ?: return
        user.setLanguage(call.getString("language"))
        call.resolve()
    }

    @PluginMethod
    fun setCountry(call: PluginCall) {
        val user = requireUser(call) ?: return
        user.setCountry(call.getString("country"))
        call.resolve()
    }

    // -------------------------------------------------------------------------
    // User attributes (custom)
    // -------------------------------------------------------------------------

    /**
     * Dispatches `setCustomUserAttribute(key, value)` to the appropriate
     * Braze SDK overload based on the inferred type of `value`. The TS
     * interface narrows to string/number/boolean — other types are rejected.
     */
    @PluginMethod
    fun setCustomUserAttribute(call: PluginCall) {
        val user = requireUser(call) ?: return
        val key = call.getString("key")
        if (key.isNullOrEmpty()) {
            call.reject("Braze.setCustomUserAttribute: `key` is required (string).")
            return
        }
        // call.data is the raw JSONObject passed from JS — gives us access to
        // the original value type without Capacitor's coercion.
        when (val value = call.data.opt("value")) {
            is String -> user.setCustomUserAttribute(key, value)
            is Boolean -> user.setCustomUserAttribute(key, value)
            is Int -> user.setCustomUserAttribute(key, value)
            is Long -> user.setCustomUserAttribute(key, value.toInt())
            is Double -> user.setCustomUserAttribute(key, value)
            is Float -> user.setCustomUserAttribute(key, value.toDouble())
            else -> {
                call.reject(
                    "Braze.setCustomUserAttribute: `value` must be string, number, " +
                        "or boolean. Got: ${value?.javaClass?.simpleName ?: "null"}",
                )
                return
            }
        }
        call.resolve()
    }

    // -------------------------------------------------------------------------
    // Subscription groups
    // -------------------------------------------------------------------------

    @PluginMethod
    fun addToSubscriptionGroup(call: PluginCall) {
        val user = requireUser(call) ?: return
        val groupId = call.getString("groupId")
        if (groupId.isNullOrEmpty()) {
            call.reject("Braze.addToSubscriptionGroup: `groupId` is required (string).")
            return
        }
        user.addToSubscriptionGroup(groupId)
        call.resolve()
    }

    @PluginMethod
    fun removeFromSubscriptionGroup(call: PluginCall) {
        val user = requireUser(call) ?: return
        val groupId = call.getString("groupId")
        if (groupId.isNullOrEmpty()) {
            call.reject("Braze.removeFromSubscriptionGroup: `groupId` is required (string).")
            return
        }
        user.removeFromSubscriptionGroup(groupId)
        call.resolve()
    }

    // -------------------------------------------------------------------------
    // Aliases
    // -------------------------------------------------------------------------

    @PluginMethod
    fun addAlias(call: PluginCall) {
        val user = requireUser(call) ?: return
        val alias = call.getString("alias")
        if (alias.isNullOrEmpty()) {
            call.reject("Braze.addAlias: `alias` is required (string).")
            return
        }
        val label = call.getString("label")
        if (label.isNullOrEmpty()) {
            call.reject("Braze.addAlias: `label` is required (string).")
            return
        }
        user.addAlias(alias, label)
        call.resolve()
    }

    // -------------------------------------------------------------------------
    // Device ID
    // -------------------------------------------------------------------------

    /**
     * Returns the Braze SDK device identifier. The Android SDK exposes this
     * as a property on the singleton (not on `currentUser`), and it is
     * generated on first SDK use.
     */
    @PluginMethod
    fun getDeviceId(call: PluginCall) {
        if (!requireInitialized(call)) return
        val deviceId = Braze.getInstance(context).deviceId
        if (deviceId.isNullOrEmpty()) {
            call.reject("Braze.getDeviceId: SDK has not generated a device ID yet.")
            return
        }
        val result = JSObject()
        result.put("deviceId", deviceId)
        call.resolve(result)
    }

    // -------------------------------------------------------------------------
    // Demographics
    // -------------------------------------------------------------------------

    /**
     * Sets the user's date of birth. Public TS contract uses `month` as 1-12
     * to match the Web SDK; we map to the `com.braze.enums.Month` ordinal
     * here so consumers never see the Java `Calendar.MONTH` 0-indexed quirk.
     */
    @PluginMethod
    fun setDateOfBirth(call: PluginCall) {
        val user = requireUser(call) ?: return
        val year = call.getInt("year")
        val month = call.getInt("month")
        val day = call.getInt("day")
        if (year == null || month == null || day == null) {
            call.reject("Braze.setDateOfBirth: `year`, `month`, and `day` are required (integers).")
            return
        }
        if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
            call.reject(
                "Braze.setDateOfBirth: out of range. " +
                    "Expected year 1900-2100, month 1-12, day 1-31.",
            )
            return
        }
        // Month enum is ordered JANUARY..DECEMBER; values()[month-1] maps
        // the 1-indexed TS month to the matching enum case.
        val monthEnum = Month.values()[month - 1]
        user.setDateOfBirth(year, monthEnum, day)
        call.resolve()
    }

    /**
     * Maps the plugin's stable string gender values to `com.braze.enums.Gender`
     * enum cases. Keeping the mapping at the bridge layer means consumers
     * never see the SDK's enum names directly.
     */
    @PluginMethod
    fun setGender(call: PluginCall) {
        val user = requireUser(call) ?: return
        val raw = call.getString("gender")
        if (raw.isNullOrEmpty()) {
            call.reject("Braze.setGender: `gender` is required (string).")
            return
        }
        val gender = when (raw) {
            "male" -> Gender.MALE
            "female" -> Gender.FEMALE
            "other" -> Gender.OTHER
            "unknown" -> Gender.UNKNOWN
            "not_applicable" -> Gender.NOT_APPLICABLE
            "prefer_not_to_say" -> Gender.PREFER_NOT_TO_SAY
            else -> {
                call.reject(
                    "Braze.setGender: unknown gender \"$raw\". " +
                        "Allowed: male, female, other, unknown, not_applicable, prefer_not_to_say.",
                )
                return
            }
        }
        user.setGender(gender)
        call.resolve()
    }

    @PluginMethod
    fun setHomeCity(call: PluginCall) {
        val user = requireUser(call) ?: return
        user.setHomeCity(call.getString("homeCity"))
        call.resolve()
    }

    // -------------------------------------------------------------------------
    // Custom events
    // -------------------------------------------------------------------------

    @PluginMethod
    fun logCustomEvent(call: PluginCall) {
        if (!requireInitialized(call)) return
        val name = call.getString("name")
        if (name.isNullOrEmpty()) {
            call.reject("Braze.logCustomEvent: `name` is required (string).")
            return
        }
        val brazeProperties = jsObjectToBrazeProperties(call.getObject("properties"))
        if (brazeProperties != null) {
            Braze.getInstance(context).logCustomEvent(name, brazeProperties)
        } else {
            Braze.getInstance(context).logCustomEvent(name)
        }
        call.resolve()
    }

    // -------------------------------------------------------------------------
    // Purchases
    // -------------------------------------------------------------------------

    /**
     * Validates the purchase shape, then forwards to
     * `Braze.logPurchase(productId, currencyCode, price, quantity, properties)`.
     *
     * `price` is wrapped in `BigDecimal.valueOf(double)` — the
     * `valueOf(double)` factory routes through `Double.toString` so the
     * resulting BigDecimal exactly represents the human-readable value
     * (e.g. `BigDecimal.valueOf(14.99)` yields "14.99", not
     * "14.99000000000000056843...").
     */
    @PluginMethod
    fun logPurchase(call: PluginCall) {
        if (!requireInitialized(call)) return
        val productId = call.getString("productId")
        if (productId.isNullOrEmpty()) {
            call.reject("Braze.logPurchase: `productId` is required (string).")
            return
        }
        val currency = call.getString("currency")
        if (currency.isNullOrEmpty()) {
            call.reject("Braze.logPurchase: `currency` is required (ISO 4217 string).")
            return
        }
        val price = call.getDouble("price")
        if (price == null || !price.isFinite() || price < 0.0) {
            call.reject("Braze.logPurchase: `price` must be a non-negative finite number.")
            return
        }
        val quantity = call.getInt("quantity") ?: 1
        if (quantity < 1 || quantity > 100) {
            call.reject("Braze.logPurchase: `quantity` must be an integer between 1 and 100.")
            return
        }
        val brazeProperties = jsObjectToBrazeProperties(call.getObject("properties"))
        val bigPrice = BigDecimal.valueOf(price)
        if (brazeProperties != null) {
            Braze.getInstance(context).logPurchase(productId, currency, bigPrice, quantity, brazeProperties)
        } else {
            Braze.getInstance(context).logPurchase(productId, currency, bigPrice, quantity)
        }
        call.resolve()
    }

    // -------------------------------------------------------------------------
    // Feature flags
    //
    // The Android SDK exposes feature flags via static methods on the
    // `Braze` singleton:
    //   - Braze.getInstance(context).getFeatureFlag(id) -> FeatureFlag?
    //   - Braze.getInstance(context).getAllFeatureFlags() -> List<FeatureFlag>
    //   - Braze.getInstance(context).refreshFeatureFlags()
    //   - Braze.getInstance(context).logFeatureFlagImpression(id)
    //
    // `FeatureFlag.properties` is a `JSONObject` already in the Braze wire
    // format `{ key: { type, value } }`, which matches the plugin's portable
    // `BrazeFeatureFlagPropertyValue` shape — we round-trip through
    // `JSObject(jsonObject.toString())` rather than walking entries
    // manually to keep the conversion correct as new wire-format types ship.
    // -------------------------------------------------------------------------

    @PluginMethod
    fun getFeatureFlag(call: PluginCall) {
        if (!requireInitialized(call)) return
        val id = call.getString("id")
        if (id.isNullOrEmpty()) {
            call.reject("Braze.getFeatureFlag: `id` is required (string).")
            return
        }
        val raw = Braze.getInstance(context).getFeatureFlag(id)
        val result = JSObject()
        if (raw == null) {
            result.put("flag", JSObject.NULL)
        } else {
            result.put("flag", serializeFeatureFlag(raw))
        }
        call.resolve(result)
    }

    @PluginMethod
    fun getAllFeatureFlags(call: PluginCall) {
        if (!requireInitialized(call)) return
        val flags = JSArray()
        for (flag in Braze.getInstance(context).getAllFeatureFlags()) {
            flags.put(serializeFeatureFlag(flag))
        }
        val result = JSObject()
        result.put("flags", flags)
        call.resolve(result)
    }

    @PluginMethod
    fun refreshFeatureFlags(call: PluginCall) {
        if (!requireInitialized(call)) return
        Braze.getInstance(context).refreshFeatureFlags()
        call.resolve()
    }

    @PluginMethod
    fun logFeatureFlagImpression(call: PluginCall) {
        if (!requireInitialized(call)) return
        val id = call.getString("id")
        if (id.isNullOrEmpty()) {
            call.reject("Braze.logFeatureFlagImpression: `id` is required (string).")
            return
        }
        Braze.getInstance(context).logFeatureFlagImpression(id)
        call.resolve()
    }

    /**
     * Serializes a [FeatureFlag] to the plugin's portable wire format.
     *
     * `properties` is the underlying `JSONObject` round-tripped through a
     * string into a `JSObject`. Braze stores properties in the same
     * `{ key: { type, value } }` shape exposed on the wire, so the
     * roundtrip preserves correctness without manual case-by-case
     * conversion.
     */
    private fun serializeFeatureFlag(flag: FeatureFlag): JSObject {
        val out = JSObject()
        out.put("id", flag.id)
        out.put("enabled", flag.enabled)
        out.put("properties", JSObject(flag.properties.toString()))
        return out
    }

    // -------------------------------------------------------------------------
    // Privacy / lifecycle
    //
    // All four invoke class-level static methods on `Braze` and operate on
    // global SDK state regardless of `initialized` flag. They are safe to call
    // before `initialize` and during consent-revocation flows.
    // -------------------------------------------------------------------------

    @PluginMethod
    fun wipeData(call: PluginCall) {
        Braze.wipeData(context)
        // wipeData invalidates the configured singleton; require explicit
        // re-initialization before any subsequent post-init method is called.
        // Drop the feature-flag subscription too so re-init creates a fresh
        // one rather than leaving a zombie subscriber against the wiped SDK.
        teardownFeatureFlagsSubscription()
        initialized = false
        call.resolve()
    }

    @PluginMethod
    fun disableSDK(call: PluginCall) {
        Braze.disableSdk(context)
        call.resolve()
    }

    @PluginMethod
    fun enableSDK(call: PluginCall) {
        Braze.enableSdk(context)
        call.resolve()
    }

    @PluginMethod
    fun isDisabled(call: PluginCall) {
        val result = JSObject()
        result.put("disabled", Braze.isDisabled)
        call.resolve(result)
    }

    @PluginMethod
    fun requestImmediateDataFlush(call: PluginCall) {
        if (!requireInitialized(call)) return
        Braze.getInstance(context).requestImmediateDataFlush()
        call.resolve()
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Asserts that `initialize()` has been called. If not, rejects the call
     * with a clear error and returns `false`.
     *
     * Use in any bridge method that mutates state or queues events.
     * Init-independent privacy/lifecycle statics bypass this helper.
     */
    private fun requireInitialized(call: PluginCall): Boolean {
        if (!initialized) {
            call.reject("Braze.initialize() must be called before any other Braze method.")
            return false
        }
        return true
    }

    /**
     * Returns the Braze SDK's current user object, or rejects the call.
     *
     * The user object is non-null post-init (Braze creates an anonymous profile
     * by default), but we null-check defensively to avoid NPEs in edge cases.
     */
    private fun requireUser(call: PluginCall): com.braze.BrazeUser? {
        if (!requireInitialized(call)) return null
        val user = Braze.getInstance(context).currentUser
        if (user == null) {
            call.reject(
                "Braze: `currentUser` returned null. This should not happen post-init; " +
                    "file an issue at https://github.com/bma342/capacitor-braze/issues.",
            )
            return null
        }
        return user
    }

    /**
     * Unsubscribes the persistent feature-flag listener if present.
     * No-op when nothing is subscribed. The Android SDK identifies a
     * subscription by listener identity, so removal uses the same
     * `IEventSubscriber` instance that was passed to subscribe.
     */
    private fun teardownFeatureFlagsSubscription() {
        featureFlagsSubscriber?.let { subscriber ->
            Braze.getInstance(context).removeSingleSubscription(
                subscriber,
                FeatureFlagsUpdatedEvent::class.java,
            )
        }
        featureFlagsSubscriber = null
    }

    /**
     * Converts a Capacitor `JSObject` into Braze's properties wrapper.
     *
     * v0.0.5 supports `string` / `number` / `boolean` values per the TS
     * interface (`BrazeEventPropertyValue`). Date and array support land in a
     * later version per SDK_SURFACE.md §2.
     *
     * Values that don't match the supported types are silently dropped. This
     * only triggers if a consumer bypasses the TS type system (e.g. passes
     * `properties` from `any`-typed code).
     *
     * @return `BrazeProperties` populated from the JSObject, or `null` if the
     *         input was null/empty (so the caller can pick the appropriate
     *         `logCustomEvent` overload).
     */
    private fun jsObjectToBrazeProperties(jsObject: JSObject?): BrazeProperties? {
        if (jsObject == null || jsObject.length() == 0) {
            return null
        }
        val props = BrazeProperties()
        val keys = jsObject.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            when (val value = jsObject.get(key)) {
                is String -> props.addProperty(key, value)
                is Int -> props.addProperty(key, value)
                is Long -> props.addProperty(key, value)
                is Double -> props.addProperty(key, value)
                is Float -> props.addProperty(key, value.toDouble())
                is Boolean -> props.addProperty(key, value)
            }
        }
        return props
    }
}
