import BrazeKit
import Capacitor
import Foundation

/// Capacitor bridge for the Braze iOS SDK (BrazeKit 14.1.0).
///
/// Surface in 0.0.3:
/// - `echo(value)` — bridge sanity check
/// - `initialize(...)` — constructs `Braze.Configuration`, instantiates `Braze`,
///   retains as `BrazePlugin.braze` static
/// - `changeUser(userId, sdkAuthSignature?)` — identifies the current user
/// - `logCustomEvent(name, properties?)` — logs a custom event
///
/// See PLAN.md, SDK_SURFACE.md, and SECURITY.md for design context.
@objc(BrazePlugin)
public class BrazePlugin: CAPPlugin {

    /// Retained Braze instance after successful `initialize`. Static so push
    /// delegate hooks (added in later versions) can reach it without plugin lookup.
    /// Nil before `initialize` is called.
    public private(set) static var braze: Braze?

    // MARK: - Bridge methods

    @objc func echo(_ call: CAPPluginCall) {
        guard let value = call.getString("value") else {
            call.reject("Braze.echo: `value` is required (string).")
            return
        }
        call.resolve(["value": value])
    }

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

    // MARK: - Helpers

    private static func requireInitialized(_ call: CAPPluginCall) -> Braze? {
        guard let braze = braze else {
            call.reject("Braze.initialize() must be called before any other Braze method.")
            return nil
        }
        return braze
    }
}
