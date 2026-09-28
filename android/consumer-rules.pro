# Consumer ProGuard rules — applied automatically when an app consumes this plugin.

# Capacitor resolves @CapacitorPlugin classes and @PluginMethod members
# reflectively, so R8 must not rename or strip them.
-keep class com.bma342.braze.** { *; }

# Braze's own AARs ship consumer rules (android-sdk-ui/proguard.txt,
# android-sdk-base/proguard.txt) that are inherited automatically. They
# deliberately use -keepnames so unused members can still be shrunk; do
# not duplicate or widen them here.
