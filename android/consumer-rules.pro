# Consumer ProGuard rules — applied automatically when an app consumes this plugin.
# Prevents consumer minification from stripping Braze SDK classes the plugin needs.

-keep class com.braze.** { *; }
-keep class com.appboy.** { *; }
-keep class com.bma342.braze.** { *; }
-dontwarn com.braze.**
-dontwarn com.appboy.**
