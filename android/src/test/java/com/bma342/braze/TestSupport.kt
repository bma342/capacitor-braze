package com.bma342.braze

import com.braze.Braze
import com.getcapacitor.Bridge
import com.getcapacitor.JSObject
import com.getcapacitor.PluginCall
import org.json.JSONObject
import org.mockito.ArgumentCaptor
import org.mockito.Mockito.verify
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import org.robolectric.RuntimeEnvironment

/**
 * Shared harness for the Robolectric tier (C11).
 *
 * Two things matter here:
 *
 * 1. [fakePluginCall] reproduces Capacitor's [PluginCall] accessor
 *    semantics *exactly* as `PluginCall.java` implements them — in
 *    particular the strict type checks (`getInt` returns the default for
 *    a JSON Double, `getBoolean` for anything non-Boolean). A lenient
 *    stub would hide precisely the coercion bugs these tests exist to
 *    catch.
 * 2. [initializedPlugin] runs the real `initialize` against the real
 *    Braze SDK on a Robolectric-synthesized Android context, so tests can
 *    reach post-init validation branches and the SDK-backed happy paths
 *    instead of stopping at the init guard.
 */
internal object TestSupport {

    /** Endpoint that satisfies both the HTTPS check and the cluster check. */
    const val VALID_ENDPOINT = "https://sdk.us-01.braze.com"

    /**
     * A [PluginCall] whose accessors behave like the real Capacitor
     * implementation over [data]. Reject/resolve are Mockito-verifiable.
     */
    fun fakePluginCall(data: JSObject): PluginCall {
        val call = mock<PluginCall>()
        whenever(call.data).thenReturn(data)
        whenever(call.getString(any<String>())).thenAnswer { data.opt(it.getArgument<String>(0)) as? String }
        whenever(call.getString(any<String>(), any())).thenAnswer {
            (data.opt(it.getArgument<String>(0)) as? String) ?: it.getArgument<String?>(1)
        }
        whenever(call.getInt(any<String>())).thenAnswer { data.opt(it.getArgument<String>(0)) as? Int }
        whenever(call.getInt(any<String>(), any())).thenAnswer {
            (data.opt(it.getArgument<String>(0)) as? Int) ?: it.getArgument<Int?>(1)
        }
        whenever(call.getLong(any<String>())).thenAnswer { data.opt(it.getArgument<String>(0)) as? Long }
        // Capacitor's getDouble widens Float and Integer; nothing else.
        whenever(call.getDouble(any<String>())).thenAnswer {
            when (val v = data.opt(it.getArgument<String>(0))) {
                is Double -> v
                is Float -> v.toDouble()
                is Int -> v.toDouble()
                else -> null
            }
        }
        whenever(call.getBoolean(any<String>())).thenAnswer { data.opt(it.getArgument<String>(0)) as? Boolean }
        whenever(call.getBoolean(any<String>(), any())).thenAnswer {
            (data.opt(it.getArgument<String>(0)) as? Boolean) ?: it.getArgument<Boolean?>(1)
        }
        whenever(call.getObject(any<String>())).thenAnswer {
            when (val v = data.opt(it.getArgument<String>(0))) {
                is JSONObject -> JSObject.fromJSONObject(v)
                else -> null
            }
        }
        return call
    }

    /** A plugin wired to a Robolectric application context, not initialized. */
    fun uninitializedPlugin(): BrazePlugin {
        val bridge = mock<Bridge>()
        whenever(bridge.context).thenReturn(RuntimeEnvironment.getApplication())
        whenever(bridge.activity).thenReturn(null)
        return BrazePlugin().also { it.setBridge(bridge) }
    }

    /**
     * A plugin that has run the real `initialize` against the real SDK.
     * [extraOptions] is applied on top of the minimal valid payload.
     *
     * Returns only once the SDK has a `currentUser`. `Braze.configure` does not
     * populate it synchronously, so a test that reads the user on the next line
     * — `getUserId reports an anonymous user as JSON null` is the one that
     * does — intermittently saw null and failed. The wait is best-effort by
     * design: if the user never appears, the test's own assertion reports it,
     * rather than this helper masking the failure with one of its own.
     */
    fun initializedPlugin(extraOptions: JSObject.() -> Unit = {}): BrazePlugin {
        val plugin = uninitializedPlugin()
        val data = JSObject()
            .put("apiKey", "test-api-key")
            .put("endpoint", VALID_ENDPOINT)
        data.extraOptions()
        val call = fakePluginCall(data)
        plugin.initialize(call)
        verify(call).resolve()
        awaitCurrentUser()
        return plugin
    }

    /** How long [initializedPlugin] waits for the SDK's user to materialize. */
    private const val USER_SETTLE_MS = 5_000L

    private fun awaitCurrentUser() {
        val app = RuntimeEnvironment.getApplication()
        val deadline = System.currentTimeMillis() + USER_SETTLE_MS
        while (System.currentTimeMillis() < deadline) {
            if (Braze.getInstance(app).currentUser != null) return
            Thread.sleep(10)
        }
    }

    /** The single string passed to `call.reject(...)`. */
    fun rejectionOf(call: PluginCall): String {
        val captor = ArgumentCaptor.forClass(String::class.java)
        verify(call).reject(captor.capture())
        return captor.value
    }

    /** The single [JSObject] passed to `call.resolve(...)`. */
    fun resolutionOf(call: PluginCall): JSObject {
        val captor = ArgumentCaptor.forClass(JSObject::class.java)
        verify(call).resolve(captor.capture())
        return captor.value
    }
}
