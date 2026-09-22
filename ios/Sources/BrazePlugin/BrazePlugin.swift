import BrazeKit
import BrazeUI
import Capacitor
import Foundation
import os
import UserNotifications

/// Capacitor bridge for the Braze iOS SDK (BrazeKit / BrazeUI 18.2.1).
///
/// ## Surface
///
/// - **Bridge sanity:** `echo(value)`
/// - **Configuration:** `initialize(apiKey, endpoint, ...)`
/// - **User identity:** `changeUser(userId, sdkAuthSignature?)`, `getUserId`,
///   `setSdkAuthenticationSignature(signature)`, `addAlias(alias, label)`
/// - **Device ID:** `getDeviceId`
/// - **User attributes (standard):** `setEmail`, `setPhoneNumber`,
///   `setFirstName`, `setLastName`, `setLanguage`, `setCountry`
/// - **User attributes (demographics):** `setDateOfBirth(year, month, day)`,
///   `setGender(gender)`, `setHomeCity(homeCity?)`
/// - **User attributes (custom):** `setCustomUserAttribute(key, value)` —
///   dispatches on the real JSON type of `value`
/// - **Subscription groups:** `addToSubscriptionGroup(groupId)`,
///   `removeFromSubscriptionGroup(groupId)`
/// - **Events:** `logCustomEvent(name, properties?)`,
///   `logPurchase(productId, currency, price, quantity?, properties?)`
/// - **Feature flags:** `getFeatureFlag(id)`, `getAllFeatureFlags`,
///   `refreshFeatureFlags`, `logFeatureFlagImpression(id)`
/// - **Content cards:** `getContentCards`, `requestContentCardsRefresh`,
///   `logContentCardClick(cardId)`, `logContentCardImpression(cardId)`
/// - **Push:** `registerPushToken(token)`
/// - **Listeners:** `featureFlagsUpdated`, `contentCardsUpdated`,
///   `inAppMessageReceived`, `sdkAuthError`, `deepLinkReceived`
/// - **Privacy/lifecycle:** `wipeData`, `disableSDK`, `enableSDK`, `isDisabled`,
///   `requestImmediateDataFlush`
///
/// ## Threading
///
/// Capacitor does **not** invoke plugin methods on the main thread:
/// `CapacitorBridge` owns a serial `DispatchQueue(label: "bridge")` and
/// `perform(selector:)`s every call on it. BrazeUI's presenter, BrazeKit's
/// `subscribeToUpdates` callbacks and the delegate protocols are all
/// `@MainActor`, so every piece of plugin state below is `@MainActor`-isolated
/// and every `@objc` entry point hops onto the main queue exactly once before
/// touching it. That gives the plugin a single isolation domain: `initialize`
/// and `wipeData` are then strictly ordered relative to each other, and the
/// presenter/delegate wiring can no longer land on an instance a later
/// `wipeData` already disowned.
///
/// ## Design notes
///
/// The configured `Braze` instance is retained as a `static` property
/// (`BrazePlugin.braze`) following Braze's own `AppDelegate.braze` convention
/// from their docs. The static accessor lets push delegate hooks and other
/// plugin extensions reach the instance without re-initialization.
///
/// Privacy methods (`wipeData`, `disableSDK`, `enableSDK`, `isDisabled`) are
/// **init-independent** (C07): they work before `initialize` has been called,
/// which is what GDPR/CCPA consent flows need. `disableSDK` / `enableSDK` /
/// `isDisabled` do that by recording the consumer's intent in
/// `disabledPreInit` and applying it to the instance the moment one exists.
///
/// User attribute setters operate on `braze.user`, which is always non-nil
/// post-init (the SDK creates an anonymous user profile by default until
/// `changeUser` is called).
///
/// PII handling per SECURITY.md §3: this bridge never logs attribute values,
/// user identifiers or endpoints.
///
/// See PLAN.md, SDK_SURFACE.md, and SECURITY.md for design context.
@objc(BrazePlugin)
public class BrazePlugin: CAPPlugin, CAPBridgedPlugin {

    // MARK: - Capacitor bridge registration (CAPBridgedPlugin)
    //
    // These three properties replace what `ios/Plugin/BrazePlugin.m`'s
    // `CAP_PLUGIN` / `CAP_PLUGIN_METHOD` macros used to emit. The Obj-C file
    // was removed in 0.3.0 because a Swift Package Manager target cannot mix
    // Swift and Objective-C sources, and SPM is how Capacitor 8's CLI
    // generates iOS projects by default.
    //
    // This is not a Capacitor 8-only mechanism: the `CAPBridgedPlugin`
    // protocol and `CapacitorBridge.registerPlugins()`'s
    // `plugin as? (CAPPlugin & CAPBridgedPlugin).Type` check are **byte
    // identical** in the Capacitor 6.2.2, 7.6.9 and 8.5.2 runtimes, and the
    // CLI's `findPluginClasses` discovers the class from the `@objc(...)`
    // attribute above in all three. So one registration mechanism serves
    // Capacitor 6, 7 and 8, under both CocoaPods and SPM. See C01 + C10.
    //
    // Keep this list ordered by category to match the method bodies below:
    //   Bridge sanity → Configuration → User identity → User attributes →
    //   Custom events → Feature flags → Content cards → Push →
    //   Privacy/lifecycle
    //
    // `addListener` / `removeAllListeners` are deliberately absent: the
    // Capacitor bridge implements those on `CAPPlugin` itself and rejects a
    // plugin that re-declares them.
    public let identifier = "BrazePlugin"
    public let jsName = "Braze"
    public let pluginMethods: [CAPPluginMethod] = [
        // Bridge sanity
        CAPPluginMethod(name: "echo", returnType: CAPPluginReturnPromise),

        // Configuration
        CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),

        // User identity
        CAPPluginMethod(name: "changeUser", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getUserId", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSdkAuthenticationSignature", returnType: CAPPluginReturnPromise),

        // User attributes (standard)
        CAPPluginMethod(name: "setEmail", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPhoneNumber", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setFirstName", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setLastName", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setLanguage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCountry", returnType: CAPPluginReturnPromise),

