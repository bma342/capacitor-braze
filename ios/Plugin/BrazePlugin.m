#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Capacitor plugin registration macro. Each CAP_PLUGIN_METHOD entry maps a
// Swift `@objc` method on `BrazePlugin` to a JavaScript-callable plugin
// method exposed under the plugin name "Braze".
//
// Keep this list ordered by category to match BrazePlugin.swift:
//   Bridge sanity → Configuration → User identity → Custom events → Privacy/lifecycle
CAP_PLUGIN(BrazePlugin, "Braze",
    // Bridge sanity
    CAP_PLUGIN_METHOD(echo, CAPPluginReturnPromise);

    // Configuration
    CAP_PLUGIN_METHOD(initialize, CAPPluginReturnPromise);

    // User identity
    CAP_PLUGIN_METHOD(changeUser, CAPPluginReturnPromise);

    // Custom events
    CAP_PLUGIN_METHOD(logCustomEvent, CAPPluginReturnPromise);

    // Privacy / lifecycle
    CAP_PLUGIN_METHOD(wipeData, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(disableSDK, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(enableSDK, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(isDisabled, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(requestImmediateDataFlush, CAPPluginReturnPromise);
)
