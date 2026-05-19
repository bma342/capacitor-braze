#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Capacitor plugin registration macro.
// Exposes `Braze.echo` and `Braze.initialize` to JavaScript.
CAP_PLUGIN(BrazePlugin, "Braze",
    CAP_PLUGIN_METHOD(echo, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(initialize, CAPPluginReturnPromise);
)
