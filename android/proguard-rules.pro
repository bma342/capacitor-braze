# ProGuard rules for the capacitor-braze plugin (build-time rules).
# Consumer-facing rules (applied to apps using this plugin) live in consumer-rules.pro.

# Keep the Braze SDK classes — minification can otherwise strip used members.
-keep class com.braze.** { *; }
-keep class com.appboy.** { *; }
-dontwarn com.braze.**
-dontwarn com.appboy.**
