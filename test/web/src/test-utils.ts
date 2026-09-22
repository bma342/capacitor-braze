import * as braze from '@braze/web-sdk';
import { startMockServer, type MockServer, type CapturedRequest } from 'capacitor-braze-mock-server';
import { expect } from 'vitest';

import type { BrazeInitializeOptions } from '../../../src/definitions';
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
 * Pass `initOverrides` to change how the plugin is initialized (e.g.
 * `{ enableSdkAuthentication: true }`); everything else stays.
 *
 * Caller is responsible for `await teardownPlugin(plugin, mock)` in the
 * test's teardown.
 *
 * Wire format reference (verified against @braze/web-sdk 6.13.0):
 *   - server config envelope: `{ message: "success", config: { time, content_cards, feature_flags, ... } }`
 *   - content_cards: `{ enabled: boolean, refresh_rate_limit?: number }`
 *   - feature_flags: `{ enabled: boolean, refresh_rate_limit: number }`
 *   - time: number, must be > 0 for the config to be applied (current starts at 0)
 */
export interface FreshPluginWithConfig {
  mock: MockServer;
  plugin: BrazeWeb;
}

export async function freshPluginWithConfig(
  initOverrides: Partial<BrazeInitializeOptions> = {},
): Promise<FreshPluginWithConfig> {
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
    ...initOverrides,
  });

  return { mock, plugin };
}

/**
 * A Braze trigger as it appears in the `triggers` array of an
 * `/api/v3/data/` response.
 *
 * Verified field-by-field against `@braze/web-sdk` 6.13.0's
 * `src/triggers/models/trigger.js` `fromJson` (every key below is read
 * there; nothing else is). Units are NOT uniform and the SDK does not
 * normalize them:
 *
 *   - `start_time` / `end_time` — unix **seconds** (`dateFromUnixTimestamp`)
 *   - `delay` / `re_eligibility` / `min_seconds_since_last_trigger` — **seconds**
 *   - `timeout` — **milliseconds**, defaulting to `1000 * (delay + 30)`
 *
 * `type` must be `'inapp'`; the SDK's other value, `'templated_iam'`, makes
 * the SDK issue a second request to `/template/` for the message body,
 * which is a different delivery path and not what these tests exercise.
 *
 * `re_eligibility: -1` is the SDK's "show once, ever" sentinel
 * (`Trigger.Tm`). Tests use it so a trigger cannot fire twice within one
 * test and inflate a call count.
 */
export interface MockTrigger {
  id: string;
  type: 'inapp';
  trigger_condition: MockTriggerCondition[];
  data: Record<string, unknown>;
  start_time?: number | null;
  end_time?: number | null;
  priority?: number;
  delay?: number;
  re_eligibility?: number;
  timeout?: number;
  min_seconds_since_last_trigger?: number;
}

/**
 * The condition shapes this suite uses, from `trigger-condition.js`'s
 * `fromJson` switch. `open` is the session-start condition and carries no
 * `data`; `custom_event` matches on `event_name`, and an absent
 * `event_name` matches *any* custom event.
 */
export type MockTriggerCondition = { type: 'open' } | { type: 'custom_event'; data: { event_name: string } };

/**
 * Builds a trigger with the SDK's gating switched off.
 *
 * Four separate gates sit between a delivered trigger and the
 * `subscribeToInAppMessage` callback; each default below disarms one:
 *
 *   - `min_seconds_since_last_trigger: 0` overrides the client-side
 *     `minimumIntervalBetweenTriggerActionsInSeconds` (default **30s**),
 *     which the plugin does not expose through `initialize`. Without this,
 *     the second trigger in a file is silently dropped with
 *     "Ignoring … because a trigger was displayed Ns ago."
 *   - `start_time` / `end_time` `null` — no display window to fall outside of.
 *   - `delay: 0` — fires synchronously rather than through a `setTimeout`.
 *   - `timeout: 600_000` — ten minutes, so the eligibility check
 *     (`now - triggerEventTime < timeout`) cannot expire mid-test.
 */
export function mockTrigger(
  id: string,
  condition: MockTriggerCondition,
  data: Record<string, unknown>,
  overrides: Partial<MockTrigger> = {},
): MockTrigger {
  return {
    id,
    type: 'inapp',
    trigger_condition: [condition],
    start_time: null,
    end_time: null,
    priority: 0,
    delay: 0,
    re_eligibility: -1,
    timeout: 600_000,
    min_seconds_since_last_trigger: 0,
    data,
    ...overrides,
  };
}