        // User attributes (demographics)
        CAPPluginMethod(name: "setDateOfBirth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setGender", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setHomeCity", returnType: CAPPluginReturnPromise),

        // User attributes (custom)
        CAPPluginMethod(name: "setCustomUserAttribute", returnType: CAPPluginReturnPromise),

        // Subscription groups
        CAPPluginMethod(name: "addToSubscriptionGroup", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeFromSubscriptionGroup", returnType: CAPPluginReturnPromise),

        // Aliases
        CAPPluginMethod(name: "addAlias", returnType: CAPPluginReturnPromise),

        // Device ID
        CAPPluginMethod(name: "getDeviceId", returnType: CAPPluginReturnPromise),

        // Custom events
        CAPPluginMethod(name: "logCustomEvent", returnType: CAPPluginReturnPromise),

        // Purchases
        CAPPluginMethod(name: "logPurchase", returnType: CAPPluginReturnPromise),

        // Feature flags
        CAPPluginMethod(name: "getFeatureFlag", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAllFeatureFlags", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "refreshFeatureFlags", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logFeatureFlagImpression", returnType: CAPPluginReturnPromise),

        // Content cards
        CAPPluginMethod(name: "getContentCards", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestContentCardsRefresh", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logContentCardClick", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logContentCardImpression", returnType: CAPPluginReturnPromise),

        // Push token registration
        CAPPluginMethod(name: "registerPushToken", returnType: CAPPluginReturnPromise),

        // Privacy / lifecycle
        CAPPluginMethod(name: "wipeData", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disableSDK", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enableSDK", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isDisabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestImmediateDataFlush", returnType: CAPPluginReturnPromise)
    ]

    // MARK: - Plugin state (main-actor isolated)

    /// Retained Braze instance after successful `initialize`. Static so push
    /// delegate hooks can reach it without plugin lookup. Nil before
    /// `initialize` is called or after `wipeData`.
    @MainActor public private(set) static var braze: Braze?

    /// Whether `initialize` was called with `enableSdkAuthentication: true`.
    /// When true, `changeUser` rejects calls that don't carry an
    /// `sdkAuthSignature` (see `SECURITY.md` §2). Persisted as plugin
    /// state because the underlying BrazeKit `Configuration` is not
    /// readable post-init.
    @MainActor private static var sdkAuthenticationEnabled: Bool = false

    /// The consumer's last explicit `disableSDK()` / `enableSDK()` intent.
    ///
    /// BrazeKit 18.x exposes SDK enablement only as `braze.enabled` on a
    /// configured instance — the class-level `Braze.disableSDK()` is a
    /// deprecated AppboyKit compatibility shim whose effect on an instance
    /// created afterwards is undocumented. Rather than rely on it, the
    /// plugin records the intent here and applies it to the instance as soon
    /// as `initialize` creates one. That makes `disableSDK` / `enableSDK` /
    /// `isDisabled` genuinely init-independent on iOS without depending on a
    /// deprecated symbol.
    @MainActor private static var disabledPreInit: Bool = false

    /// Retained handle for the persistent feature-flag update subscription
    /// created at `initialize` time. Held to keep the subscription alive
    /// (BrazeKit cancels when the handle is released) and released during
    /// `wipeData` so the post-wipe re-init starts from a clean slate.
    @MainActor private var featureFlagsSubscription: Braze.Cancellable?

    /// Mirror of `featureFlagsSubscription` for the content-cards update
    /// stream. Same lifetime: created in `initialize`, released in `wipeData`.
    @MainActor private var contentCardsSubscription: Braze.Cancellable?

    /// Retained reference to the in-app message UI presenter so we can
    /// keep its delegate (`iamDelegate`) alive — BrazeUI holds the
    /// delegate weakly, and the only other strong reference to the
    /// presenter is on `BrazeKit.Braze`, which itself is unowned.
    /// Released in `wipeData` alongside the other init artifacts.
    @MainActor private var inAppMessagePresenter: BrazeInAppMessageUI?

    /// Retained non-rendering presenter used when `initialize` ran with
    /// `enableInAppMessageUI: false`. Mutually exclusive with
    /// `inAppMessagePresenter`.
    @MainActor private var observingPresenter: BrazeObservingInAppMessagePresenter?

    /// Bridges `BrazeInAppMessageUIDelegate.displayChoiceForMessage` to
    /// the plugin's `inAppMessageReceived` listener. Retained at the
    /// plugin level because BrazeUI's `delegate` property is `weak`.
    @MainActor private var iamDelegate: BrazeIAMDelegate?

    /// Bridges `BrazeSDKAuthDelegate.sdkAuthenticationFailedWithError` to
    /// the plugin's `sdkAuthError` listener event. Retained at the plugin
    /// level because `braze.sdkAuthDelegate` is `weak`.
    @MainActor private var sdkAuthDelegate: BrazeSdkAuthDelegate?

    /// Bridges `BrazeDelegate.braze(_:shouldOpenURL:)` to the plugin's
    /// `deepLinkReceived` listener event. Non-nil **only** when `initialize`
    /// ran with `deepLinkHandling: "app"`; in the default `"sdk"` mode
    /// `braze.delegate` is left unassigned so a host app can take it.
    /// Retained at the plugin level because `braze.delegate` is `weak`.
    @MainActor private var deepLinkDelegate: BrazeDeepLinkDelegate?

    /// Diagnostics channel for the one advisory the bridge emits (the
    /// cluster-shape warning). BrazeKit exposes no public logger, and
    /// `SECURITY.md` §3 forbids logging consumer-supplied values, so the
    /// message never interpolates the endpoint.
    private static let logger = Logger(subsystem: "capacitor-braze", category: "initialize")

    /// Hops onto the main queue so the body runs in the plugin's single
    /// isolation domain. Always asynchronous — including when the caller is
    /// already on the main queue — so bodies execute in strict FIFO order
    /// regardless of which queue Capacitor dispatched them from.
    private static func onMain(_ body: @escaping @MainActor () -> Void) {
        DispatchQueue.main.async {
            MainActor.assumeIsolated {
                body()
            }
        }
    }

    // MARK: - Bridge sanity check

    /// Pure bridge probe — touches no plugin state and no SDK, so it answers
    /// on Capacitor's own queue without a main-actor hop.
    @objc func echo(_ call: CAPPluginCall) {
        guard let value = call.getString("value") else {
            call.reject("Braze.echo: `value` is required (string).")
            return
        }
        call.resolve(["value": value])
    }

    // MARK: - Configuration

    /// Validated, `Sendable` snapshot of the `initialize` options. Built on
    /// the main actor from the `CAPPluginCall` and handed to the wiring code
    /// so no `Braze.Configuration` is constructed before validation passes.
    private struct InitOptions {
        let apiKey: String
        let endpoint: String
        let enableLogging: Bool
        let enableSdkAuthentication: Bool
        let sessionTimeout: TimeInterval?
        let enableInAppMessageUI: Bool
        let enablePushAutomation: Bool
        /// `true` when `deepLinkHandling` was `"app"`. `allowUserSuppliedJavascript`
        /// has no counterpart here — it is web-only, see its JSDoc.
        let interceptDeepLinks: Bool
    }

    @objc func initialize(_ call: CAPPluginCall) {
        Self.onMain { [weak self] in
            guard let self = self else { return }
            guard let options = Self.validateInitOptions(call) else { return }
            self.performInitialize(options)
            call.resolve()
        }
    }

    /// Parses and validates the `initialize` payload. Rejects `call` and
    /// returns nil on the first failure, mirroring `src/web.ts`
    /// `validateInitializeOptions` field order and error strings byte for
    /// byte (C04).
    @MainActor
    private static func validateInitOptions(_ call: CAPPluginCall) -> InitOptions? {
        guard let apiKey = call.getString("apiKey"), !apiKey.isEmpty else {
            call.reject("Braze.initialize: `apiKey` is required (string).")
            return nil
        }
        guard let endpoint = call.getString("endpoint"), !endpoint.isEmpty else {
            call.reject("Braze.initialize: `endpoint` is required (string).")
            return nil
        }

        let allowInsecure = call.getBool("allowInsecureEndpoint", false)
        if endpoint.hasPrefix("http://") && !allowInsecure {
            call.reject("Braze.initialize: `endpoint` must use HTTPS. " +
                        "Set `allowInsecureEndpoint: true` only for local mock-server testing. " +
                        "See SECURITY.md §4.")
            return nil
        }
        // L5-03: URL parsing client-side. SECURITY.md §4 promises malformed
        // URLs reject before they reach the SDK; this delivers on that.
        // Bare-host shorthand (`sdk.us-01.braze.com` with no scheme) is
        // accepted by Braze's docs, so we prefix a dummy scheme before
        // parsing to preserve that ergonomic path.
        let parseTarget = endpoint.contains("://") ? endpoint : "https://\(endpoint)"
        guard URL(string: parseTarget) != nil else {
            call.reject("Braze.initialize: `endpoint` is malformed (must be a parseable URL or bare hostname).")
            return nil
        }
        warnIfNotBrazeCluster(parseTarget)

        var sessionTimeout: TimeInterval?
        // Absent, or explicit JSON null, keeps the SDK default (same as web's
        // `undefined`). Present-but-not-a-positive-integer is a hard reject —
        // `getInt` alone can't tell those apart, so read the raw value.
        if let raw = call.getValue("sessionTimeoutInSeconds"), !(raw is NSNull) {
            guard let seconds = integerValue(raw), seconds > 0 else {
                call.reject("Braze.initialize: `sessionTimeoutInSeconds` must be a positive integer.")
                return nil
            }
            // BrazeKit's sessionTimeout is a TimeInterval (seconds); the
            // plugin contract uses Int seconds for cross-platform parity
            // per C03, so we just cast.
            sessionTimeout = TimeInterval(seconds)
        }

        // Closed enum: an unrecognized mode rejects rather than falling back
        // to "sdk", so a consumer who typo'd "App" can't believe deep links
        // are gated when they aren't. The error names the value under C06
        // §4's closed-enum exemption, byte-identical to `src/web.ts`.
        let deepLinkHandling = call.getString("deepLinkHandling") ?? "sdk"
        guard deepLinkHandling == "sdk" || deepLinkHandling == "app" else {
            call.reject("Braze.initialize: unknown deepLinkHandling \"\(deepLinkHandling)\". Allowed: sdk, app.")
            return nil
        }

        return InitOptions(
            apiKey: apiKey,
            endpoint: endpoint,
            enableLogging: call.getBool("enableLogging", false),
            enableSdkAuthentication: call.getBool("enableSdkAuthentication", false),
            sessionTimeout: sessionTimeout,
            enableInAppMessageUI: call.getBool("enableInAppMessageUI", true),
            enablePushAutomation: call.getBool("enablePushAutomation", false),
            interceptDeepLinks: deepLinkHandling == "app"
        )
    }

    /// Cluster sanity check (advisory, never fatal). Matches the documented
    /// Braze cluster naming pattern and the local dev hosts the mock server
    /// uses; anything else gets one warning that describes the *shape* only —
    /// the endpoint value itself is never logged (SECURITY.md §3).
    @MainActor
    private static func warnIfNotBrazeCluster(_ parseTarget: String) {
        let host = URLComponents(string: parseTarget)?.host?.lowercased() ?? ""
        let isBrazeCluster = host.range(
            of: "^sdk\\.[a-z]+-\\d+\\.braze\\.(com|eu)$",
            options: .regularExpression
        ) != nil
        let isDevHost = host == "localhost"
            || host == "127.0.0.1"
            || host.hasSuffix(".test")
            || host.hasSuffix(".local")
        guard !isBrazeCluster && !isDevHost else { return }
        logger.warning(
            "Braze.initialize: `endpoint` host does not match the documented Braze cluster pattern sdk.<region>-NN.braze.com"
        )
    }

    /// Tears down any previous SDK artifacts, creates the `Braze` instance and
    /// wires subscriptions, presenter and delegates. Runs entirely on the main
    /// actor so a concurrent `wipeData` can only land before or after it,
    /// never inside it.
    @MainActor
    private func performInitialize(_ options: InitOptions) {
        let configuration = Braze.Configuration(apiKey: options.apiKey, endpoint: options.endpoint)
        // C06 / SECURITY.md §12: `enableLogging: false` means errors only.
        // `.info` is the second-most-verbose BrazeKit level, not "off".
        configuration.logger.level = options.enableLogging ? .debug : .error
        configuration.api.sdkAuthentication = options.enableSdkAuthentication
        // Identify the wrapper to Braze's backend. There is no Capacitor
        // `SDKFlavor` case, and reporting `.cordova` would be a
        // misattribution, so the plugin declares its distribution channels
        // through metadata only.
        configuration.api.addSDKMetadata([.npm, .cocoapods])
        if let sessionTimeout = options.sessionTimeout {
            configuration.sessionTimeout = sessionTimeout
        }
        if options.enablePushAutomation {
            // Opt-in: BrazeKit takes over push token registration, open /
            // deep-link handling, rich push and background push. Only touch
            // the notification center when automation is on — otherwise the
            // host app (or @capacitor/push-notifications) owns it.
            configuration.push.automation = true
            UNUserNotificationCenter.current().setNotificationCategories(Braze.Notifications.categories)
        }

        // Re-entrance: if initialize is called a second time without an
        // intervening wipeData, drop the previous subscriptions, presenter
        // and delegates BEFORE creating a new instance. Otherwise the
        // previous Cancellable would race the new one, fanning
        // notifyListeners() through two subscriptions tied to two different
        // SDK instances. Mirrors Android's teardown pattern.
        teardownSdkArtifacts()

        let braze = Braze(configuration: configuration)
        BrazePlugin.braze = braze
        BrazePlugin.sdkAuthenticationEnabled = options.enableSdkAuthentication
        // Apply a consent decision the consumer made before the SDK existed
        // (C07): `disableSDK()` pre-init records intent; this is where it
        // lands on a real instance.
        if BrazePlugin.disabledPreInit {
            braze.enabled = false
        }

        if options.enableInAppMessageUI {
            let presenter = BrazeInAppMessageUI()
            let iamDelegate = BrazeIAMDelegate()
            iamDelegate.plugin = self
            presenter.delegate = iamDelegate
            braze.inAppMessagePresenter = presenter
            self.inAppMessagePresenter = presenter
            self.iamDelegate = iamDelegate
        } else {
            // Still observational: the listener fires, nothing renders.
            let observer = BrazeObservingInAppMessagePresenter()
            observer.plugin = self
            braze.inAppMessagePresenter = observer
            self.observingPresenter = observer
        }

        // SDK Authentication failures arrive on `sdkAuthDelegate`, not
        // `delegate` — which carries shouldOpenURL /
        // willPresentModalWithContext / noMatchingTriggerForEvent and supplies
        // defaults for all three, so a misdirected conformance would compile
        // and never fire (A2-01).
        let authDelegate = BrazeSdkAuthDelegate()
        authDelegate.plugin = self
        braze.sdkAuthDelegate = authDelegate
        self.sdkAuthDelegate = authDelegate

        // `braze.delegate` is taken ONLY to suppress SDK-driven URL opening.
        // In the default `deepLinkHandling: "sdk"` mode the slot stays
        // unassigned so a host app can claim it (A2-08); opting into "app"
        // mode is the consumer explicitly trading that slot for deep-link
        // gating, which `SECURITY.md` §7 spells out.
        if options.interceptDeepLinks {
            let linkDelegate = BrazeDeepLinkDelegate()
            linkDelegate.plugin = self
            braze.delegate = linkDelegate
            self.deepLinkDelegate = linkDelegate
        }

        // Retaining the returned cancellables keeps the subscriptions alive;
        // releasing them (in `wipeData`) cancels at the SDK boundary so a
        // re-init starts clean.
        featureFlagsSubscription = braze.featureFlags.subscribeToUpdates { [weak self] flags in
            guard let self = self else { return }
            let payload: [[String: Any]] = flags.map { Self.serializeFeatureFlag($0) }
            self.notifyListeners("featureFlagsUpdated", data: ["flags": payload])
        }

        contentCardsSubscription = braze.contentCards.subscribeToUpdates { [weak self] cards in
            guard let self = self else { return }
            // Read lastUpdate off the static accessor rather than capturing
            // the local `braze` strongly: if wipeData dropped
            // BrazePlugin.braze between the SDK firing the closure and us
            // reading lastUpdate we want nil, not a stale value from a
            // now-disowned instance.
            let payload = Self.serializeContentCards(
                cards,
                lastUpdate: BrazePlugin.braze?.contentCards.lastUpdate
            )
            self.notifyListeners("contentCardsUpdated", data: payload)
        }
    }

    /// Drops every artifact `performInitialize` creates. Main-actor only, so
    /// it can never interleave with the wiring it undoes.
    @MainActor
    private func teardownSdkArtifacts() {
        featureFlagsSubscription = nil
        contentCardsSubscription = nil
        inAppMessagePresenter = nil
        observingPresenter = nil
        iamDelegate = nil
        sdkAuthDelegate = nil
        deepLinkDelegate = nil
        BrazePlugin.braze = nil
    }

    // MARK: - User identity

    @objc func changeUser(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            guard let userId = call.getString("userId"), !userId.isEmpty else {
                call.reject("Braze.changeUser: `userId` is required (string).")
                return
            }
            let sdkAuthSignature = call.getString("sdkAuthSignature")
            if BrazePlugin.sdkAuthenticationEnabled && (sdkAuthSignature?.isEmpty ?? true) {
                call.reject("Braze.changeUser: `sdkAuthSignature` is required (string) " +
                            "when SDK Authentication is enabled. See SECURITY.md §2.")
                return
            }
            braze.changeUser(userId: userId, sdkAuthSignature: sdkAuthSignature)
            call.resolve()
        }
    }

    /// Reads the external user id through BrazeKit's asynchronous accessor.
    ///
    /// As of BrazeKit 17.0 the synchronous `braze.user.id` property *blocks*
    /// until the SDK has settled, and Braze explicitly recommends the async
    /// getter for latency-sensitive paths — a Capacitor bridge call is one.
    /// The call resolves inside the completion, so JS still sees a single
    /// promise resolution. Returns nil for anonymous users (and, since 17.0,
    /// after `wipeData` — matching Android and Web); we surface that as
    /// JSON `null`.
    @objc func getUserId(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            braze.user.getId { userId in
                call.resolve(["userId": (userId as Any?) ?? NSNull()])
            }
        }
    }

    /// Pushes a new SDK Authentication signature into the configured
    /// Braze instance. Used to rotate the signature after expiry without
    /// running a fresh `changeUser` round-trip. No-op at the SDK level
    /// when `enableSdkAuthentication` was false at init time.
    @objc func setSdkAuthenticationSignature(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            guard let signature = call.getString("signature"), !signature.isEmpty else {
                call.reject("Braze.setSdkAuthenticationSignature: `signature` is required (string).")
                return
            }
            braze.set(sdkAuthenticationSignature: signature)
            call.resolve()
        }
    }

