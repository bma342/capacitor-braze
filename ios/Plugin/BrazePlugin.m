#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Capacitor plugin registration macro. Each CAP_PLUGIN_METHOD entry maps a
// Swift `@objc` method on `BrazePlugin` to a JavaScript-callable plugin
// method exposed under the plugin name "Braze".
//
// Keep this list ordered by category to match BrazePlugin.swift:
//   Bridge sanity → Configuration → User identity → User attributes →
//   Custom events → Privacy/lifecycle
CAP_PLUGIN(BrazePlugin, "Braze",
    // Bridge sanity
    CAP_PLUGIN_METHOD(echo, CAPPluginReturnPromise);

    // Configuration
    CAP_PLUGIN_METHOD(initialize, CAPPluginReturnPromise);

    // User identity
    CAP_PLUGIN_METHOD(changeUser, CAPPluginReturnPromise);

    // User attributes (standard)
    CAP_PLUGIN_METHOD(setEmail, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setPhoneNumber, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setFirstName, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setLastName, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setLanguage, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setCountry, CAPPluginReturnPromise);

    // User attributes (custom)
    CAP_PLUGIN_METHOD(setCustomUserAttribute, CAPPluginReturnPromise);

    // Custom events
    CAP_PLUGIN_METHOD(logCustomEvent, CAPPluginReturnPromise);

    // Privacy / lifecycle
    CAP_PLUGIN_METHOD(wipeData, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(disableSDK, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(enableSDK, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(isDisabled, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(requestImmediateDataFlush, CAPPluginReturnPromise);
)
