#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Capacitor plugin registration macro. Each CAP_PLUGIN_METHOD entry maps a
// Swift @objc method to a JavaScript-callable plugin method.
CAP_PLUGIN(BrazePlugin, "Braze",
    CAP_PLUGIN_METHOD(echo, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(initialize, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(changeUser, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(logCustomEvent, CAPPluginReturnPromise);
)
