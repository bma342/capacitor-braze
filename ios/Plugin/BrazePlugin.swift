import BrazeKit
import Capacitor
import Foundation

/// Capacitor bridge for the Braze iOS SDK (BrazeKit 14.1.0).
///
/// ## Surface in 0.0.4
///
/// - **Bridge sanity:** `echo(value)`
/// - **Configuration:** `initialize(apiKey, endpoint, ...)`
/// - **User identity:** `changeUser(userId, sdkAuthSignature?)`
/// - **Custom events:** `logCustomEvent(name, properties?)`
/// - **Privacy/lifecycle:** `wipeData`, `disableSDK`, `enableSDK`, `isDisabled`,
///   `requestImmediateDataFlush`
///
/// ## Design notes
///
/// The configured `Braze` instance is retained as a `static` property
/// (`BrazePlugin.braze`) following Braze's own `AppDelegate.braze` convention
/// from their docs. The static accessor lets future push delegate hooks and
/// other plugin extensions reach the instance without re-initialization.
///
/// Privacy methods (`wipeData`, `disableSDK`, `enableSDK`, `isDisabled`) are
/// **init-independent** — they call class-level static methods on `Braze` and
/// work even before `initialize` has been called. This matches the semantics
/// of GDPR/CCPA consent flows where the SDK may need to be disabled before any
/// user data is sent.
///
/// See PLAN.md, SDK_SURFACE.md, and SECURITY.md for design context.
@objc(BrazePlugin)
public class BrazePlugin: CAPPlugin {

    /// Retained Braze instance after successful `initialize`. Static so push
    /// delegate hooks (added in later versions) can reach it without plugin lookup.
    /// Nil before `initialize` is called or after `wipeData`.
    public private(set) static var braze: Braze?

    // MARK: - Bridge sanity check

    @objc func echo(_ call: CAPPluginCall) {
        guard let value = call.getString("value") else {
            call.reject("Braze.echo: `value` is required (string).")
            return
        }
        call.resolve(["value": value])
    }

    // MARK: - Configuration

    @objc func initialize(_ call: CAPPluginCall) {
        guard let apiKey = call.getString("apiKey"), !apiKey.isEmpty else {
            call.reject("Braze.initialize: `apiKey` is required (string).")
            return
        }
        guard let endpoint = call.getString("endpoint"), !endpoint.isEmpty else {
            call.reject("Braze.initialize: `endpoint` is required (string).")
            return
        }

        let allowInsecure = call.getBool("allowInsecureEndpoint", false)
        if endpoint.hasPrefix("http://") && !allowInsecure {
            call.reject("Braze.initialize: `endpoint` must use HTTPS. " +
                        "Set `allowInsecureEndpoint: true` only for local mock-server testing.")
            return
        }

        let enableLogging = call.getBool("enableLogging", false)
        let enableSdkAuthentication = call.getBool("enableSdkAuthentication", false)

        let configuration = Braze.Configuration(apiKey: apiKey, endpoint: endpoint)
        configuration.logger.level = enableLogging ? .debug : .info
        configuration.api.sdkAuthentication = enableSdkAuthentication

        let braze = Braze(configuration: configuration)
        BrazePlugin.braze = braze

        call.resolve()
    }

    // MARK: - User identity

    @objc func changeUser(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        guard let userId = call.getString("userId"), !userId.isEmpty else {
            call.reject("Braze.changeUser: `userId` is required (string).")
            return
        }
        let sdkAuthSignature = call.getString("sdkAuthSignature")
        braze.changeUser(userId: userId, sdkAuthSignature: sdkAuthSignature)
        call.resolve()
    }

    // MARK: - Custom events

    @objc func logCustomEvent(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        guard let name = call.getString("name"), !name.isEmpty else {
            call.reject("Braze.logCustomEvent: `name` is required (string).")
            return
        }
        let properties = call.getObject("properties") as? [String: Any]
        braze.logCustomEvent(name: name, properties: properties)
        call.resolve()
    }

    // MARK: - Privacy / lifecycle
    //
    // All four are init-independent. They invoke class-level static methods on
    // `Braze` and operate on the SDK's global state regardless of whether a
    // configured `Braze` instance exists.

    @objc func wipeData(_ call: CAPPluginCall) {
        Braze.wipeData()
        // Per Braze docs, `wipeData` invalidates the current SDK instance.
        // Drop our reference so subsequent `requireInitialized` calls fail
        // until `initialize` is called again.
        BrazePlugin.braze = nil
        call.resolve()
    }

    @objc func disableSDK(_ call: CAPPluginCall) {
        Braze.disableSDK()
        call.resolve()
    }

    @objc func enableSDK(_ call: CAPPluginCall) {
        Braze.enableSDK()
        call.resolve()
    }

    @objc func isDisabled(_ call: CAPPluginCall) {
        call.resolve(["disabled": Braze.isDisabled])
    }

    @objc func requestImmediateDataFlush(_ call: CAPPluginCall) {
        guard let braze = Self.requireInitialized(call) else { return }
        braze.requestImmediateDataFlush()
        call.resolve()
    }

    // MARK: - Helpers

    /// Asserts that the Braze instance is configured. If not, rejects the call
    /// with a clear error and returns nil.
    ///
    /// Use in any bridge method that needs the live `Braze` instance — i.e.
    /// methods that mutate user state or queue events. Init-independent methods
    /// (privacy/lifecycle statics) bypass this helper.
    private static func requireInitialized(_ call: CAPPluginCall) -> Braze? {
        guard let braze = braze else {
            call.reject("Braze.initialize() must be called before any other Braze method.")
            return nil
        }
        return braze
    }
}
