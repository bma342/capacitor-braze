package com.bma342.braze

import android.util.Log
import com.braze.Braze
import com.braze.configuration.BrazeConfig
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capacitor bridge for the Braze Android SDK (com.braze:android-sdk-ui 42.2.0).
 *
 * Surface in 0.0.2:
 * - `echo(value)` — bridge sanity check
 * - `initialize(apiKey, endpoint, enableLogging?, enableSdkAuthentication?, allowInsecureEndpoint?)`
 *   — builds `BrazeConfig` from the supplied options and calls
 *   `Braze.configure(context, config)`. Subsequent calls reconfigure the
 *   singleton (Braze's documented behavior).
 *
 * Real user/event/push methods (`changeUser`, `logCustomEvent`, etc.) land in 0.1.0.
 *
 * See PLAN.md, SDK_SURFACE.md, and SECURITY.md for design context.
 */
@CapacitorPlugin(name = "Braze")
class BrazePlugin : Plugin() {

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

        call.resolve()
    }
}