    // MARK: - User attributes (standard)
    //
    // Each setter retrieves the optional string from the call (nil clears the
    // attribute, matching native SDK semantics) and forwards to the matching
    // labeled `braze.user.set(...)` method.

    @objc func setEmail(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            braze.user.set(email: call.getString("email"))
            call.resolve()
        }
    }

    @objc func setPhoneNumber(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            braze.user.set(phoneNumber: call.getString("phoneNumber"))
            call.resolve()
        }
    }

    @objc func setFirstName(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            braze.user.set(firstName: call.getString("firstName"))
            call.resolve()
        }
    }

    @objc func setLastName(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            braze.user.set(lastName: call.getString("lastName"))
            call.resolve()
        }
    }

    @objc func setLanguage(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            braze.user.set(language: call.getString("language"))
            call.resolve()
        }
    }

    @objc func setCountry(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            braze.user.set(country: call.getString("country"))
            call.resolve()
        }
    }

    // MARK: - User attributes (custom)

    /// The four shapes `setCustomUserAttribute` can forward to BrazeKit.
    /// Factored out of the bridge method so the classification — the part
    /// that is easy to get wrong and impossible to reach through a
    /// `CAPPluginCall` in a unit test — is directly testable.
    enum CustomAttributeValue: Equatable {
        case boolean(Bool)
        case string(String)
        case integer(Int)
        case double(Double)
        case unsupported
    }

    /// Classifies a raw bridge value into the BrazeKit overload it belongs to.
    ///
    /// `CAPPluginCall.getBool` cannot be used here: `JSTypes.coerceToJSValue`
    /// keeps every JSON number as an `NSNumber`, and Swift's `NSNumber → Bool`
    /// conditional bridge is *value*-preserving rather than *type*-preserving,
    /// so `1` and `0` both succeed as `Bool`. Reading them as booleans would
    /// write `true` / `false` to the Braze profile for the two most common
    /// integer attribute values (order counts, tier levels, streaks) and lock
    /// the dashboard attribute to a boolean type — permanently, and only on
    /// iOS. `CFGetTypeID` separates `__NSCFBoolean` from `__NSCFNumber`
    /// exactly; `CFNumberIsFloatType` plus a lossless round-trip separates
    /// `42` from `42.5` so integers reach the Int overload the way Android's
    /// `org.json` type dispatch does.
    static func classifyAttributeValue(_ raw: Any?) -> CustomAttributeValue {
        guard let raw = raw, !(raw is NSNull) else { return .unsupported }
        if let number = raw as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() {
            return .boolean(number.boolValue)
        }
        if let string = raw as? String {
            return .string(string)
        }
        if let number = raw as? NSNumber {
            let double = number.doubleValue
            if CFNumberIsFloatType(number as CFNumber), Double(number.intValue) != double {
                return .double(double)
            }
            if let integer = raw as? Int {
                return .integer(integer)
            }
            return .double(double)
        }
        return .unsupported
    }

    @objc func setCustomUserAttribute(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            guard let key = call.getString("key"), !key.isEmpty else {
                call.reject("Braze.setCustomUserAttribute: `key` is required (string).")
                return
            }
            switch Self.classifyAttributeValue(call.getValue("value")) {
            case .boolean(let value):
                braze.user.setCustomAttribute(key: key, value: value)
            case .string(let value):
                braze.user.setCustomAttribute(key: key, value: value)
            case .integer(let value):
                braze.user.setCustomAttribute(key: key, value: value)
            case .double(let value):
                braze.user.setCustomAttribute(key: key, value: value)
            case .unsupported:
                call.reject("Braze.setCustomUserAttribute: `value` must be string, number, or boolean.")
                return
            }
            call.resolve()
        }
    }

    // MARK: - Subscription groups

    @objc func addToSubscriptionGroup(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            guard let groupId = call.getString("groupId"), !groupId.isEmpty else {
                call.reject("Braze.addToSubscriptionGroup: `groupId` is required (string).")
                return
            }
            braze.user.addToSubscriptionGroup(id: groupId)
            call.resolve()
        }
    }

    @objc func removeFromSubscriptionGroup(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            guard let groupId = call.getString("groupId"), !groupId.isEmpty else {
                call.reject("Braze.removeFromSubscriptionGroup: `groupId` is required (string).")
                return
            }
            braze.user.removeFromSubscriptionGroup(id: groupId)
            call.resolve()
        }
    }

    // MARK: - Aliases

    @objc func addAlias(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            guard let alias = call.getString("alias"), !alias.isEmpty else {
                call.reject("Braze.addAlias: `alias` is required (string).")
                return
            }
            guard let label = call.getString("label"), !label.isEmpty else {
                call.reject("Braze.addAlias: `label` is required (string).")
                return
            }
            braze.user.add(alias: alias, label: label)
            call.resolve()
        }
    }

    // MARK: - Device ID

    /// Reads the Braze device id through the asynchronous accessor added in
    /// BrazeKit 17.0. The synchronous `braze.deviceId` property blocks until
    /// the SDK has settled; a bridge call should not.
    @objc func getDeviceId(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            braze.getDeviceId { deviceId in
                call.resolve(["deviceId": deviceId])
            }
        }
    }

    // MARK: - Demographics

    /// Constructs a `Date` from `(year, month, day)` using a Gregorian
    /// calendar pinned to UTC. Pinning to UTC keeps the stored DOB stable
    /// regardless of device timezone, matching how the Android `Month` enum
    /// and the Web SDK's three-int signature behave. `month` is 1-indexed
    /// on the wire (C03).
    @objc func setDateOfBirth(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            // Per-field error messages, byte-identical to the web bridge.
            // Order matters — year is validated first so a missing year
            // reports as the year error rather than a generic message.
            guard let year = call.getInt("year"), year >= 1900, year <= 2100 else {
                call.reject("Braze.setDateOfBirth: `year` must be an integer between 1900 and 2100.")
                return
            }
            guard let month = call.getInt("month"), month >= 1, month <= 12 else {
                call.reject("Braze.setDateOfBirth: `month` must be an integer between 1 and 12.")
                return
            }
            guard let day = call.getInt("day"), day >= 1, day <= 31 else {
                call.reject("Braze.setDateOfBirth: `day` must be an integer between 1 and 31.")
                return
            }

            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
            var components = DateComponents()
            components.year = year
            components.month = month
            components.day = day
            guard let date = calendar.date(from: components) else {
                call.reject("Braze.setDateOfBirth: invalid date components.")
                return
            }
            braze.user.set(dateOfBirth: date)
            call.resolve()
        }
    }

    /// Maps the plugin's stable string gender values to `Braze.User.Gender`
    /// cases. Keeping the mapping at the bridge layer means consumers never
    /// see the SDK's enum names directly.
    @objc func setGender(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            guard let raw = call.getString("gender"), !raw.isEmpty else {
                call.reject("Braze.setGender: `gender` is required (string).")
                return
            }
            let gender: Braze.User.Gender
            switch raw {
            case "male": gender = .male
            case "female": gender = .female
            case "other": gender = .other
            case "unknown": gender = .unknown
            case "not_applicable": gender = .notApplicable
            case "prefer_not_to_say": gender = .preferNotToSay
            default:
                call.reject("Braze.setGender: unknown gender \"\(raw)\". " +
                            "Allowed: male, female, other, unknown, not_applicable, prefer_not_to_say.")
                return
            }
            braze.user.set(gender: gender)
            call.resolve()
        }
    }

    @objc func setHomeCity(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            braze.user.set(homeCity: call.getString("homeCity"))
            call.resolve()
        }
    }

    // MARK: - Custom events

    @objc func logCustomEvent(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            guard let name = call.getString("name"), !name.isEmpty else {
                call.reject("Braze.logCustomEvent: `name` is required (string).")
                return
            }
            let properties: [String: Any]? = call.getObject("properties")
            if let error = Self.propertiesError(properties, method: "logCustomEvent") {
                call.reject(error)
                return
            }
            braze.logCustomEvent(name: name, properties: properties)
            call.resolve()
        }
    }

    // MARK: - Purchases

    /// Validates the purchase shape, then forwards to
    /// `braze.logPurchase(productId:currency:price:quantity:properties:)`.
    /// Quantity defaults to 1 to match the SDK default; price is a Double
    /// matching the Swift SDK API.
    @objc func logPurchase(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            guard let productId = call.getString("productId"), !productId.isEmpty else {
                call.reject("Braze.logPurchase: `productId` is required (string).")
                return
            }
            guard let currency = call.getString("currency"), !currency.isEmpty else {
                call.reject("Braze.logPurchase: `currency` is required (ISO 4217 string).")
                return
            }
            guard let price = call.getDouble("price"), price.isFinite, price >= 0 else {
                call.reject("Braze.logPurchase: `price` must be a non-negative finite number.")
                return
            }
            var quantity = 1
            // Absent / JSON null keeps the default; present-but-malformed is a
            // reject, not a silent coercion to 1.
            if let raw = call.getValue("quantity"), !(raw is NSNull) {
                guard let parsed = Self.integerValue(raw), parsed >= 1, parsed <= 100 else {
                    call.reject("Braze.logPurchase: `quantity` must be an integer between 1 and 100.")
                    return
                }
                quantity = parsed
            }
            let properties: [String: Any]? = call.getObject("properties")
            if let error = Self.propertiesError(properties, method: "logPurchase") {
                call.reject(error)
                return
            }
            braze.logPurchase(
                productId: productId,
                currency: currency,
                price: price,
                quantity: quantity,
                properties: properties
            )
            call.resolve()
        }
    }

    // MARK: - Feature flags
    //
    // The plugin's portable `BrazeFeatureFlag` DTO matches the Web SDK
    // wire format `{ id, enabled, properties: { key: { type, value } } }`.
    // `serializeFeatureFlag` adapts BrazeKit's typed property accessors
    // into the same shape.

    @objc func getFeatureFlag(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            guard let id = call.getString("id"), !id.isEmpty else {
                call.reject("Braze.getFeatureFlag: `id` is required (string).")
                return
            }
            if let raw = braze.featureFlags.featureFlag(id: id) {
                call.resolve(["flag": Self.serializeFeatureFlag(raw)])
            } else {
                call.resolve(["flag": NSNull()])
            }
        }
    }

    @objc func getAllFeatureFlags(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            let flags = braze.featureFlags.featureFlags.map { Self.serializeFeatureFlag($0) }
            call.resolve(["flags": flags])
        }
    }

    @objc func refreshFeatureFlags(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            // requestRefresh accepts an optional completion handler; we ignore
            // the result here (fire-and-forget). Consumers needing completion
            // semantics use the `featureFlagsUpdated` listener.
            braze.featureFlags.requestRefresh()
            call.resolve()
        }
    }

    @objc func logFeatureFlagImpression(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            guard let id = call.getString("id"), !id.isEmpty else {
                call.reject("Braze.logFeatureFlagImpression: `id` is required (string).")
                return
            }
            braze.featureFlags.logFeatureFlagImpression(id: id)
            call.resolve()
        }
    }

    /// Serializes a `Braze.FeatureFlag` to the C02 tagged-union wire
    /// format. Each property entry is `{ "type": "<one-of>", "value": <native> }`
    /// where `<one-of>` is one of the six tags declared by
    /// `BrazeFeatureFlagPropertyValue` in `src/definitions.ts`:
    ///
    ///     string | number | boolean | image | datetime | jsonobject
    ///
    /// Implementation: enumerate `flag.properties.keys` and probe the typed
    /// accessors in priority order. BrazeKit's accessors return nil unless
    /// the underlying property is of the requested type, so the first
    /// non-nil hit names the type. Image is checked before string and
    /// timestamp before number because both tagged types are stored on top
    /// of the looser type under the hood.
    ///
    /// `timestampProperty(key:)` already returns Unix **milliseconds**
    /// (Braze CHANGELOG, 14.x), so it passes through untouched.
    private static func serializeFeatureFlag(_ flag: Braze.FeatureFlag) -> [String: Any] {
        var properties: [String: Any] = [:]
        for key in flag.properties.keys {
            if let value = flag.imageProperty(key: key) {
                properties[key] = ["type": "image", "value": value]
            } else if let value = flag.stringProperty(key: key) {
                properties[key] = ["type": "string", "value": value]
            } else if let value = flag.timestampProperty(key: key) {
                properties[key] = ["type": "datetime", "value": value]
            } else if let value = flag.boolProperty(key: key) {
                properties[key] = ["type": "boolean", "value": value]
            } else if let value = flag.numberProperty(key: key) {
                properties[key] = ["type": "number", "value": value]
            } else if let value = flag.jsonProperty(key: key) {
                properties[key] = ["type": "jsonobject", "value": value]
            } else {
                // A property type none of the six accessors claims. The union
                // is closed at six tags, so emit nothing for this key — but
                // say so, rather than dropping SDK data in silence.
                logger.warning("Braze: dropped a feature-flag property of an unrecognized type")
            }
        }
        return [
            "id": flag.id,
            "enabled": flag.enabled,
            "properties": properties
        ]
    }

    // MARK: - Content cards
    //
    // Click + impression logging is NOT on the `ContentCards` manager but on
    // the individual cards themselves: `card.logClick(using:)` and
    // `card.logImpression(using:)`. We resolve cardId → card via the cached
    // list before forwarding.

    @objc func getContentCards(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            call.resolve(Self.serializeContentCards(
                braze.contentCards.cards,
                lastUpdate: braze.contentCards.lastUpdate
            ))
        }
    }

    @objc func requestContentCardsRefresh(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            braze.contentCards.requestRefresh()
            call.resolve()
        }
    }

    @objc func logContentCardClick(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            guard let cardId = call.getString("cardId"), !cardId.isEmpty else {
                call.reject("Braze.logContentCardClick: `cardId` is required (string).")
                return
            }
            guard let card = Self.findCard(by: cardId, in: braze) else {
                call.reject("Braze.logContentCardClick: no cached content card with id \"\(cardId)\". " +
                            "Call getContentCards() to verify the id, or wait for the next refresh.")
                return
            }
            card.logClick(using: braze)
            call.resolve()
        }
    }

    @objc func logContentCardImpression(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            guard let cardId = call.getString("cardId"), !cardId.isEmpty else {
                call.reject("Braze.logContentCardImpression: `cardId` is required (string).")
                return
            }
            guard let card = Self.findCard(by: cardId, in: braze) else {
                call.reject("Braze.logContentCardImpression: no cached content card with id \"\(cardId)\". " +
                            "Call getContentCards() to verify the id, or wait for the next refresh.")
                return
            }
            card.logImpression(using: braze)
            call.resolve()
        }
    }

    /// Looks up a cached content card by id. Returns nil if no match.
    @MainActor
    private static func findCard(by cardId: String, in braze: Braze) -> Braze.ContentCard? {
        return braze.contentCards.cards.first(where: { $0.data.id == cardId })
    }

    /// Builds the `BrazeGetContentCardsResult` wire shape from BrazeKit's
    /// card array + `ContentCards.lastUpdate`. lastUpdate is the SDK's
    /// authoritative "freshness" timestamp — we don't derive it from
    /// individual cards.
    private static func serializeContentCards(
        _ cards: [Braze.ContentCard],
        lastUpdate: Date?
    ) -> [String: Any] {
        let serialized: [[String: Any]] = cards.compactMap { Self.serializeContentCard($0) }
        let lastUpdated: Any = lastUpdate.map { Int($0.timeIntervalSince1970 * 1000) } ?? NSNull()
        return [
            "cards": serialized,
            "lastUpdated": lastUpdated
        ]
    }

    /// Serializes a `Braze.ContentCard` enum case to the plugin's portable
    /// DTO. Pattern-matches the enum case to populate the C02 `type`
    /// discriminator and the variant-specific fields.
    ///
    /// Field mapping vs the TS contract:
    ///   - `linkText`     ← BrazeKit `card.domain`
    ///   - `url`          ← `data.clickAction.url?.absoluteString`
    ///   - `imageUrl`     ← `card.image.absoluteString` (image variants)
    ///   - `aspectRatio`  ← `card.imageAspectRatio`, `null` on the variants
    ///                      BrazeKit gives no aspect ratio (classic and
    ///                      classic-with-image); always present so the
    ///                      contract's `number | null` holds on every card
    ///   - `altImageText` ← `card.imageAltText`
    ///   - `updated`      ← `data.createdAt` as epoch ms (BrazeKit tracks no
    ///                      separate "last modified" timestamp)
    ///   - `expiresAt`    ← `data.expiresAt` as epoch ms, with the SDK's
    ///                      -1 "never expires" sentinel surfacing as null
    ///
    /// Returns nil for a card variant this BrazeKit version introduced and the
    /// contract has no tag for; `serializeContentCards` drops those rather
    /// than emitting a card with no `type` discriminator.
    ///
    /// `internal` rather than `private` so the XCTest tier can drive it
    /// against real `Braze.ContentCard` values and assert the exact DTO
    /// (C11) — the same reason Android's serializers are `internal`. It is
    /// not part of the Capacitor surface: only `@objc` methods registered in
    /// `BrazePlugin.m` are callable from JS.
    static func serializeContentCard(_ card: Braze.ContentCard) -> [String: Any]? {
        let data = card.data
        var dto: [String: Any] = [
            "id": data.id,
            "viewed": data.viewed,
            "pinned": data.pinned,
            "extras": BrazeExtras.coerce(data.extras),
            "updated": Self.epochMillis(fromSeconds: data.createdAt),
            "expiresAt": Self.epochMillis(fromSeconds: data.expiresAt)
        ]
        let clickUrl: Any = data.clickAction?.url?.absoluteString ?? NSNull()
        var nonControl: [String: Any] = [
            "clicked": data.clicked,
            "dismissed": data.removed,
            "dismissible": data.dismissible
        ]
        // A2-15 item 2: `Braze.ContentCard.ClickAction` at BrazeKit 18.2.1 has
        // exactly one case, `.url(URL, useWebView: Bool)`, so the hint is
        // available on every card that has a click action at all. It used to
        // be dropped here while the in-app-message contract carried the same
        // field — an arbitrary asymmetry. The key is omitted (not emitted as
        // null) on a card with no click action, matching the contract's
        // optional `useWebView?: boolean`.
        if case .url(_, let useWebView) = data.clickAction {
            nonControl["useWebView"] = useWebView
        }
        switch card {
        case .control:
            dto["type"] = "control"
        case .classic(let c):
            dto["type"] = "classic"
            dto["title"] = c.title
            dto["description"] = c.description
            dto["url"] = clickUrl
            dto["linkText"] = c.domain ?? NSNull()
            dto["language"] = c.language ?? NSNull()
            // BrazeKit's Classic carries no image and therefore no aspect
            // ratio; the contract still declares the field.
            dto["aspectRatio"] = NSNull()
            dto.merge(nonControl) { _, new in new }
        case .classicImage(let c):
            // BrazeKit ClassicImage → contract 'classic' with optional imageUrl.
            dto["type"] = "classic"
            dto["title"] = c.title
            dto["description"] = c.description
            dto["imageUrl"] = c.image.absoluteString
            dto["url"] = clickUrl
            dto["linkText"] = c.domain ?? NSNull()
            dto["language"] = c.language ?? NSNull()
            dto["altImageText"] = c.imageAltText ?? NSNull()
            // BrazeKit.ContentCard.ClassicImage has no `imageAspectRatio`
            // (verified against the 18.2.1 swiftinterface).
            dto["aspectRatio"] = NSNull()
            dto.merge(nonControl) { _, new in new }
        case .imageOnly(let c):
            dto["type"] = "imageOnly"
            dto["imageUrl"] = c.image.absoluteString
            dto["url"] = clickUrl
            dto["aspectRatio"] = c.imageAspectRatio ?? NSNull()
            dto["language"] = c.language ?? NSNull()
            dto["altImageText"] = c.imageAltText ?? NSNull()
            dto.merge(nonControl) { _, new in new }
        case .captionedImage(let c):
            dto["type"] = "captionedImage"
            dto["title"] = c.title
            dto["description"] = c.description
            dto["imageUrl"] = c.image.absoluteString
            dto["url"] = clickUrl
            dto["linkText"] = c.domain ?? NSNull()
            dto["aspectRatio"] = c.imageAspectRatio ?? NSNull()
            dto["language"] = c.language ?? NSNull()
            dto["altImageText"] = c.imageAltText ?? NSNull()
            dto.merge(nonControl) { _, new in new }
        @unknown default:
            logger.warning("Braze: dropped an unrecognized content card variant")
            return nil
        }
        return dto
    }

    /// Converts a `Foundation.TimeInterval` (epoch seconds) to epoch
    /// milliseconds as the wire format expects.
    ///
    /// Non-positive inputs map to JSON `null`: `Braze.ContentCard.Data`
    /// defaults `createdAt` to `0` and uses `-1` for "never expires", so both
    /// sentinels mean "the SDK has no value here". A card genuinely created
    /// at the Unix epoch would also report null — an accepted, harmless
    /// collision.
    private static func epochMillis(fromSeconds seconds: TimeInterval) -> Any {
        guard seconds > 0 else { return NSNull() }
        return Int(seconds * 1000)
    }

    // MARK: - Push token registration
    //
    // Consumer flow (when `enablePushAutomation` is left off):
    //   1. @capacitor/push-notifications calls UNUserNotificationCenter
    //      and fires its `registration` event with the APNs device
    //      token as a hex string.
    //   2. Consumer forwards the hex string to us.
    //   3. We hex-decode to Data and hand to BrazeKit's
    //      notifications.register(deviceToken:) entry point.
    //
    // Hex decoding is done here rather than asking the consumer to
    // pre-decode because @capacitor/push-notifications emits the hex
    // form; pre-decoding would force the consumer to write a helper
    // every time.

    @objc func registerPushToken(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            guard let token = call.getString("token"), !token.isEmpty else {
                call.reject("Braze.registerPushToken: `token` is required (string).")
                return
            }
            guard let tokenData = Self.dataFromHex(token) else {
                call.reject("Braze.registerPushToken: `token` must be a valid hex string.")
                return
            }
            braze.notifications.register(deviceToken: tokenData)
            call.resolve()
        }
    }

    /// Hex-string → Data. Returns nil for malformed input.
    ///
    /// All whitespace (including tabs and a trailing newline from a paste)
    /// and the `Data` debug-print wrapper characters `<`/`>` are stripped, so
    /// both the raw hex and `String(describing: data)` are accepted. What is
    /// *not* accepted: anything that decodes to zero bytes — `"<>"` and
    /// `"   "` survive the non-empty check on the original string, reduce to
    /// `""` and would otherwise register an empty APNs token, which is a
    /// silent push outage. APNs tokens are 32 bytes (64 hex chars) today and
    /// 100 bytes at most, so an upper bound catches paste errors too.
    static func dataFromHex(_ hex: String) -> Data? {
        let cleaned = hex
            .components(separatedBy: .whitespacesAndNewlines).joined()
            .replacingOccurrences(of: "<", with: "")
            .replacingOccurrences(of: ">", with: "")
        guard !cleaned.isEmpty, cleaned.count % 2 == 0, cleaned.count <= 200 else { return nil }
        var data = Data(capacity: cleaned.count / 2)
        var index = cleaned.startIndex
        while index < cleaned.endIndex {
            let nextIndex = cleaned.index(index, offsetBy: 2)
            guard let byte = UInt8(cleaned[index..<nextIndex], radix: 16) else { return nil }
            data.append(byte)
            index = nextIndex
        }
        return data
    }

    // MARK: - Privacy / lifecycle
    //
    // BrazeKit 18.x models SDK enablement as `braze.enabled` on a configured
    // instance. The class-level `Braze.disableSDK()` still exists but is a
    // deprecated AppboyKit compatibility shim, and `Braze(configuration:)` —
    // the path this plugin uses — is documented to disable most compatibility
    // features, so its effect on a later instance is not established.
    //
    // The plugin therefore keeps the contract's init-independence by recording
    // intent (`disabledPreInit`) and applying it at `initialize`. The one
    // remaining class-level call is the pre-init `wipeData` path, where
    // BrazeKit offers no non-deprecated equivalent.

    @objc func wipeData(_ call: CAPPluginCall) {
        Self.onMain { [weak self] in
            if let braze = BrazePlugin.braze {
                // Post-init: wipe via the instance method.
                braze.wipeData()
            } else {
                // Pre-init: the only class-level wipe BrazeKit exposes. It
                // also disables the SDK for the remainder of this app run —
                // a subsequent `initialize` no-ops until relaunch. That is a
                // BrazeKit constraint, documented in the `wipeData` JSDoc and
                // C07, and it matches the consent-revocation flow this method
                // exists for (SECURITY.md §10). The deprecation warning this
                // emits is accepted deliberately: there is no replacement
                // that works without a configured instance.
                Braze.wipeDataAndDisableForAppRun()
            }
            self?.teardownSdkArtifacts()
            BrazePlugin.sdkAuthenticationEnabled = false
            call.resolve()
        }
    }

    @objc func disableSDK(_ call: CAPPluginCall) {
        Self.onMain {
            BrazePlugin.disabledPreInit = true
            BrazePlugin.braze?.enabled = false
            call.resolve()
        }
    }

    @objc func enableSDK(_ call: CAPPluginCall) {
        Self.onMain {
            BrazePlugin.disabledPreInit = false
            BrazePlugin.braze?.enabled = true
            call.resolve()
        }
    }

    @objc func isDisabled(_ call: CAPPluginCall) {
        Self.onMain {
            // Post-init the instance is authoritative. Pre-init we report the
            // recorded intent, so a consent gate that calls `disableSDK()`
            // before `initialize` and then reads this back gets `true`.
            let disabled = BrazePlugin.braze.map { !$0.enabled } ?? BrazePlugin.disabledPreInit
            call.resolve(["disabled": disabled])
        }
    }

    @objc func requestImmediateDataFlush(_ call: CAPPluginCall) {
        Self.onMain {
            guard let braze = Self.requireInitialized(call) else { return }
            braze.requestImmediateDataFlush()
            call.resolve()
        }
    }

    // MARK: - Helpers

    /// Asserts that the Braze instance is configured. If not, rejects the call
    /// with a clear error and returns nil.
    ///
    /// Use in any bridge method that needs the live `Braze` instance — i.e.
    /// methods that mutate user state or queue events. Init-independent
    /// methods (the C07 privacy/lifecycle quartet) bypass this helper.
    @MainActor
    private static func requireInitialized(_ call: CAPPluginCall) -> Braze? {
        guard let braze = braze else {
            call.reject("Braze.initialize() must be called before any other Braze method.")
            return nil
        }
        return braze
    }

    /// Reads a bridge value as an integer, rejecting values that merely
    /// *convert*. `NSNumber(42.5) as? Int` is already nil, but a JSON boolean
    /// bridges to `Int` as 0/1, so booleans are excluded explicitly.
    static func integerValue(_ raw: Any) -> Int? {
        guard let number = raw as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return nil }
        return raw as? Int
    }

    /// Validates an event / purchase property bag: Braze property values must
    /// be JSON scalars. Returns the C04 error string for the first offending
    /// key (keys are walked in sorted order so the message is deterministic),
    /// or nil when every value is acceptable.
    static func propertiesError(_ properties: [String: Any]?, method: String) -> String? {
        guard let properties = properties else { return nil }
        for key in properties.keys.sorted() {
            let value = properties[key]
            if value is String || value is NSNumber { continue }
            return "Braze.\(method): `properties.\(key)` must be string, number, or boolean."
        }
        return nil
    }
}
