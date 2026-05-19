package com.bma342.braze

import android.util.Log
import com.braze.Braze
import com.braze.configuration.BrazeConfig
import com.braze.models.outgoing.BrazeProperties
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capacitor bridge for the Braze Android SDK (com.braze:android-sdk-ui 42.2.0).
 *
 * ## Surface in 0.0.5
 *
 * - **Bridge sanity:** `echo(value)`
 * - **Configuration:** `initialize(apiKey, endpoint, ...)`
 * - **User identity:** `changeUser(userId, sdkAuthSignature?)`
 * - **User attributes (standard):** `setEmail`, `setPhoneNumber`,
 *   `setFirstName`, `setLastName`, `setLanguage`, `setCountry`
 * - **User attributes (custom):** `setCustomUserAttribute(key, value)` —
 *   dispatches on inferred value type
 * - **Custom events:** `logCustomEvent(name, properties?)`
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
