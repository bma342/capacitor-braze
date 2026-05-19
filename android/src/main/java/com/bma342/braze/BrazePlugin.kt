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
 * Surface in 0.0.3:
 * - `echo(value)` — bridge sanity check
 * - `initialize(...)` — builds `BrazeConfig`, calls `Braze.configure(context, config)`
 * - `changeUser(userId, sdkAuthSignature?)` — identifies the current user
 * - `logCustomEvent(name, properties?)` — logs a custom event
 *
 * See PLAN.md, SDK_SURFACE.md, and SECURITY.md for design context.
 */
@CapacitorPlugin(name = "Braze")
class BrazePlugin : Plugin() {

    private var initialized: Boolean = false

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

    // MARK: - Helpers

    private fun requireInitialized(call: PluginCall): Boolean {
        if (!initialized) {
            call.reject("Braze.initialize() must be called before any other Braze method.")
            return false
        }
        return true
    }

    /**
     * Converts a Capacitor JSObject into Braze's properties wrapper. v0.0.3
     * supports string / number / boolean values per the TS interface
     * (`BrazeEventPropertyValue`). Date and array support land in a later
     * version per SDK_SURFACE.md §2.
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
                // Other types silently dropped — TS interface narrows to
                // primitives, so this only triggers if a consumer bypasses the
                // type system.
            }
        }
        return props
    }
}
