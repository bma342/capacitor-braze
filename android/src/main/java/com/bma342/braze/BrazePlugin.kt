package com.bma342.braze

import android.content.Context
import com.braze.Braze
import com.braze.BrazeActivityLifecycleCallbackListener
import com.braze.IBrazeDeeplinkHandler
import com.braze.configuration.BrazeConfig
import com.braze.enums.Channel
import com.braze.enums.Gender
import com.braze.enums.Month
import com.braze.events.BrazeSdkAuthenticationErrorEvent
import com.braze.events.ContentCardsUpdatedEvent
import com.braze.events.FeatureFlagsUpdatedEvent
import com.braze.events.IEventSubscriber
import com.braze.models.FeatureFlag
import com.braze.models.cards.CaptionedImageCard
import com.braze.models.cards.Card
import com.braze.models.cards.ImageOnlyCard
import com.braze.models.cards.ShortNewsCard
import com.braze.models.cards.TextAnnouncementCard
import com.braze.models.outgoing.BrazeProperties
import com.braze.enums.inappmessage.ClickAction
import com.braze.enums.inappmessage.MessageType
import com.braze.enums.inappmessage.SlideFrom
import com.braze.models.inappmessage.IInAppMessage
import com.braze.models.inappmessage.IInAppMessageImmersive
import com.braze.models.inappmessage.IInAppMessageWithImage
import com.braze.models.inappmessage.InAppMessageBase
import com.braze.models.inappmessage.InAppMessageSlideup
import com.braze.models.inappmessage.MessageButton
import com.braze.support.BrazeLogger
import com.braze.ui.BrazeDeeplinkHandler
import com.braze.ui.actions.UriAction
import com.braze.ui.inappmessage.BrazeInAppMessageManager
import com.braze.ui.inappmessage.InAppMessageOperation
import com.braze.ui.inappmessage.listeners.IInAppMessageManagerListener
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.math.BigDecimal

