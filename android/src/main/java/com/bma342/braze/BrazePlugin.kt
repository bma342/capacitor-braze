package com.bma342.braze

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Capacitor bridge for the Braze Android SDK.
 *
 * Scaffold release (0.0.1): `echo` is fully wired; `initialize` validates
 * options and stores config. Actual `Braze.getInstance(context)` wiring lands in 0.0.2.
 *
 * See PLAN.md and SECURITY.md for design decisions.
 */
@CapacitorPlugin(name = "Braze")
class BrazePlugin : Plugin() {

    private var storedConfig: BrazeStoredConfig? = null

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

        storedConfig = BrazeStoredConfig(
            apiKey = apiKey,
            endpoint = endpoint,
            enableLogging = enableLogging,
            enableSdkAuthentication = enableSdkAuthentication,
        )

        // 0.0.2 will wire actual SDK init here:
        //   val config = BrazeConfig.Builder()
        //       .setApiKey(apiKey)
        //       .setCustomEndpoint(endpoint)
        //       .setSdkAuthenticationEnabled(enableSdkAuthentication)
        //       .build()
        //   Braze.configure(context, config)

        call.resolve()
    }
}

private data class BrazeStoredConfig(
    val apiKey: String,
    val endpoint: String,
    val enableLogging: Boolean,
    val enableSdkAuthentication: Boolean,
)
