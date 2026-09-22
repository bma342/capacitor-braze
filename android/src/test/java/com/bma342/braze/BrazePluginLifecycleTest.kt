package com.bma342.braze

import android.net.Uri
import android.util.Log
import com.bma342.braze.TestSupport.VALID_ENDPOINT
import com.bma342.braze.TestSupport.fakePluginCall
import com.bma342.braze.TestSupport.initializedPlugin
import com.bma342.braze.TestSupport.rejectionOf
import com.bma342.braze.TestSupport.resolutionOf
import com.bma342.braze.TestSupport.uninitializedPlugin
import com.braze.IBrazeDeeplinkHandler
import com.braze.enums.Channel
import com.braze.events.BrazeSdkAuthenticationErrorEvent
import com.braze.support.BrazeLogger
import com.braze.ui.BrazeDeeplinkHandler
import com.braze.ui.actions.UriAction
import com.braze.ui.inappmessage.BrazeInAppMessageManager
import com.getcapacitor.JSObject
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.kotlin.any
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
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

    // -------------------------------------------------------------------------
    // Deep-link interception (deepLinkHandling)
    //
    // `BrazeDeeplinkHandler.setBrazeDeeplinkHandler` is a process-global
    // static with no "unset", so every test here restores the handler it
    // found. `getInstance()` returns the custom handler once one is set and
    // the SDK's own default otherwise, which is what makes the
    // install/restore assertions below observable.
    // -------------------------------------------------------------------------

    @Test
    fun `the default mode leaves the SDK's own deeplink handler in place`() {
        val before = BrazeDeeplinkHandler.getInstance()
        initializedPlugin()
        assertThat(BrazeDeeplinkHandler.getInstance()).isSameInstanceAs(before)
    }

    @Test
    fun `app mode installs an intercepting handler and restores it on destroy`() {
        val before = BrazeDeeplinkHandler.getInstance()
        val plugin = initializedPlugin { put("deepLinkHandling", "app") }

        val installed = BrazeDeeplinkHandler.getInstance()
        assertThat(installed).isNotSameInstanceAs(before)
        assertThat(installed).isInstanceOf(BrazePlugin.InterceptingDeeplinkHandler::class.java)

        plugin.handleOnDestroy()
        assertThat(BrazeDeeplinkHandler.getInstance()).isSameInstanceAs(before)
    }

    @Test
    fun `wipeData restores the previous handler`() {
        val before = BrazeDeeplinkHandler.getInstance()
        val plugin = initializedPlugin { put("deepLinkHandling", "app") }
        assertThat(BrazeDeeplinkHandler.getInstance()).isNotSameInstanceAs(before)

        val call = fakePluginCall(JSObject())
        plugin.wipeData(call)
        verify(call).resolve()

        assertThat(BrazeDeeplinkHandler.getInstance()).isSameInstanceAs(before)
        BrazeDeeplinkHandler.setBrazeDeeplinkHandler(before)
    }

    @Test
    fun `re-initializing without the option returns to SDK handling`() {
        val before = BrazeDeeplinkHandler.getInstance()
        val plugin = initializedPlugin { put("deepLinkHandling", "app") }
        assertThat(BrazeDeeplinkHandler.getInstance()).isNotSameInstanceAs(before)

        val call = fakePluginCall(
            JSObject().put("apiKey", "test-api-key").put("endpoint", VALID_ENDPOINT),
        )
        plugin.initialize(call)
        verify(call).resolve()

        assertThat(BrazeDeeplinkHandler.getInstance()).isSameInstanceAs(before)
        BrazeDeeplinkHandler.setBrazeDeeplinkHandler(before)
    }

    @Test
    fun `re-initializing in app mode replaces rather than stacks the wrapper`() {
        val before = BrazeDeeplinkHandler.getInstance()
        val plugin = initializedPlugin { put("deepLinkHandling", "app") }
        val first = BrazeDeeplinkHandler.getInstance()

        val call = fakePluginCall(
            JSObject()
                .put("apiKey", "test-api-key")
                .put("endpoint", VALID_ENDPOINT)
                .put("deepLinkHandling", "app"),
        )
        plugin.initialize(call)
        verify(call).resolve()

        val second = BrazeDeeplinkHandler.getInstance()
        assertThat(second).isNotSameInstanceAs(first)
        // The decisive assertion: restoring once must get all the way back to
        // the SDK's own handler. A stacked wrapper would leave `first`
        // installed, and every click would then fan out two
        // `deepLinkReceived` events (C05's stacked-subscriber failure).
        plugin.handleOnDestroy()
        assertThat(BrazeDeeplinkHandler.getInstance()).isSameInstanceAs(before)
    }

    @Test
    fun `a second plugin instance installing first does not chain wrappers`() {
        // Activity recreation: Android resumes the replacement before
        // destroying the outgoing one, so the new instance can install while
        // the old wrapper is still live. Capturing that wrapper would build a
        // chain whose middle link holds a closure over the dead Activity's
        // bridge — a leak and a duplicate-emit path. The install unwraps.
        val before = BrazeDeeplinkHandler.getInstance()
        val outgoing = initializedPlugin { put("deepLinkHandling", "app") }
        val firstWrapper = BrazeDeeplinkHandler.getInstance()

        val incoming = initializedPlugin { put("deepLinkHandling", "app") }
        val secondWrapper = BrazeDeeplinkHandler.getInstance() as BrazePlugin.InterceptingDeeplinkHandler
        assertThat(secondWrapper).isNotSameInstanceAs(firstWrapper)
        // One link deep, not two: the new wrapper delegates straight to the
        // SDK's own handler, never to the outgoing instance's wrapper.
        assertThat(secondWrapper.delegate).isSameInstanceAs(before)

        // The outgoing instance's teardown is identity-checked, so it leaves
        // the live wrapper alone.
        outgoing.handleOnDestroy()
        assertThat(BrazeDeeplinkHandler.getInstance()).isSameInstanceAs(secondWrapper)

        incoming.handleOnDestroy()
        assertThat(BrazeDeeplinkHandler.getInstance()).isSameInstanceAs(before)
    }

    @Test
    fun `the intercepting handler suppresses the open and reports the URI action`() {
        val seen = mutableListOf<UriAction>()
        val delegate = BrazeDeeplinkHandler()
        val handler = BrazePlugin.InterceptingDeeplinkHandler(delegate) { seen += it }

        val action = UriAction(
            Uri.parse("https://example.com/deep"),
            null,
            false,
            Channel.CONTENT_CARD,
        )
        // `gotoUri` is the single funnel every Braze Android channel uses to
        // open a URL; not executing the action is the suppression. Nothing
        // is launched here because the handler never touches the context.
        handler.gotoUri(RuntimeEnvironment.getApplication(), action)

        assertThat(seen).hasSize(1)
        assertThat(seen[0].uri.toString()).isEqualTo("https://example.com/deep")
        val payload = BrazePlugin.deepLinkPayload(seen[0])
        assertThat(payload.getString("source")).isEqualTo("contentCard")
        assertThat(payload.getBool("useWebView")).isFalse()
    }

    @Test
    fun `the intercepting handler delegates everything except gotoUri`() {
        val delegate = BrazeDeeplinkHandler()
        val handler = BrazePlugin.InterceptingDeeplinkHandler(delegate) { }

        // The plugin changes *whether* a URL opens, never how a UriAction is
        // built or which intent flags it gets — those stay the SDK's.
        assertThat(handler.getIntentFlags(IBrazeDeeplinkHandler.IntentFlagPurpose.URI_ACTION_OPEN_WITH_ACTION_VIEW))
            .isEqualTo(delegate.getIntentFlags(IBrazeDeeplinkHandler.IntentFlagPurpose.URI_ACTION_OPEN_WITH_ACTION_VIEW))

        val fromString = handler.createUriActionFromUrlString(
            "https://example.com/x",
            null,
            true,
            Channel.PUSH,
        )
        assertThat(fromString).isNotNull()
        assertThat(requireNotNull(fromString).channel).isEqualTo(Channel.PUSH)
        assertThat(fromString.useWebView).isTrue()

        val fromUri = handler.createUriActionFromUri(
            Uri.parse("https://example.com/y"),
            null,
            false,
            Channel.BANNER,
        )
        assertThat(fromUri.channel).isEqualTo(Channel.BANNER)
        assertThat(fromUri.useWebView).isFalse()
    }

    @Test
    fun `an unknown deepLinkHandling rejects with the web-identical message`() {
        val plugin = uninitializedPlugin()
        val call = fakePluginCall(
            JSObject()
                .put("apiKey", "test-api-key")
                .put("endpoint", VALID_ENDPOINT)
                .put("deepLinkHandling", "App"),
        )
        plugin.initialize(call)
        assertThat(rejectionOf(call))
            .isEqualTo("Braze.initialize: unknown deepLinkHandling \"App\". Allowed: sdk, app.")
    }
}