/**
 * Capacitor bridge for the Braze Android SDK (com.braze:android-sdk-ui 43.2.0).
 *
 * ## Surface in 0.2.0
 *
 * - **Bridge sanity:** `echo(value)`
 * - **Configuration:** `initialize(apiKey, endpoint, ...)`
 * - **User identity:** `changeUser(userId, sdkAuthSignature?)`, `getUserId`,
 *   `setSdkAuthenticationSignature(signature)`, `addAlias(alias, label)`
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
 * - **Content cards:** `getContentCards`, `requestContentCardsRefresh`,
 *   `logContentCardClick(cardId)`, `logContentCardImpression(cardId)`
 * - **Push:** `registerPushToken(token)`
 * - **Listeners:** `addListener('featureFlagsUpdated', ...)`,
 *   `addListener('contentCardsUpdated', ...)`,
 *   `addListener('inAppMessageReceived', ...)`,
 *   `addListener('sdkAuthError', ...)`,
 *   `addListener('deepLinkReceived', ...)`
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
 * Because that singleton is process-wide while a [Plugin] instance is
 * Activity-scoped, the bridge is careful about both ends of the lifecycle:
 * [BrazeActivityLifecycleCallbackListener] is registered exactly once per
 * process (see [sessionLifecycleRegistered]) so Braze counts sessions, and
 * [handleOnDestroy] removes every subscription this instance created so a
 * destroyed Activity/WebView is not retained by the SDK's event messenger.
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

    /**
     * Mirror of [featureFlagsSubscriber] for the content-cards update
     * stream. Created in `initialize`, removed by identity in `wipeData`.
     */
    private var contentCardsSubscriber: IEventSubscriber<ContentCardsUpdatedEvent>? = null

    /**
     * Mirror of [featureFlagsSubscriber] for SDK Authentication failure
     * events (Phase 13 / L5-04). Created in `initialize`, removed by
     * identity in `wipeData`.
     */
    private var sdkAuthErrorSubscriber: IEventSubscriber<BrazeSdkAuthenticationErrorEvent>? = null

    /**
     * Whether `initialize` was called with `enableSdkAuthentication: true`.
     * When true, `changeUser` rejects calls that don't carry an
     * `sdkAuthSignature` (see `SECURITY.md` §2). Persisted as plugin
     * state because the underlying `BrazeConfig` is not readable
     * post-`configure`.
     */
    private var sdkAuthenticationEnabled: Boolean = false

    /**
     * Whether `initialize` was called with `enableInAppMessageUI: true`
     * (the default). When false the plugin still emits
     * `inAppMessageReceived`, but it never calls
     * `registerInAppMessageManager` — the host app owns registration and
     * rendering. See the `enableInAppMessageUI` JSDoc in
     * `src/definitions.ts`.
     */
    private var inAppMessageUIEnabled: Boolean = true

    /**
     * Whether this plugin instance currently holds an
     * [BrazeInAppMessageManager] registration against [Plugin.getActivity].
     * Tracked so `handleOnPause` / `handleOnDestroy` never unregister a
     * registration the host app (not the plugin) owns.
     */
    private var inAppMessageManagerRegistered: Boolean = false

    /**
     * The [IBrazeDeeplinkHandler] this plugin instance installed for
     * `deepLinkHandling: "app"`, or null in the default `"sdk"` mode.
     * Retained so [handleOnDestroy] / `wipeData` / a re-`initialize` can
     * restore whatever handler was in place beforehand — the SDK's setter
     * is a process-global static with no "unset".
     */
    private var deepLinkHandler: InterceptingDeeplinkHandler? = null

    /**
     * The [IBrazeDeeplinkHandler] that was installed before
     * [deepLinkHandler] replaced it. `BrazeDeeplinkHandler.getInstance()`
     * returns the custom handler once one is set, so this has to be
     * captured *before* installing, both to restore on teardown and to
     * delegate the three non-`gotoUri` interface methods to.
     */
    private var previousDeepLinkHandler: IBrazeDeeplinkHandler? = null

    /**
     * Custom [IBrazeDeeplinkHandler] that emits `deepLinkReceived` instead
     * of opening the URL.
     *
     * `gotoUri` is the single funnel every Braze Android channel uses to
     * open a URL — verified at `com.braze:android-sdk-ui` 43.2.0 by the set
     * of classes that reference it: `BrazeNotificationUtils` (push opens),
     * `DefaultInAppMessageViewLifecycleListener` and
     * `DefaultInAppMessageWebViewClientListener` (in-app message body,
     * button and HTML-iframe clicks), `BaseCardView` /
     * `BrazeContentCardUtils` (content-card clicks rendered by Braze's own
     * feed UI), `DefaultBannerWebViewClientListener` (banners), and the
     * Braze Actions steps `OpenLinkInWebViewStep` / `OpenLinkExternallyStep`.
     * Not executing the [UriAction] is therefore what suppresses the open.
     *
     * The other three interface methods are pure factories / flag lookups
     * with no side effects, so they delegate to the handler that was
     * installed beforehand rather than being reimplemented — the plugin
     * changes *whether* a URL opens, never how a [UriAction] is built.
     *
     * @property delegate the previously installed handler, used for
     *   everything except `gotoUri`.
     * @property onSuppressed invoked with the suppressed action so the
     *   plugin can emit the listener event.
     */
    internal class InterceptingDeeplinkHandler(
        internal val delegate: IBrazeDeeplinkHandler,
        private val onSuppressed: (UriAction) -> Unit,
    ) : IBrazeDeeplinkHandler {

        override fun gotoUri(context: Context, uriAction: UriAction) {
            onSuppressed(uriAction)
        }

        override fun getIntentFlags(intentFlagPurpose: IBrazeDeeplinkHandler.IntentFlagPurpose): Int =
            delegate.getIntentFlags(intentFlagPurpose)

        override fun createUriActionFromUrlString(
            url: String,
            extras: android.os.Bundle?,
            openInWebView: Boolean,
            channel: Channel,
        ): UriAction? = delegate.createUriActionFromUrlString(url, extras, openInWebView, channel)

        override fun createUriActionFromUri(
            uri: android.net.Uri,
            extras: android.os.Bundle?,
            openInWebView: Boolean,
            channel: Channel,
        ): UriAction = delegate.createUriActionFromUri(uri, extras, openInWebView, channel)
    }

    companion object {
        /** Logcat tag for the bridge's own (never PII-bearing) warnings. */
        private const val LOG_TAG = "CapacitorBraze"

        /**
         * Process-wide guard for [BrazeActivityLifecycleCallbackListener].
         * The listener registers against the `Application`, so registering
         * it once per [BrazePlugin] instance would stack duplicate
         * callbacks every time the host Activity is recreated. Guarded by
         * the class monitor in [registerSessionLifecycleOnce].
         */
        @Volatile
        private var sessionLifecycleRegistered: Boolean = false

        /**
         * Documented Braze cluster hostname shape
         * (`sdk.<region>-NN.braze.com` / `.eu`). Mirrors the regex in
         * `src/web.ts` so the cluster sanity warning fires on the same
         * inputs on every platform.
         */
        private val CLUSTER_HOST_REGEX = Regex("""^sdk\.[a-z]+-\d+\.braze\.(com|eu)$""")

        /** Local-development hosts exempted from the cluster warning. */
        private val DEV_HOST_REGEX = Regex("""^(localhost|127\.0\.0\.1|.+\.(test|local))$""")

        /**
         * Maps `com.braze.enums.Channel` onto the contract's
         * `BrazeDeepLinkSource` union. `PUSH` is renamed to `push` so the
         * value matches iOS's `Braze.Channel.notification`; `UNKNOWN` and
         * anything a future SDK adds surface as `other` rather than being
         * coerced into a neighbouring channel.
         *
         * `internal` so the Robolectric tier can assert the mapping
         * directly (C11).
         */
        internal fun deepLinkSource(channel: Channel?): String = when (channel) {
            Channel.PUSH -> "push"
            Channel.INAPP_MESSAGE -> "inAppMessage"
            Channel.CONTENT_CARD -> "contentCard"
            Channel.BANNER -> "banner"
            Channel.UNKNOWN, null -> "other"
        }

        /**
         * Builds the `BrazeDeepLinkReceivedEvent` wire shape from a
         * suppressed [UriAction].
         *
         * `internal` so the Robolectric tier can assert the payload without
         * driving the whole SDK (C11).
         */
        internal fun deepLinkPayload(uriAction: UriAction): JSObject {
            val payload = JSObject()
            payload.put("url", uriAction.uri.toString())
            payload.put("source", deepLinkSource(uriAction.channel))
            payload.put("useWebView", uriAction.useWebView)
            return payload
        }
    }

    // -------------------------------------------------------------------------
    // In-app message lifecycle
    //
    // L4-S11 / Phase 3: Braze Android renders IAMs via a singleton
    // [BrazeInAppMessageManager] that must be registered against the
    // currently-foregrounded Activity in onResume and unregistered in
    // onPause. Without this wiring, the SDK fetches IAM campaigns but
    // never displays them. Capacitor exposes Plugin.handleOnResume() /
    // handleOnPause() as lifecycle hooks; we forward those to the IAM
    // manager. The bridge Activity (bridge.activity) is the host for
    // all in-app message display.
    //
    // Registration is deliberately NOT delegated to
    // BrazeActivityLifecycleCallbackListener (which is constructed with
    // registerInAppMessageManager = false in
    // [registerSessionLifecycleOnce]) so that `enableInAppMessageUI:
    // false` has a single, honest off-switch.
    // -------------------------------------------------------------------------

    override fun handleOnResume() {
        super.handleOnResume()
        wireInAppMessages()
    }

    override fun handleOnPause() {
        super.handleOnPause()
        unregisterInAppMessageManager()
    }

    /**
     * Tears down everything this plugin instance registered against the
     * process-wide Braze singleton.
     *
     * Capacitor creates a fresh [Plugin] instance (and a fresh `Bridge`,
     * Activity and WebView) whenever the host Activity is recreated, but
     * the Braze event messenger holds subscribers by strong reference for
     * the life of the process. Without this hook every Activity
     * recreation would leak the previous Activity + WebView through the
     * three `IEventSubscriber` lambdas created in [initialize]. See C05.
     *
     * The IAM listener slots are cleared only when they still hold *this*
     * instance's listener. On a configuration change Android resumes the
     * replacement Activity before destroying the old one, so by the time
     * this runs the slots usually belong to the new plugin instance —
     * clearing them unconditionally would silently stop
     * `inAppMessageReceived` after the first rotation.
     *
     * Widened from `protected` so the Robolectric tier can drive it
     * directly (C11); Capacitor calls it either way.
     */
    public override fun handleOnDestroy() {
        teardownFeatureFlagsSubscription()
        teardownContentCardsSubscription()
        teardownSdkAuthErrorSubscription()
        val manager = BrazeInAppMessageManager.getInstance()
        val listener = inAppMessageListener
        if (manager.inAppMessageManagerListener === listener) {
            manager.setCustomInAppMessageManagerListener(null)
        }
        if (manager.controlInAppMessageManagerListener === listener) {
            manager.setCustomControlInAppMessageManagerListener(null)
        }
        unregisterInAppMessageManager()
        teardownDeepLinkHandler()
        initialized = false
        sdkAuthenticationEnabled = false
        super.handleOnDestroy()
    }

    /**
     * Wires the plugin's observational IAM listener and — unless the
     * consumer passed `enableInAppMessageUI: false` — registers the
     * [BrazeInAppMessageManager] against the current Activity.
     *
     * The custom listener is set in both cases: it always returns
     * [InAppMessageOperation.DISPLAY_NOW], so it changes nothing about
     * display, and it is the only way the plugin can emit
     * `inAppMessageReceived`. It is re-set on every resume because the
     * manager is a process-wide singleton whose listener slot is cleared
     * by process death.
     */
    private fun wireInAppMessages() {
        val manager = BrazeInAppMessageManager.getInstance()
        val listener = inAppMessageListener
        manager.setCustomInAppMessageManagerListener(listener)
        // Control-variant in-app messages dispatch through a separate
        // listener slot; wire the same impl so consumers receive
        // 'inAppMessageReceived' for control campaigns too. Control
        // messages have isControl=true on the IInAppMessage; the
        // serializer maps them to the 'control' type discriminator.
        manager.setCustomControlInAppMessageManagerListener(listener)
        if (!inAppMessageUIEnabled) return
        val activity = bridge?.activity ?: return
        manager.registerInAppMessageManager(activity)
        inAppMessageManagerRegistered = true
    }

    /**
     * Installs [InterceptingDeeplinkHandler] so Braze-driven URL opens emit
     * `deepLinkReceived` instead of navigating. Called from `initialize`
     * when `deepLinkHandling` is `"app"`.
     *
     * Idempotent: a re-`initialize` restores the previous handler first, so
     * re-running this never stacks wrappers (which would make the same click
     * fan out N `deepLinkReceived` events, the deep-link analogue of the
     * stacked-subscriber bug C05 lists under Forbidden).
     *
     * The handler the SDK reports *before* the install is captured and
     * delegated to, because `BrazeDeeplinkHandler.setBrazeDeeplinkHandler`
     * is a process-global static with no un-set: restoring means installing
     * that captured handler back.
     */
    private fun installDeepLinkHandler() {
        teardownDeepLinkHandler()
        // Unwrap before capturing. During an Activity recreation the
        // replacement plugin instance can install *before* the outgoing one's
        // `handleOnDestroy` runs, so `getInstance()` may already be another
        // instance's wrapper. Capturing that would build a chain — and the
        // orphaned wrapper in the middle holds a closure over the dead
        // Activity's bridge, which is both a leak and a duplicate-emit path.
        // Taking its delegate keeps the chain exactly one deep, always.
        val live = BrazeDeeplinkHandler.getInstance()
        val previous = if (live is InterceptingDeeplinkHandler) live.delegate else live
        val handler = InterceptingDeeplinkHandler(previous) { uriAction ->
            notifyOnMain("deepLinkReceived", deepLinkPayload(uriAction))
        }
        BrazeDeeplinkHandler.setBrazeDeeplinkHandler(handler)
        previousDeepLinkHandler = previous
        deepLinkHandler = handler
    }

    /**
     * Restores the handler that was installed before
     * [installDeepLinkHandler] ran — but only while *this* instance's
     * handler is still the live one.
     *
     * The identity check matters for the same reason the in-app message
     * listener teardown has one: on a configuration change Android resumes
     * the replacement Activity (which has already installed its own
     * handler) before destroying the outgoing one, so an unconditional
     * restore would silently stop `deepLinkReceived` after the first
     * rotation.
     */
    private fun teardownDeepLinkHandler() {
        val installed = deepLinkHandler
        if (installed != null && BrazeDeeplinkHandler.getInstance() === installed) {
            previousDeepLinkHandler?.let { BrazeDeeplinkHandler.setBrazeDeeplinkHandler(it) }
        }
        deepLinkHandler = null
        previousDeepLinkHandler = null
    }

    /** Inverse of the registration half of [wireInAppMessages]. */
    private fun unregisterInAppMessageManager() {
        if (!inAppMessageManagerRegistered) return
        val activity = bridge?.activity ?: return
        BrazeInAppMessageManager.getInstance().unregisterInAppMessageManager(activity)
        inAppMessageManagerRegistered = false
    }

    /**
     * Registers [BrazeActivityLifecycleCallbackListener] against the
     * `Application` exactly once per process, then opens a session for
     * the Activity that is *already* started.
     *
     * Without the listener the Braze SDK never calls
     * `openSession` / `closeSession`, so every event is logged outside a
     * session: session-scoped analytics (DAU/MAU, session length),
     * session-start triggers, and flush-on-background all stop working.
     * Neither Braze AAR declares a ContentProvider or `androidx.startup`
     * Initializer, and Capacitor's `BridgeActivity` extends
     * `AppCompatActivity` rather than `BrazeBaseFragmentActivity`, so
     * there is no auto-init path — the wrapper has to own this.
     *
     * The listener only observes callbacks that fire *after* it is
     * registered, and JS cannot call `initialize` before its own
     * Activity has started, so the current Activity's session is opened
     * explicitly here.
     */
    private fun registerSessionLifecycleOnce() {
        synchronized(BrazePlugin::class.java) {
            if (!sessionLifecycleRegistered) {
                BrazeActivityLifecycleCallbackListener(
                    sessionHandlingEnabled = true,
                    // The plugin owns IAM registration so that
                    // `enableInAppMessageUI: false` is honoured.
                    registerInAppMessageManager = false,
                ).registerOnApplication(context.applicationContext)
                sessionLifecycleRegistered = true
            }
        }
        bridge?.activity?.let { Braze.getInstance(context).openSession(it) }
    }

    /**
     * Pushes a listener event into the WebView from the main thread.
     *
     * Braze dispatches `IEventSubscriber` callbacks from its own
     * coroutine scope. Capacitor 6's `notifyListeners` reaches
     * `JavaScriptReplyProxy.postMessage` on the calling thread and
     * swallows any exception it raises, so a cross-thread post would drop
     * the event with only a logcat line. Braze's own `ContentCardsFragment`
     * hops to `Dispatchers.Main` in its subscriber for the same reason.
     */
    private fun notifyOnMain(eventName: String, data: JSObject) {
        val activeBridge = bridge
        if (activeBridge == null) {
            notifyListeners(eventName, data)
            return
        }
        activeBridge.executeOnMainThread { notifyListeners(eventName, data) }
    }

    /**
     * Custom listener wired to [BrazeInAppMessageManager] so consumer JS
     * receives an `inAppMessageReceived` event for every IAM trigger.
     * Always returns [InAppMessageOperation.DISPLAY_NOW] to preserve
     * out-of-the-box display behavior; listener implementations on the
     * JS side cannot block display (Phase 3b scope), but they can react.
     */
    private val inAppMessageListener: IInAppMessageManagerListener by lazy {
        object : IInAppMessageManagerListener {
            override fun beforeInAppMessageDisplayed(inAppMessage: IInAppMessage): InAppMessageOperation {
                val payload = JSObject()
                payload.put("message", serializeInAppMessage(inAppMessage))
                notifyOnMain("inAppMessageReceived", payload)
                return InAppMessageOperation.DISPLAY_NOW
            }
        }
    }

    // The serializers below are `internal` rather than `private` so the
    // Robolectric tier can drive them against real Braze model objects and
    // assert the exact DTO (C11). They are not part of the published
    // Capacitor surface: `internal` members are name-mangled and invisible
    // to consumers.

    /**
     * Serializes an [IInAppMessage] to the plugin's portable DTO. The
     * `type` discriminator collapses the SDK's five `MessageType` cases
     * onto the contract's five canonical variants (SLIDEUP→slideup,
     * MODAL→modal, FULL→full, HTML or HTML_FULL→html, plus
     * `isControl`→control taking precedence regardless of MessageType).
     */
    internal fun serializeInAppMessage(message: IInAppMessage): JSObject {
        val dto = JSObject()
        // `triggerId` is the campaign trigger / analytics id. It is
        // declared on InAppMessageBase, the superclass of every concrete
        // variant the manager can hand a listener (slideup, modal, full,
        // html, control), and is the Android counterpart of iOS's
        // `message.id` and the Web SDK's `triggerId`.
        // An absent trigger id reads back as "" on Android; the contract
        // slot is `string | null`, so the empty-string sentinel is
        // normalised away rather than forwarded to JS.
        dto.put(
            "id",
            (message as? InAppMessageBase)?.triggerId?.takeIf { it.isNotEmpty() } ?: JSObject.NULL,
        )
        dto.put("clickAction", serializeClickAction(message.clickAction, message.uri?.toString(), message.openUriInWebView))
        dto.put("extras", extrasToJSObject(message.extras))

        if (message.isControl) {
            dto.put("type", "control")
            return dto
        }

        // `altImageText` and `icon` are declared on the base
        // IInAppMessage interface, so they are readable on every
        // non-control variant rather than being immersive-only. `language`
        // genuinely has no Android accessor (iOS and Web expose it), so
        // that key stays absent — a real, narrow cross-platform
        // asymmetry, documented in C03.
        message.altImageText?.takeIf { it.isNotBlank() }?.let { dto.put("imageAltText", it) }

        // `remoteImageUrl` is on the IInAppMessageWithImage sibling
        // interface, not the base IInAppMessage. Cast once, use across
        // variants — modals/fulls/slideups can all carry an image.
        val withImage = message as? IInAppMessageWithImage
        val imageUrl: String? = withImage?.remoteImageUrl

        when (message.messageType) {
            MessageType.SLIDEUP -> {
                dto.put("type", "slideup")
                dto.put("message", message.message ?: "")
                if (!imageUrl.isNullOrBlank()) dto.put("imageUrl", imageUrl)
                // Font Awesome icon name configured on the campaign; only
                // slide-ups render one, so it is only emitted here.
                message.icon?.takeIf { it.isNotBlank() }?.let { dto.put("icon", it) }
                // InAppMessageSlideup.slideFrom is a real TOP/BOTTOM enum;
                // a top-anchored campaign must not report "bottom".
                val slideFrom = (message as? InAppMessageSlideup)?.slideFrom
                dto.put("slideFrom", if (slideFrom == SlideFrom.TOP) "top" else "bottom")
            }
            MessageType.MODAL -> {
                dto.put("type", "modal")
                val immersive = message as? IInAppMessageImmersive
                dto.put("header", immersive?.header ?: "")
                dto.put("message", message.message ?: "")
                if (!imageUrl.isNullOrBlank()) dto.put("imageUrl", imageUrl)
                dto.put("buttons", serializeButtons(immersive?.messageButtons ?: emptyList()))
            }
            MessageType.FULL -> {
                dto.put("type", "full")
                val immersive = message as? IInAppMessageImmersive
                dto.put("header", immersive?.header ?: "")
                dto.put("message", message.message ?: "")
                if (!imageUrl.isNullOrBlank()) dto.put("imageUrl", imageUrl)
                dto.put("buttons", serializeButtons(immersive?.messageButtons ?: emptyList()))
            }
            MessageType.HTML, MessageType.HTML_FULL -> {
                dto.put("type", "html")
                dto.put("message", message.message ?: "")
            }
            else -> {
                // Future MessageType values fall back to slideup with an
                // empty message — non-disruptive default; consumers can
                // detect and ignore.
                dto.put("type", "slideup")
                dto.put("message", message.message ?: "")
                val slideFrom = (message as? InAppMessageSlideup)?.slideFrom
                dto.put("slideFrom", if (slideFrom == SlideFrom.TOP) "top" else "bottom")
            }
        }
        return dto
    }

    internal fun serializeClickAction(action: ClickAction, uri: String?, useWebView: Boolean): JSObject {
        val obj = JSObject()
        // Braze Android's ClickAction enum is just NONE / URI as of
        // 42.x — no NEWSFEED variant (iOS dropped it too). Map URI →
        // contract `url`, everything else → `none`.
        if (action == ClickAction.URI) {
            obj.put("type", "url")
            obj.put("uri", uri ?: "")
            obj.put("useWebView", useWebView)
        } else {
            obj.put("type", "none")
        }
        return obj
    }

    private fun serializeButtons(buttons: List<MessageButton>): JSArray {
        val array = JSArray()
        for (b in buttons) {
            val obj = JSObject()
            obj.put("id", b.id)
            obj.put("text", b.text ?: "")
            // Note: MessageButton's "open in webview" accessor is
            // `openUriInWebview` (lowercase 'w' in 'webview') —
            // different from IInAppMessage's `openUriInWebView`
            // (capital 'W'). Braze SDK convention.
            obj.put("clickAction", serializeClickAction(b.clickAction, b.uri?.toString(), b.openUriInWebview))
            array.put(obj)
        }
        return array
    }

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
                    "Set `allowInsecureEndpoint: true` only for local mock-server testing. " +
                    "See SECURITY.md §4.",
            )
            return
        }
        // L5-03: URL parsing client-side. SECURITY.md §4 promises malformed
        // URLs reject before they reach the SDK; this delivers on that.
        // Bare-host shorthand (`sdk.us-01.braze.com` with no scheme) is
        // accepted by Braze's docs, so we prefix a dummy scheme before
        // parsing to preserve that ergonomic path.
        val parseTarget = if (endpoint.contains("://")) endpoint else "https://$endpoint"
        val parsed = try {
            java.net.URI(parseTarget)
        } catch (_: java.net.URISyntaxException) {
            call.reject("Braze.initialize: `endpoint` is malformed (must be a parseable URL or bare hostname).")
            return
        }
        warnIfNotBrazeCluster(parsed.host)

        val enableLogging = call.getBoolean("enableLogging", false) ?: false
        val enableSdkAuthentication = call.getBoolean("enableSdkAuthentication", false) ?: false
        val enableInAppMessageUI = call.getBoolean("enableInAppMessageUI", true) ?: true

        // Closed enum: an unrecognized mode rejects rather than falling back
        // to "sdk", so a consumer who typo'd "App" can't believe deep links
        // are gated when they aren't. The error names the value under C06
        // §4's closed-enum exemption, byte-identical to `src/web.ts`.
        val deepLinkHandling = call.getString("deepLinkHandling") ?: "sdk"
        if (deepLinkHandling != "sdk" && deepLinkHandling != "app") {
            call.reject("Braze.initialize: unknown deepLinkHandling \"$deepLinkHandling\". Allowed: sdk, app.")
            return
        }

        // L5-08 / C04: reject a non-positive OR non-integer
        // `sessionTimeoutInSeconds` rather than silently dropping it.
        // Capacitor's `getInt` returns null for an absent key *and* for a
        // present-but-non-Integer value (a JS `1800.5` arrives as a
        // Double), so absence has to be probed on the raw payload to tell
        // "use the default" apart from "you passed something invalid".
        val hasSessionTimeout = call.data.has("sessionTimeoutInSeconds") &&
            !call.data.isNull("sessionTimeoutInSeconds")
        val sessionTimeoutInSeconds = call.getInt("sessionTimeoutInSeconds")
        if (hasSessionTimeout && (sessionTimeoutInSeconds == null || sessionTimeoutInSeconds <= 0)) {
            call.reject("Braze.initialize: `sessionTimeoutInSeconds` must be a positive integer.")
            return
        }

        // C06 / SECURITY.md §8: `enableLogging: false` is the secure
        // default and has to mean something. BrazeLogger's static default
        // is Log.INFO, and `enableVerboseLogging()` is a one-way
        // process-global — so the level is set on BOTH branches, and the
        // quiet branch drops to errors-only rather than leaving INFO/WARN
        // (which can carry event payloads) in logcat.
        BrazeLogger.logLevel = if (enableLogging) BrazeLogger.VERBOSE else android.util.Log.ERROR

        val builder = BrazeConfig.Builder()
            .setApiKey(apiKey)
            .setCustomEndpoint(endpoint)
            .setIsSdkAuthenticationEnabled(enableSdkAuthentication)

        if (sessionTimeoutInSeconds != null) {
            // Android SDK's setter takes seconds (Int); we accept seconds
            // at the plugin boundary per C03 so cross-platform parity is
            // maintained without a unit conversion.
            builder.setSessionTimeout(sessionTimeoutInSeconds)
        }

        // `Braze.configure` returns false when a live, non-stopped
        // instance with an API key already exists: it logs a warning,
        // changes nothing, and keeps the first configuration for the
        // process lifetime. That is not an error case for a Capacitor
        // app — an Activity recreation re-runs the web app's
        // `initialize` — so the call resolves, but the consumer gets a
        // warning because the options they just passed were dropped by
        // the SDK.
        val configured = Braze.configure(context, builder.build())
        initialized = true
        sdkAuthenticationEnabled = enableSdkAuthentication
        inAppMessageUIEnabled = enableInAppMessageUI
        if (!configured) {
            BrazeLogger.w(
                LOG_TAG,
                "Braze.initialize: the Braze SDK was already configured in this process and keeps " +
                    "its first configuration (apiKey, endpoint, SDK Authentication and session " +
                    "timeout) until the app restarts. The options passed to this call were not " +
                    "applied to the SDK.",
            )
        }

        registerSessionLifecycleOnce()
        // Register the IAM manager here too: `handleOnResume` has already
        // fired by the time JS can call `initialize`, so waiting for the
        // next resume would lose every in-app message until the app is
        // backgrounded and foregrounded again.
        wireInAppMessages()

        // `"app"` installs the suppressing handler; `"sdk"` restores
        // whatever was in place before, so a re-`initialize` that drops the
        // option genuinely returns to SDK-opens-the-URL rather than leaving
        // the previous run's interception armed.
        if (deepLinkHandling == "app") {
            installDeepLinkHandler()
        } else {
            teardownDeepLinkHandler()
        }

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
            notifyOnMain("featureFlagsUpdated", payload)
        }
        Braze.getInstance(context).subscribeToFeatureFlagsUpdates(subscriber)
        featureFlagsSubscriber = subscriber

        teardownContentCardsSubscription()
        val ccSubscriber = IEventSubscriber<ContentCardsUpdatedEvent> { event ->
            notifyOnMain("contentCardsUpdated", serializeContentCardsEvent(event))
        }
        Braze.getInstance(context).subscribeToContentCardsUpdates(ccSubscriber)
        contentCardsSubscriber = ccSubscriber

        // Phase 13 / L5-04: wire BrazeSdkAuthenticationErrorEvent
        // subscriber so the consumer's JS listener for `sdkAuthError`
        // fires when Braze rejects an authenticated request.
        teardownSdkAuthErrorSubscription()
        val authSubscriber = IEventSubscriber<BrazeSdkAuthenticationErrorEvent> { event ->
            notifyOnMain("sdkAuthError", serializeSdkAuthError(event))
        }
        Braze.getInstance(context).subscribeToSdkAuthenticationFailures(authSubscriber)
        sdkAuthErrorSubscriber = authSubscriber

        call.resolve()
    }

    /**
     * Emits a warning when `endpoint`'s hostname doesn't look like a
     * documented Braze cluster. Never rejects (custom/proxied endpoints
     * are legitimate) and never logs the endpoint itself — a consumer
     * typo is a support question, not a reason to put their host into
     * logcat. Mirrors the web bridge's check so a typo surfaces on every
     * platform.
     */
    private fun warnIfNotBrazeCluster(rawHost: String?) {
        val host = rawHost?.lowercase() ?: ""
        if (CLUSTER_HOST_REGEX.matches(host) || DEV_HOST_REGEX.matches(host)) return
        BrazeLogger.w(
            LOG_TAG,
            "Braze.initialize: `endpoint` host does not match the documented Braze cluster pattern " +
                "sdk.<region>-NN.braze.com (or .braze.eu). The SDK will still attempt to connect; verify " +
                "the host in your Braze dashboard under Settings > Manage Settings > API Settings.",
        )
    }

    /**
     * Serializes a [BrazeSdkAuthenticationErrorEvent] to the plugin's
     * portable DTO. `userId` is JSON `null` for an anonymous user rather
     * than an empty-string sentinel, matching iOS and web.
     */
    internal fun serializeSdkAuthError(event: BrazeSdkAuthenticationErrorEvent): JSObject {
        val payload = JSObject()
        val userId = event.userId
        payload.put("userId", if (userId.isNullOrEmpty()) JSObject.NULL else userId)
        payload.put("errorCode", event.errorCode)
        payload.put("errorReason", event.errorReason ?: "")
        payload.put("signature", event.signature ?: JSObject.NULL)
        // Android SDK doesn't expose an errorEventId field on the event.
        // Neither does BrazeKit or the Web SDK: the contract slot is
        // reserved and is currently always null on every platform.
        payload.put("errorEventId", JSObject.NULL)
        return payload
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
        if (sdkAuthenticationEnabled && sdkAuthSignature.isNullOrEmpty()) {
            call.reject(
                "Braze.changeUser: `sdkAuthSignature` is required (string) when SDK Authentication is enabled. See SECURITY.md §2.",
            )
            return
        }
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

    /**
     * Rotates the SDK Authentication signature on the live Braze instance.
     * No-op at the SDK level when `enableSdkAuthentication` was false at
     * init time — the signature is stored but never sent.
     */
    @PluginMethod
    fun setSdkAuthenticationSignature(call: PluginCall) {
        if (!requireInitialized(call)) return
        val signature = call.getString("signature")
        if (signature.isNullOrEmpty()) {
            call.reject("Braze.setSdkAuthenticationSignature: `signature` is required (string).")
            return
        }
        Braze.getInstance(context).setSdkAuthenticationSignature(signature)
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
        warnIfRejected(user.setEmail(call.getString("email")), "setEmail")
        call.resolve()
    }

    @PluginMethod
    fun setPhoneNumber(call: PluginCall) {
        val user = requireUser(call) ?: return
        warnIfRejected(user.setPhoneNumber(call.getString("phoneNumber")), "setPhoneNumber")
        call.resolve()
    }

    @PluginMethod
    fun setFirstName(call: PluginCall) {
        val user = requireUser(call) ?: return
        warnIfRejected(user.setFirstName(call.getString("firstName")), "setFirstName")
        call.resolve()
    }

    @PluginMethod
    fun setLastName(call: PluginCall) {
        val user = requireUser(call) ?: return
        warnIfRejected(user.setLastName(call.getString("lastName")), "setLastName")
        call.resolve()
    }

    @PluginMethod
    fun setLanguage(call: PluginCall) {
        val user = requireUser(call) ?: return
        warnIfRejected(user.setLanguage(call.getString("language")), "setLanguage")
        call.resolve()
    }

    @PluginMethod
    fun setCountry(call: PluginCall) {
        val user = requireUser(call) ?: return
        warnIfRejected(user.setCountry(call.getString("country")), "setCountry")
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
            // L4-K02: preserve Long precision. JS Numbers up to
            // MAX_SAFE_INTEGER (2^53 ≈ 9.0e15) can safely arrive as Long
            // when the underlying JSON parser detects an integer larger
            // than Int.MAX_VALUE. The Braze Android SDK exposes a
            // setCustomUserAttribute(String, Long) overload at 42.x; the
            // previous `.toInt()` silently truncated to 32 bits, mangling
            // any value larger than ~2.1 billion. Use the Long overload
            // directly.
            is Long -> user.setCustomUserAttribute(key, value)
            is Double -> user.setCustomUserAttribute(key, value)
            is Float -> user.setCustomUserAttribute(key, value.toDouble())
            else -> {
                // C04 explicit rejection rather than silent drop on unsupported
                // types (e.g. arrays, nested objects, null). Bypasses the TS
                // type guard for consumers using `any`-typed properties.
                call.reject(
                    "Braze.setCustomUserAttribute: `value` must be string, number, or boolean.",
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
        warnIfRejected(user.addToSubscriptionGroup(groupId), "addToSubscriptionGroup")
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
        warnIfRejected(user.removeFromSubscriptionGroup(groupId), "removeFromSubscriptionGroup")
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
        warnIfRejected(user.addAlias(alias, label), "addAlias")
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
            call.reject(
                "Braze.getDeviceId: SDK has not generated a device ID yet. " +
                    "Call `initialize` first or wait until the SDK has finished bootstrapping.",
            )
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
        // L2-07: per-field error messages, byte-identical to the web bridge.
        val year = call.getInt("year")
        if (year == null || year < 1900 || year > 2100) {
            call.reject("Braze.setDateOfBirth: `year` must be an integer between 1900 and 2100.")
            return
        }
        val month = call.getInt("month")
        if (month == null || month < 1 || month > 12) {
            call.reject("Braze.setDateOfBirth: `month` must be an integer between 1 and 12.")
            return
        }
        val day = call.getInt("day")
        if (day == null || day < 1 || day > 31) {
            call.reject("Braze.setDateOfBirth: `day` must be an integer between 1 and 31.")
            return
        }
        // K04: Month.entries is the cached array form on Kotlin 1.9+ (we're
        // on Kotlin 2.2). One-time allocation, matches what we want for a
        // hot-ish per-call lookup.
        val monthEnum = Month.entries[month - 1]
        warnIfRejected(user.setDateOfBirth(year, monthEnum, day), "setDateOfBirth")
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
        warnIfRejected(user.setGender(gender), "setGender")
        call.resolve()
    }

    @PluginMethod
    fun setHomeCity(call: PluginCall) {
        val user = requireUser(call) ?: return
        warnIfRejected(user.setHomeCity(call.getString("homeCity")), "setHomeCity")
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
        val brazeProperties = when (val result = brazePropertiesFrom(call.getObject("properties"))) {
            is PropertiesResult.Invalid -> {
                call.reject(
                    "Braze.logCustomEvent: `properties.${result.key}` must be string, number, or boolean.",
                )
                return
            }
            is PropertiesResult.Ok -> result.properties
        }
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
        // Capacitor's `getInt` returns null for an absent key *and* for a
        // present-but-non-Integer value, so a JS `quantity: 2.5` would
        // otherwise fall through to the default of 1 and log a purchase
        // with the wrong quantity. Probe the raw payload to tell absence
        // (use the default) from an invalid value (reject, as web does).
        val hasQuantity = call.data.has("quantity") && !call.data.isNull("quantity")
        val rawQuantity = call.getInt("quantity")
        if (hasQuantity && rawQuantity == null) {
            call.reject("Braze.logPurchase: `quantity` must be an integer between 1 and 100.")
            return
        }
        val quantity = rawQuantity ?: 1
        if (quantity < 1 || quantity > 100) {
            call.reject("Braze.logPurchase: `quantity` must be an integer between 1 and 100.")
            return
        }
        val brazeProperties = when (val result = brazePropertiesFrom(call.getObject("properties"))) {
            is PropertiesResult.Invalid -> {
                call.reject(
                    "Braze.logPurchase: `properties.${result.key}` must be string, number, or boolean.",
                )
                return
            }
            is PropertiesResult.Ok -> result.properties
        }
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
     * Serializes a [FeatureFlag] to the plugin's portable wire format:
     * exactly `id`, `enabled` and `properties`, per `BrazeFeatureFlag` in
     * `src/definitions.ts`.
     *
     * Built field-by-field rather than via the SDK's own
     * `forJsonPut()` encoder, which additionally writes an `fts` key
     * holding Braze's internal impression-attribution token
     * (`trackingString`, `internal` on the Kotlin side). That key is not
     * part of the declared contract and has no business reaching consumer
     * code, logs or analytics payloads.
     *
     * `properties` is the underlying `JSONObject` round-tripped through a
     * string into a `JSObject`. Braze stores properties in the same
     * `{ key: { type, value } }` shape exposed on the wire, so the
     * roundtrip preserves correctness without manual case-by-case
     * conversion.
     */
    internal fun serializeFeatureFlag(flag: FeatureFlag): JSObject {
        val dto = JSObject()
        dto.put("id", flag.id)
        dto.put("enabled", flag.enabled)
        dto.put("properties", JSObject(flag.properties?.toString() ?: "{}"))
        return dto
    }

    // -------------------------------------------------------------------------
    // Content cards
    //
    // Braze Android 42.x exposes content cards via the singleton:
    //   - Braze.getInstance(context).getCachedContentCards()
    //       returns List<Card> directly (no Event wrapper on the cached
    //       read).
    //   - Braze.getInstance(context).getContentCardsLastUpdatedInSecondsFromEpoch()
    //       last server-sync time; -1 if never fetched.
    //   - Braze.getInstance(context).requestContentCardsRefresh()
    //       no arguments. requestContentCardsRefreshFromCache() is a
    //       separate method for the cache-only path.
    //   - card.logClick() / card.logImpression()
    //       called directly on the Card instance.
    //
    // The subscribeToContentCardsUpdates path gives us a
    // ContentCardsUpdatedEvent with allCards + timestampSeconds.
    //
    // To match the plugin's `{ cardId: string }` contract, we look up
    // the Card by id in the cached collection before invoking logClick
    // / logImpression — the Android SDK doesn't have a static
    // "log by id" form.
    // -------------------------------------------------------------------------

    @PluginMethod
    fun getContentCards(call: PluginCall) {
        if (!requireInitialized(call)) return
        val braze = Braze.getInstance(context)
        // Kotlin doesn't auto-translate these Java getters to property
        // accessors (likely due to generic return type on the cache
        // method), so we call them explicitly.
        val cards: List<Card> = braze.getCachedContentCards() ?: emptyList()
        val timestampSeconds = braze.getContentCardsLastUpdatedInSecondsFromEpoch()
        call.resolve(serializeContentCardsList(cards, timestampSeconds))
    }

    @PluginMethod
    fun requestContentCardsRefresh(call: PluginCall) {
        if (!requireInitialized(call)) return
        Braze.getInstance(context).requestContentCardsRefresh()
        call.resolve()
    }

    @PluginMethod
    fun logContentCardClick(call: PluginCall) {
        if (!requireInitialized(call)) return
        val card = requireContentCardById(call, "logContentCardClick") ?: return
        warnIfRejected(card.logClick(), "logContentCardClick")
        call.resolve()
    }

    @PluginMethod
    fun logContentCardImpression(call: PluginCall) {
        if (!requireInitialized(call)) return
        val card = requireContentCardById(call, "logContentCardImpression") ?: return
        warnIfRejected(card.logImpression(), "logContentCardImpression")
        call.resolve()
    }

    // -------------------------------------------------------------------------
    // Push token registration
    //
    // Consumer flow:
    //   1. @capacitor/push-notifications fires its `registration` event
    //      with the FCM token string.
    //   2. Consumer forwards that string here.
    //   3. We assign it to Braze.getInstance(context).registeredPushToken,
    //      which the SDK consumes for outbound FCM messaging.
    //
    // The SDK's setter accepts the token string verbatim; no decoding
    // step is needed (FCM tokens are already strings, unlike iOS APNs
    // tokens which arrive as Data).
    // -------------------------------------------------------------------------

    @PluginMethod
    fun registerPushToken(call: PluginCall) {
        if (!requireInitialized(call)) return
        val token = call.getString("token")
        if (token.isNullOrEmpty()) {
            call.reject("Braze.registerPushToken: `token` is required (string).")
            return
        }
        Braze.getInstance(context).registeredPushToken = token
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
        // Drop all subscriptions too so re-init creates fresh ones rather
        // than leaving zombie subscribers against the wiped SDK.
        teardownFeatureFlagsSubscription()
        teardownContentCardsSubscription()
        teardownSdkAuthErrorSubscription()
        // The deep-link mode is per-`initialize`, like the SDK-auth flag:
        // after a wipe the SDK opens URLs itself again until a fresh
        // `initialize` asks for interception.
        teardownDeepLinkHandler()
        initialized = false
        sdkAuthenticationEnabled = false
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
     * Mirror of [teardownFeatureFlagsSubscription] for content cards.
     */
    private fun teardownContentCardsSubscription() {
        contentCardsSubscriber?.let { subscriber ->
            Braze.getInstance(context).removeSingleSubscription(
                subscriber,
                ContentCardsUpdatedEvent::class.java,
            )
        }
        contentCardsSubscriber = null
    }

    /**
     * Mirror of [teardownFeatureFlagsSubscription] for SDK Authentication
     * failure events. Removes the listener by identity so a re-init
     * doesn't double-fire `sdkAuthError` notifications.
     */
    private fun teardownSdkAuthErrorSubscription() {
        sdkAuthErrorSubscriber?.let { subscriber ->
            Braze.getInstance(context).removeSingleSubscription(
                subscriber,
                BrazeSdkAuthenticationErrorEvent::class.java,
            )
        }
        sdkAuthErrorSubscriber = null
    }

    /**
     * Looks up a content card by id in the SDK's cached collection.
     * Rejects the call with a clear error if `cardId` is missing or no
     * matching card is found.
     *
     * The Android SDK's logClick / logImpression are instance methods on
     * `Card`, so this lookup is the bridge between the public
     * `{ cardId }` contract and the SDK's call shape.
     */
    private fun requireContentCardById(call: PluginCall, method: String): Card? {
        val cardId = call.getString("cardId")
        if (cardId.isNullOrEmpty()) {
            call.reject("Braze.$method: `cardId` is required (string).")
            return null
        }
        val cached: List<Card> = Braze.getInstance(context).getCachedContentCards() ?: emptyList()
        val card = cached.firstOrNull { it.id == cardId }
        if (card == null) {
            call.reject(
                "Braze.$method: no cached content card with id \"$cardId\". " +
                    "Call getContentCards() to verify the id, or wait for the next refresh.",
            )
            return null
        }
        return card
    }

    /**
     * Serializes a list of cards + last-update timestamp to the plugin's
     * wire-format `BrazeGetContentCardsResult`. Used by both the
     * synchronous `getContentCards` reader and the
     * `subscribeToContentCardsUpdates` listener payload.
     *
     * `timestampSeconds` of -1 (Braze's "never fetched" sentinel) is
     * surfaced as JSON `null` per the canonical contract.
     */
    internal fun serializeContentCardsList(cards: List<Card>, timestampSeconds: Long): JSObject {
        val result = JSObject()
        val cardsArray = JSArray()
        for (card in cards) {
            serializeContentCard(card)?.let { cardsArray.put(it) }
        }
        result.put("cards", cardsArray)
        if (timestampSeconds > 0) {
            result.put("lastUpdated", timestampSeconds * 1000L)
        } else {
            result.put("lastUpdated", JSObject.NULL)
        }
        return result
    }

    /**
     * Adapts the ContentCardsUpdatedEvent shape used by the
     * subscribeToContentCardsUpdates callback into the same list +
     * timestamp pair used everywhere else. `event.timestampSeconds`
     * is the SDK's last-server-sync time.
     */
    private fun serializeContentCardsEvent(event: ContentCardsUpdatedEvent): JSObject {
        return serializeContentCardsList(event.allCards, event.timestampSeconds)
    }

    /**
     * Serializes a single [Card] to the plugin's portable DTO. The
     * `type` discriminator is the C02 four-string union
     * (`classic` / `captionedImage` / `imageOnly` / `control`); Braze
     * Android's five concrete subclasses collapse to those four:
     *
     *   - [ControlCard][card.isControl]       -> 'control'
     *   - [CaptionedImageCard]                -> 'captionedImage'
     *   - [ImageOnlyCard]                     -> 'imageOnly'
     *   - [ShortNewsCard]                     -> 'classic' (small image)
     *   - [TextAnnouncementCard]              -> 'classic' (no image)
     *
     * Per L2-02: switching on the subclass (vs. `card.forJsonPut()`
     * passthrough) makes the wire format match the contract on every
     * platform, so consumers can narrow on `card.type` and trust the
     * narrowed type. Returns null only for unknown future subclasses.
     *
     * Field mapping:
     *   - `linkText`  ← `card.domain` (visible URL/link text)
     *   - `url`       ← `card.url` (the SDK's resolved click URL)
     *   - `aspectRatio` ← `card.aspectRatio` as Double (null for unset)
     *   - `dismissed` ← `card.isDismissed`
     *   - `dismissible` ← `card.isDismissibleByUser`
     *   - `clicked`   ← `card.isClicked`
     *   - `updated`   ← `card.created` × 1000 (epoch ms) or null
     *   - `expiresAt` ← `card.expiresAt` × 1000 (epoch ms) or null
     *      (the SDK uses -1 to mean "never expires")
     */
    internal fun serializeContentCard(card: Card): JSObject? {
        val dto = JSObject()
        dto.put("id", card.id)
        dto.put("viewed", card.viewed)
        dto.put("pinned", card.isPinned)
        dto.put("extras", extrasToJSObject(card.extras))
        dto.put("updated", epochSecondsToMillis(card.created))
        dto.put("expiresAt", expiresAtSecondsToMillis(card.expiresAt))

        if (card.isControl) {
            dto.put("type", "control")
            return dto
        }

        val clickUrl: Any = card.url ?: JSObject.NULL
        dto.put("clicked", card.isClicked)
        dto.put("dismissed", card.isDismissed)
        dto.put("dismissible", card.isDismissibleByUser)
        // A2-15 item 2: `Card.openUriInWebView` is the Android counterpart of
        // BrazeKit's `ContentCard.ClickAction.url(_, useWebView:)` and of the
        // in-app-message contract's `clickAction.useWebView`. It used to be
        // dropped on content cards while the IAM path carried it. Only emitted
        // when the card actually has a click URL — a card with nothing to open
        // has no open-target preference to report, which is why the contract
        // slot is optional.
        if (card.url != null) {
            dto.put("useWebView", card.openUriInWebView)
        }

        when (card) {
            is CaptionedImageCard -> {
                dto.put("type", "captionedImage")
                dto.put("title", card.title ?: "")
                dto.put("description", card.description ?: "")
                dto.put("imageUrl", card.imageUrl ?: "")
                dto.put("url", clickUrl)
                dto.put("aspectRatio", aspectRatioOrNull(card.aspectRatio))
                dto.put("linkText", card.domain ?: JSObject.NULL)
                dto.put("altImageText", card.altImageText ?: JSObject.NULL)
            }
            is ImageOnlyCard -> {
                dto.put("type", "imageOnly")
                dto.put("imageUrl", card.imageUrl ?: "")
                dto.put("url", clickUrl)
                dto.put("aspectRatio", aspectRatioOrNull(card.aspectRatio))
                dto.put("altImageText", card.altImageText ?: JSObject.NULL)
            }
            is ShortNewsCard -> {
                dto.put("type", "classic")
                dto.put("title", card.title ?: "")
                dto.put("description", card.description ?: "")
                dto.put("imageUrl", card.imageUrl ?: "")
                dto.put("url", clickUrl)
                // `aspectRatio` is a required (non-optional) field on
                // BrazeClassicContentCard. Neither Android classic
                // subclass carries the hint, so it is emitted as an
                // explicit JSON null rather than left absent.
                dto.put("aspectRatio", JSObject.NULL)
                dto.put("linkText", card.domain ?: JSObject.NULL)
                dto.put("altImageText", card.altImageText ?: JSObject.NULL)
            }
            is TextAnnouncementCard -> {
                dto.put("type", "classic")
                dto.put("title", card.title ?: "")
                dto.put("description", card.description ?: "")
                dto.put("url", clickUrl)
                dto.put("aspectRatio", JSObject.NULL)
                dto.put("linkText", card.domain ?: JSObject.NULL)
            }
            else -> return null
        }
        return dto
    }

    private fun extrasToJSObject(extras: Map<String, String>): JSObject {
        val result = JSObject()
        for ((key, value) in extras) {
            result.put(key, value)
        }
        return result
    }

    /**
     * Maps an SDK epoch-seconds timestamp to epoch ms. The Braze
     * Android SDK uses 0 for "unset" on `created`. Negative or zero
     * surface as JSON null.
     */
    private fun epochSecondsToMillis(seconds: Long): Any {
        return if (seconds > 0) seconds * 1000L else JSObject.NULL
    }

    /**
     * Maps an SDK `expiresAt` epoch-seconds timestamp to epoch ms.
     * The SDK uses -1 to mean "never expires"; we surface that as
     * JSON null because the contract treats expiry as optional.
     */
    private fun expiresAtSecondsToMillis(seconds: Long): Any {
        return if (seconds > 0) seconds * 1000L else JSObject.NULL
    }

    /**
     * Maps the SDK's `aspectRatio` Float to a non-negative Double, or
     * JSON null when the value is unset (Braze surfaces unset as 0
     * for cards that don't carry the field). Defensive against NaN
     * for forward compatibility.
     */
    private fun aspectRatioOrNull(value: Float): Any {
        return if (value > 0f && !value.isNaN()) value.toDouble() else JSObject.NULL
    }

    /**
     * Outcome of converting a JS `properties` bag into Braze's wrapper.
     * [Invalid] carries the offending key so the caller can name it in a
     * C01-format error string.
     */
    internal sealed interface PropertiesResult {
        /** Conversion succeeded. [properties] is null for an empty bag. */
        data class Ok(val properties: BrazeProperties?) : PropertiesResult

        /** `properties[key]` was not a string, number or boolean. */
        data class Invalid(val key: String) : PropertiesResult
    }

    /**
     * Converts a Capacitor `JSObject` into Braze's properties wrapper.
     *
     * 0.2.0 supports `string` / `number` / `boolean` values per the TS
     * interface (`BrazeEventPropertyValue`). Date and array support land in a
     * later version per SDK_SURFACE.md §2.
     *
     * Values that don't match those types (nested objects, arrays, JSON
     * null) are reported as [PropertiesResult.Invalid] rather than
     * dropped, matching the explicit rejection `setCustomUserAttribute`
     * already performs for the same input class. This is only reachable
     * when a consumer bypasses the TS type system (e.g. passes
     * `properties` from `any`-typed code).
     *
     * @return [PropertiesResult.Ok] wrapping `BrazeProperties`, or a null
     *         payload when the input was null/empty (so the caller can pick
     *         the appropriate `logCustomEvent` overload).
     */
    internal fun brazePropertiesFrom(jsObject: JSObject?): PropertiesResult {
        if (jsObject == null || jsObject.length() == 0) {
            return PropertiesResult.Ok(null)
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
                else -> return PropertiesResult.Invalid(key)
            }
        }
        return PropertiesResult.Ok(props)
    }

    /**
     * Surfaces a `false` return from a `BrazeUser` setter.
     *
     * Every `BrazeUser` mutator returns a validation boolean: `false`
     * means Braze rejected the value (malformed email, invalid custom
     * attribute key, empty subscription group id, …) and stored nothing.
     * The bridge still resolves the call — the Web SDK offers no
     * equivalent signal, so rejecting would break cross-platform parity —
     * but a silent discard is a debugging dead end, so the method name is
     * logged at warn level. Per SECURITY.md §3 the rejected value itself
     * is never logged.
     */
    private fun warnIfRejected(accepted: Boolean, method: String) {
        if (accepted) return
        BrazeLogger.w(LOG_TAG, "Braze.$method: the Braze SDK rejected the value (see SDK logs)")
    }
}
