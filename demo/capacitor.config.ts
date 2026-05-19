import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config for the capacitor-braze demo app.
 *
 * App identifier intentionally uses the `dev.bma342.demo.braze` namespace
 * so the consumer can clone, change the `appId` + `appName`, and ship
 * their own Capacitor app derived from this template. Nothing here is
 * Aromo-coupled — the demo is a standalone reference implementation.
 */
const config: CapacitorConfig = {
  appId: 'dev.bma342.demo.braze',
  appName: 'Capacitor Braze Demo',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
