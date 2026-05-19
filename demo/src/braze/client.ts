import { Braze } from 'capacitor-braze';

/**
 * One-time Braze initialization for the demo app. Call once at app boot
 * (see `src/main.tsx`).
 *
 * Keys come from Vite environment variables so the demo template doesn't
 * ship anyone's real Braze keys. The consumer creates `.env.local` (see
 * README) — production-ready apps would source these from their
 * remote-config / secret-manager equivalent.
 *
 * The demo intentionally enables SDK Authentication only when a backend
 * signing endpoint is configured; without it, `changeUser` works but
 * is spoofable. See SECURITY.md §2 in the plugin docs.
 */
export async function initBraze(): Promise<void> {
  const apiKey = import.meta.env.VITE_BRAZE_API_KEY;
  const endpoint = import.meta.env.VITE_BRAZE_ENDPOINT;

  if (!apiKey || !endpoint) {
    // Render the app without Braze rather than crashing — the demo is
    // still useful for browsing the flow without a live Braze project.
    console.warn(
      '[demo] VITE_BRAZE_API_KEY or VITE_BRAZE_ENDPOINT not set. ' +
        'Braze events will no-op. See demo/README.md for setup.',
    );
    return;
  }

  await Braze.initialize({
    apiKey,
    endpoint,
    // Off for the demo to keep the dev console clean. Real consumers
    // leave it false in production per C06.
    enableLogging: false,
    enableSdkAuthentication: false,
  });
}
