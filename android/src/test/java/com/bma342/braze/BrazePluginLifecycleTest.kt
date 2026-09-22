package com.bma342.braze

import android.util.Log
import com.bma342.braze.TestSupport.VALID_ENDPOINT
import com.bma342.braze.TestSupport.fakePluginCall
import com.bma342.braze.TestSupport.initializedPlugin
import com.bma342.braze.TestSupport.resolutionOf
import com.bma342.braze.TestSupport.uninitializedPlugin
import com.braze.events.BrazeSdkAuthenticationErrorEvent
import com.braze.support.BrazeLogger
import com.braze.ui.inappmessage.BrazeInAppMessageManager
import com.getcapacitor.JSObject
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.kotlin.any
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Lifecycle and configuration behaviour that only shows up once
 * `initialize` has really run against the SDK: logging level, repeat
 * initialization, subscription teardown, and the `sdkAuthError` payload.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class BrazePluginLifecycleTest {

    // -------------------------------------------------------------------------
    // Logging (C06 / SECURITY.md §8)
    // -------------------------------------------------------------------------

    @Test
    fun `enableLogging false drops the SDK log level to errors only`() {
        // BrazeLogger's static default is Log.INFO, so "off" has to be set
        // explicitly — and the previous code only ever set the verbose
        // branch.
        BrazeLogger.logLevel = BrazeLogger.VERBOSE
        initializedPlugin { put("enableLogging", false) }
        assertThat(BrazeLogger.logLevel).isEqualTo(Log.ERROR)
    }

    @Test
    fun `enableLogging defaults to false`() {
        BrazeLogger.logLevel = BrazeLogger.VERBOSE
        initializedPlugin()
        assertThat(BrazeLogger.logLevel).isEqualTo(Log.ERROR)
    }

    @Test
    fun `enableLogging true raises the SDK log level to verbose`() {
        BrazeLogger.logLevel = Log.ERROR
        initializedPlugin { put("enableLogging", true) }
        assertThat(BrazeLogger.logLevel).isEqualTo(BrazeLogger.VERBOSE)
    }

    @Test
    fun `the log level is reversible across re-initialization`() {
        // `BrazeLogger.enableVerboseLogging()` is a one-way process global;
        // setting the property in both branches is what makes opt-out work.
        initializedPlugin { put("enableLogging", true) }
        assertThat(BrazeLogger.logLevel).isEqualTo(BrazeLogger.VERBOSE)
        initializedPlugin { put("enableLogging", false) }
        assertThat(BrazeLogger.logLevel).isEqualTo(Log.ERROR)
    }

    // -------------------------------------------------------------------------
    // Repeat initialization
    // -------------------------------------------------------------------------

    @Test
    fun `a second initialize resolves instead of rejecting`() {
        // Activity recreation re-runs the web app's initialize, and
        // Braze.configure returns false the second time. Rejecting would
        // break every consumer whose Activity is recreated.
        initializedPlugin()
        val plugin = uninitializedPlugin()
        val call = fakePluginCall(
            JSObject().put("apiKey", "second-key").put("endpoint", VALID_ENDPOINT),
        )
        plugin.initialize(call)
        verify(call).resolve()
        verify(call, never()).reject(any<String>())
    }

    @Test
    fun `plugin state still follows the second initialize's options`() {
        initializedPlugin { put("enableSdkAuthentication", false) }
        val plugin = uninitializedPlugin()
        val init = fakePluginCall(
            JSObject()
                .put("apiKey", "k")
                .put("endpoint", VALID_ENDPOINT)
                .put("enableSdkAuthentication", true),
        )
        plugin.initialize(init)
        verify(init).resolve()
        // The plugin-side SDK-Auth gate reflects what this call asked for.
        val changeUser = fakePluginCall(JSObject().put("userId", "u"))
        plugin.changeUser(changeUser)
        assertThat(TestSupport.rejectionOf(changeUser)).contains("`sdkAuthSignature` is required")
    }

    // -------------------------------------------------------------------------
    // Teardown
    // -------------------------------------------------------------------------

    @Test
    fun `handleOnDestroy resets the plugin to its pre-init state`() {
        val plugin = initializedPlugin()
        plugin.handleOnDestroy()
        val call = fakePluginCall(JSObject())
        plugin.getAllFeatureFlags(call)
        assertThat(TestSupport.rejectionOf(call))
            .isEqualTo("Braze.initialize() must be called before any other Braze method.")
    }

    @Test
    fun `handleOnDestroy is safe on a plugin that was never initialized`() {
        uninitializedPlugin().handleOnDestroy()
    }

    @Test
    fun `handleOnDestroy leaves a newer instance's in-app message listener alone`() {
        // Android resumes the replacement Activity before destroying the
        // old one, so the outgoing instance must not clear a listener slot
        // that now belongs to its successor.
        val outgoing = initializedPlugin()
        val incoming = initializedPlugin()
        val manager = BrazeInAppMessageManager.getInstance()
        val incomingListener = manager.inAppMessageManagerListener
        outgoing.handleOnDestroy()
        assertThat(manager.inAppMessageManagerListener).isSameInstanceAs(incomingListener)
        assertThat(manager.controlInAppMessageManagerListener).isSameInstanceAs(incomingListener)

        // ...and the successor still clears its own slot when it goes.
        incoming.handleOnDestroy()
        assertThat(manager.inAppMessageManagerListener).isNotSameInstanceAs(incomingListener)
    }

    @Test
    fun `wipeData resets the plugin to its pre-init state`() {
        val plugin = initializedPlugin()
        val wipe = fakePluginCall(JSObject())
        plugin.wipeData(wipe)
        verify(wipe).resolve()
        val call = fakePluginCall(JSObject())
        plugin.getContentCards(call)
        assertThat(TestSupport.rejectionOf(call))
            .isEqualTo("Braze.initialize() must be called before any other Braze method.")
    }

    // -------------------------------------------------------------------------
    // Post-init reads that go through the SDK
    // -------------------------------------------------------------------------

    @Test
    fun `getContentCards resolves an empty feed with a null lastUpdated`() {
        val call = fakePluginCall(JSObject())
        initializedPlugin().getContentCards(call)
        val result = resolutionOf(call)
        assertThat(result.getJSONArray("cards").length()).isEqualTo(0)
        assertThat(result.get("lastUpdated")).isEqualTo(JSObject.NULL)
    }

    @Test
    fun `getAllFeatureFlags resolves an empty list before any sync`() {
        val call = fakePluginCall(JSObject())
        initializedPlugin().getAllFeatureFlags(call)
        assertThat(resolutionOf(call).getJSONArray("flags").length()).isEqualTo(0)
    }

    // -------------------------------------------------------------------------
    // sdkAuthError payload
    // -------------------------------------------------------------------------

    /**
     * `BrazeSdkAuthenticationErrorEvent`'s only constructor takes an
     * SDK-internal payload type, so the event is mocked and its public
     * accessors stubbed. Mockito 5's inline mock maker handles the final
     * Kotlin class.
     */
    private fun sdkAuthErrorEvent(userId: String?): BrazeSdkAuthenticationErrorEvent {
        val event = org.mockito.Mockito.mock(BrazeSdkAuthenticationErrorEvent::class.java)
        org.mockito.kotlin.whenever(event.errorCode).thenReturn(401)
        org.mockito.kotlin.whenever(event.errorReason).thenReturn("expired")
        org.mockito.kotlin.whenever(event.signature).thenReturn("sig-abc")
        org.mockito.kotlin.whenever(event.userId).thenReturn(userId)
        return event
    }

    @Test
    fun `sdkAuthError reports an anonymous user as null, not an empty string`() {
        val plugin = uninitializedPlugin()
        val anonymous = plugin.serializeSdkAuthError(sdkAuthErrorEvent(null))
        assertThat(anonymous.get("userId")).isEqualTo(JSObject.NULL)
        assertThat(anonymous.getInt("errorCode")).isEqualTo(401)
        assertThat(anonymous.getString("errorReason")).isEqualTo("expired")
        assertThat(anonymous.getString("signature")).isEqualTo("sig-abc")
        // Reserved on every platform until an SDK surfaces one.
        assertThat(anonymous.get("errorEventId")).isEqualTo(JSObject.NULL)

        val identified = plugin.serializeSdkAuthError(sdkAuthErrorEvent("user-9"))
        assertThat(identified.getString("userId")).isEqualTo("user-9")

        // The Android SDK reports an anonymous user as an empty string in
        // some paths; that must not leak through as a "" sentinel either.
        assertThat(plugin.serializeSdkAuthError(sdkAuthErrorEvent("")).get("userId"))
            .isEqualTo(JSObject.NULL)
    }
}
