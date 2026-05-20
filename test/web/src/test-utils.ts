import { startMockServer, type MockServer, type CapturedRequest } from 'capacitor-braze-mock-server';

import { BrazeWeb } from '../../../src/web';

/**
 * Convenience for tests: boots a mock server, returns control to the
 * test. Caller's `afterEach` calls `mock.stop()`.
 *
 * Kept here (not in the mock-server package) because the lifecycle
 * hooks belong to vitest, which the mock-server package doesn't know
 * about. The mock-server stays a pure HTTP capture utility.
 */
export async function freshMockServer(): Promise<MockServer> {
  return startMockServer();
}

/**
 * Boots a fresh mock-server, scripts the FIRST `/api/v3/data/` POST
 * response with a server-config block that enables Feature Flags and
 * Content Cards (with `refresh_rate_limit: 0` so the SDK lets refreshes
 * fire immediately), constructs a fresh `BrazeWeb`, and calls `initialize()`.
 *
 * Why this helper exists: the Braze Web SDK reads its server config from
 * the response to the FIRST data POST during initialize(). Without that
 * config, `refreshFeatureFlags` short-circuits (returns false from its
 * `yo()` gate because `Ro()` returns null). The shared-plugin `beforeAll`
 * pattern used by most test files initializes before any test can script
 * that initial response. Tests that need populated FF/CC caches use this
 * helper instead and pay the per-test init cost (still ~150ms).
 *
 * The script for the initial data POST is `oneShot: true`, so subsequent
 * data POSTs in the same test go through the catch-all and won't accidentally
 * re-apply the config (which would re-trigger config-change subscribers).
 * Tests then call `mock.respondTo()` themselves to script the FF/CC
 * refresh response, and the config we injected here is what lets
 * `refreshFeatureFlags` / `requestContentCardsRefresh` actually fetch.
 *
 * Caller is responsible for `await plugin.wipeData()` + `await mock.stop()`
 * in the test's teardown.
 *
 * Wire format reference (verified against @braze/web-sdk 6.7.x):
 *   - server config envelope: `{ message: "success", config: { time, content_cards, feature_flags, ... } }`
 *   - content_cards: `{ enabled: boolean, refresh_rate_limit?: number }`
 *   - feature_flags: `{ enabled: boolean, refresh_rate_limit: number }`
 *   - time: number, must be > 0 for the config to be applied (current starts at 0)
 */
export interface FreshPluginWithConfig {
  mock: MockServer;
  plugin: BrazeWeb;
}

export async function freshPluginWithConfig(): Promise<FreshPluginWithConfig> {
  const mock = await freshMockServer();
  mock.respondTo({
    pathPattern: /\/api\/v3\/data\/?$/,
    method: 'POST', // CORS preflight OPTIONS would otherwise consume the oneShot
    body: {
      message: 'success',
      config: {
        time: Math.floor(Date.now() / 1000),
        feature_flags: { enabled: true, refresh_rate_limit: 0 },
        content_cards: { enabled: true, refresh_rate_limit: 0 },
      },
    },
    oneShot: true,
  });

  const plugin = new BrazeWeb();
  await plugin.initialize({
    apiKey: 'test-public-sdk-key',
    endpoint: mock.baseUrl,
    allowInsecureEndpoint: true,
  });

  return { mock, plugin };
}

/**
 * Polls until at least one captured request matches `predicate`, or
 * the timeout fires. Braze's Web SDK queues events in memory + flushes
 * on its own cadence (overridable via `requestImmediateDataFlush`), so
 * even after we trigger a flush there can be a small async delay before
 * the HTTP POST lands on the mock.
 *
 * Returns the first matching request. Throws on timeout, with a
 * diagnostic dump of everything captured so the test author can see
 * what *did* come in.
 */
export async function waitForCaptured(
  mock: MockServer,
  predicate: (req: CapturedRequest) => boolean,
  options: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<CapturedRequest> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const intervalMs = options.intervalMs ?? 25;
  const label = options.label ?? 'matching request';
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const found = mock.captured.find(predicate);
    if (found) return found;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  const seen = mock.captured.map((r) => {
    const bodyStr = r.body === undefined ? '(no body)' : (JSON.stringify(r.body) ?? '(unstringifiable)');
    return `  ${r.method} ${r.path}\n    body: ${bodyStr.slice(0, 800)}`;
  });
  throw new Error(
    `waitForCaptured("${label}") timed out after ${timeoutMs}ms. Captured so far:\n` +
      (seen.length > 0 ? seen.join('\n') : '  (nothing)'),
  );
}
