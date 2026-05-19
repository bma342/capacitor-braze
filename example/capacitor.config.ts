import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor app config for the capacitor-braze example app.
 *
 * `webDir: 'dist'` is the output of `vite build`.
 * `cap sync` copies the dist + the plugin's native code into the iOS/Android
 * projects (added via `npx cap add ios` / `npx cap add android`).
 */
const config: CapacitorConfig = {
  appId: 'com.bma342.capacitorbraze.example',
  appName: 'capacitor-braze example',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