/**
 * {@link freshPluginWithConfig}, plus a `triggers` array on the scripted
 * `/api/v3/data/` response — i.e. real in-app-message delivery.
 *
 * How the delivery actually happens, since none of it is obvious:
 *
 *  1. The SDK only receives triggers when it *asks* for them. It sets
 *     `respond_with.triggers = true` on a data POST when a session-start
 *     event is in the outbound queue — which is exactly what the plugin's
 *     `initialize` produces, because it calls `openSession()` last. So the
 *     very first data POST of a fresh plugin carries the request, and this
 *     helper's scripted response is what answers it.
 *  2. `triggers-provider.q()` parses the array and immediately fires the
 *     `open` (session-start) condition. A trigger conditioned on `open`
 *     therefore fires off the back of `initialize` with no further action.
 *  3. A `custom_event` condition instead fires from `logCustomEvent`, which
 *     matches triggers **locally and synchronously** — no round trip. That
 *     makes custom-event triggers the deterministic choice for asserting a
 *     DTO, and `open` the one that proves the session-start path works.
 *
 * The script is `oneShot: false`: the SDK posts to `/api/v3/data/` more than
 * once per test (flushes, `requestImmediateDataFlush`), and a `oneShot`
 * script would leave later posts answering from the catch-all with no
 * `config`, re-arming the gates the config disarms. Re-delivering the same
 * `triggers` array is harmless — `re_eligibility: -1` means an
 * already-displayed trigger is not shown again.
 *
 * `messaging_session_timeout: 0` in the config makes every subsequent flush
 * also request triggers, which is what lets a test deliver a *second* wave
 * of triggers mid-test.
 */
export async function freshPluginWithTriggers(
  triggers: MockTrigger[],
  initOverrides: Partial<BrazeInitializeOptions> = {},
): Promise<FreshPluginWithConfig> {
  const mock = await freshMockServer();
  mock.respondTo({
    pathPattern: /\/api\/v3\/data\/?$/,
    method: 'POST',
    oneShot: false,
    body: {
      message: 'success',
      config: {
        time: Math.floor(Date.now() / 1000),
        messaging_session_timeout: 0,
        feature_flags: { enabled: true, refresh_rate_limit: 0 },
        content_cards: { enabled: true, refresh_rate_limit: 0 },
      },
      triggers,
    },
  });

  const plugin = new BrazeWeb();
  await plugin.initialize({
    apiKey: 'test-public-sdk-key',
    endpoint: mock.baseUrl,
    allowInsecureEndpoint: true,
    ...initOverrides,
  });

  return { mock, plugin };
}

/**
 * Teardown counterpart to {@link freshPluginWithConfig}.
 *
 * Order matters (L6-04 / A5-16). `wipeData()` clears storage but leaves the
 * SDK's flush/retry timer armed, so the old sequence (wipe, then stop the
 * server) left a live SDK firing XHRs at a port that had just been freed —
 * the ECONNREFUSED stack traces that flooded stderr, and, worse, a zombie
 * SDK that can land a stray request on another test file's freshly bound
 * mock. `braze.destroy()` is the SDK's own teardown: it clears the retry
 * timeout and sets the "stop rescheduling" flag. The macrotask yield then
 * lets any in-flight XHR settle before the listener closes.
 *
 * `destroy()` is called on the module singleton directly rather than
 * through the plugin because the plugin deliberately doesn't expose it —
 * it's an SDK lifecycle primitive, not part of the Braze plugin contract.
 */
export async function teardownPlugin(plugin: BrazeWeb, mock: MockServer): Promise<void> {
  // Read the list before teardown: `wipeData` / `enableSDK` below flush,
  // and a violation recorded by one of those requests belongs to this test
  // either way, but the assertion has to happen after the server has seen
  // everything this test caused. Captured here, asserted at the very end.
  try {
    await plugin.removeAllListeners();
  } catch {}
  // `disableSDK()` writes an opt-out cookie that jsdom keeps for the whole
  // file, and the Web SDK refuses to initialize while it is present
  // ("Ignoring all activity due to previous opt out"). Always clear it so a
  // test that disabled the SDK can't poison its siblings.
  try {
    await plugin.enableSDK();
  } catch {}
  try {
    await plugin.wipeData();
  } catch {}
  try {
    braze.destroy();
  } catch {}
  // One macrotask is enough for the SDK's synchronous teardown to settle;
  // the extra few milliseconds let an XHR that was already on the wire when
  // `destroy()` ran finish against a server that still exists.
  await new Promise((r) => setTimeout(r, 25));
  const violations = [...mock.violations];
  await mock.stop();
  assertNoRequestViolations(violations);
}

/**
 * Fails the current test if the mock recorded a malformed `/api/v3/data/`
 * POST (A5-18).
 *
 * Split out from {@link teardownPlugin} so the one test that deliberately
 * sends a malformed request can assert the detector fires without tripping
 * its own teardown.
 */
export function assertNoRequestViolations(violations: MockServer['violations']): void {
  if (violations.length === 0) return;
  const detail = violations.map((v) => `  ${v.method} ${v.path}\n    - ${v.reasons.join('\n    - ')}`).join('\n');
  expect.fail(`mock-server rejected ${violations.length} malformed /api/v3/data/ request(s):\n${detail}`);
}

/**
 * Polls until `predicate` is true, or the timeout fires.
 *
 * Used instead of a fixed `setTimeout` wherever the thing being waited for
 * is an SDK callback rather than an HTTP request: a fixed sleep is either
 * slower than it needs to be or flaky on a loaded CI box, and this is both
 * faster in the common case and more patient in the bad one.
 *
 * Throws with `label` on timeout, so a failure names what never happened.
 */
export async function waitUntil(
  predicate: () => boolean,
  label: string,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const intervalMs = options.intervalMs ?? 10;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitUntil("${label}") timed out after ${timeoutMs}ms.`);
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
