import BrazeKit
import Capacitor
import Foundation

/// Capacitor bridge for the Braze iOS SDK (BrazeKit 14.1.0).
///
/// Surface in 0.0.2:
/// - `echo(value)` — bridge sanity check
/// - `initialize(apiKey, endpoint, enableLogging?, enableSdkAuthentication?, allowInsecureEndpoint?)`
///   — constructs `Braze.Configuration`, validates inputs, instantiates the
///   `Braze` singleton and retains it as a static for use by future plugin
///   methods (`changeUser`, `logCustomEvent`, etc. land in 0.1.0).
///
/// Pattern follows Braze's own `AppDelegate.braze` convention from their docs;
/// the static accessor lets push delegate hooks and other Capacitor plugins
/// reach the configured Braze instance without re-initialization.
///
/// See PLAN.md, SDK_SURFACE.md, and SECURITY.md for design context.
@objc(BrazePlugin)
public class BrazePlugin: CAPPlugin {

    /// Retained Braze instance after successful `initialize`. Static so push
    /// delegate hooks (added in 0.1.0+) can reach it without plugin lookup.
    /// Nil before `initialize` is called.
    public private(set) static var braze: Braze?

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
}
