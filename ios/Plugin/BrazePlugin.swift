import Capacitor
import Foundation

/// Capacitor bridge for the Braze iOS SDK.
///
/// Scaffold release (0.0.1): `echo` is fully wired; `initialize` validates
/// options and stores config. Actual `BrazeKit` initialization lands in 0.0.2.
///
/// See PLAN.md and SECURITY.md for design decisions.
@objc(BrazePlugin)
public class BrazePlugin: CAPPlugin {

    private var storedConfig: BrazeStoredConfig?

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

        self.storedConfig = BrazeStoredConfig(
            apiKey: apiKey,
            endpoint: endpoint,
            enableLogging: enableLogging,
            enableSdkAuthentication: enableSdkAuthentication
        )

        // 0.0.2 will instantiate `Braze` here:
        //   let configuration = Braze.Configuration(apiKey: apiKey, endpoint: endpoint)
        //   configuration.logger.level = enableLogging ? .debug : .error
        //   configuration.api.sdkAuthentication = enableSdkAuthentication
        //   let braze = Braze(configuration: configuration)
        //   AppDelegate.braze = braze

        call.resolve()
    }
}

private struct BrazeStoredConfig {
    let apiKey: String
    let endpoint: String
    let enableLogging: Bool
    let enableSdkAuthentication: Bool
}
