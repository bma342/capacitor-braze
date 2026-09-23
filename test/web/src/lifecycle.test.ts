import type { MockServer } from 'capacitor-braze-mock-server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BrazeWeb } from '../../../src/web';

import {
  freshMockServer,
  freshPluginWithConfig,
  freshPluginWithTriggers,
  teardownPlugin,
  waitForCaptured,
  waitUntil,
} from './test-utils';

/**
 * The four subscription GUIDs the plugin retains, in declaration order.
 * They're `private` on the class, which TypeScript erases at runtime — the
 * cast is the standard escape hatch this suite already uses for the
 * serializers, and these handles are the only observable evidence that the
 * plugin re-subscribed rather than merely re-initialized.
 */
function subscriptionGuids(plugin: BrazeWeb): (string | null)[] {
  const internals = plugin as unknown as Record<string, string | null>;
  return [
    internals.featureFlagsSubscription ?? null,
    internals.contentCardsSubscription ?? null,
    internals.inAppMessageSubscription ?? null,
    internals.sdkAuthErrorSubscription ?? null,
  ];
}

/**
 * Privacy / lifecycle quartet behavioral tests: wipeData, disableSDK,
 * enableSDK, isDisabled, plus requestImmediateDataFlush.
 *
 * The state contract these pin (A1-05) is subtle and was wrong before:
 * the Braze Web SDK's `disableSDK()` and `enableSDK()` both end in
 * `destroy()`, which marks the SDK uninitialized and removes every
 * subscription. The plugin therefore clears its own `initialized` state in
 * both, so a guarded method after either call fails with the honest
 * init-required error instead of the SDK's internal "getUser() returned
 * null — file an issue" path. The SDK's own documentation says the same
 * thing: "You must call `initialize` after calling this method."
 *
 * Per-test lifecycle (`freshPluginWithConfig`) because these tests destroy
 * and rebuild the SDK singleton.
 */
describe('privacy / lifecycle (web bridge → @braze/web-sdk)', () => {
  let mock: MockServer;
  let plugin: BrazeWeb;

  beforeEach(async () => {
    ({ mock, plugin } = await freshPluginWithConfig());
  });

  afterEach(async () => {
    await teardownPlugin(plugin, mock);
  });

  /**
   * Re-runs `initialize` the way a consuming app would, with a fresh
   * server-config response staged first.
   *
   * The `+ 600` on `time` is load-bearing: the Web SDK only applies a
   * server config whose `time` is strictly greater than the one it has
   * stored, and the config this session already stored carries the current
   * second. Without the bump the config is ignored and feature-flag
   * refreshes stay gated off, which looks exactly like a dead listener.
   */
  async function reinitialize(): Promise<void> {
    mock.respondTo({
      pathPattern: /\/api\/v3\/data\/?$/,
      method: 'POST',
      body: {
        message: 'success',
        config: {
          time: Math.floor(Date.now() / 1000) + 600,
          feature_flags: { enabled: true, refresh_rate_limit: 0 },
          content_cards: { enabled: true, refresh_rate_limit: 0 },
        },
      },
      oneShot: true,
    });
    await plugin.initialize({
      apiKey: 'test-public-sdk-key',
      endpoint: mock.baseUrl,
      allowInsecureEndpoint: true,
    });
    await new Promise((r) => setTimeout(r, 200));
  }

  it('isDisabled returns false on a freshly initialized SDK', async () => {
    const { disabled } = await plugin.isDisabled();
    expect(disabled).toBe(false);
  });

  it('disableSDK -> isDisabled returns true', async () => {
    await plugin.disableSDK();
    const { disabled } = await plugin.isDisabled();
    expect(disabled).toBe(true);
  });

  it('enableSDK after disableSDK -> isDisabled returns false', async () => {
    await plugin.disableSDK();
    await plugin.enableSDK();
    const { disabled } = await plugin.isDisabled();
    expect(disabled).toBe(false);
  });

  it('disableSDK clears initialized state — guarded methods reject until re-initialize', async () => {
    await plugin.disableSDK();
    await expect(plugin.logCustomEvent({ name: 'after_disable' })).rejects.toThrow(
      'Braze.initialize() must be called before any other Braze method.',
    );
  });

  it('enableSDK clears initialized state — guarded methods reject until re-initialize', async () => {
    await plugin.disableSDK();
    await plugin.enableSDK();
    await expect(plugin.logCustomEvent({ name: 'after_enable' })).rejects.toThrow(
      'Braze.initialize() must be called before any other Braze method.',
    );
  });

  /**
   * A1-03(b): the consent round-trip. `disableSDK` / `enableSDK` destroy the
   * SDK instance and with it every subscription. The plugin used to keep
   * boolean "already subscribed" guards that were never reset here, so the
   * `initialize` after re-consent skipped subscription setup entirely and
   * every event — feature flags, content cards, in-app messages, SDK-auth
   * errors — was dead for the rest of the page's life. Storing subscription
   * GUIDs and re-subscribing unconditionally is what makes this pass.
   *
   * Asserted structurally (the four retained GUIDs are fresh, non-null, and
   * none is a repeat of the pre-disable set) plus behaviourally (the SDK is
   * usable again and events reach the wire). A GUID-level assertion is what
   * distinguishes "re-subscribed" from "re-initialized but never
   * re-subscribed" — the two are indistinguishable from the outside until
   * the next backend-driven update, which is the reason the original bug
   * shipped.
   */
  it('listeners still fire after disable -> enable -> initialize (GDPR consent round-trip)', async () => {
    const callback = vi.fn();
    await plugin.addListener('featureFlagsUpdated', callback);
    const before = subscriptionGuids(plugin);
    expect(before.every((guid) => typeof guid === 'string')).toBe(true);

    // Baseline: the listener works before consent is revoked.
    expect(await refreshWithFlag('ff_before_consent')).toBe(1);

    await plugin.disableSDK();
    await plugin.enableSDK();

    // Between disable and re-init nothing is subscribed: the SDK destroyed
    // its instance and the plugin dropped its handles.
    expect(subscriptionGuids(plugin)).toEqual([null, null, null, null]);

    await reinitialize();

    const after = subscriptionGuids(plugin);
    expect(after.every((guid) => typeof guid === 'string' && guid.length > 0)).toBe(true);
    for (const guid of after) {
      expect(before).not.toContain(guid);
    }

    callback.mockClear();
    const calls = await refreshWithFlag('ff_after_consent');
    expect(calls, 'featureFlagsUpdated never fired after the consent round-trip').toBe(1);
    expect(callback.mock.calls.filter((call) => JSON.stringify(call).includes('ff_after_consent'))).toHaveLength(1);

    // …and the SDK is usable for ordinary calls again.
    mock.clearCaptured();
    await plugin.logCustomEvent({ name: 'after_consent_restored_4A19' });
    await plugin.requestImmediateDataFlush();
    await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes('after_consent_restored_4A19'), {
      label: 'event logged after the consent round-trip',
    });

    async function refreshWithFlag(flagId: string): Promise<number> {
      mock.respondTo({
        pathPattern: /\/feature_flags\/sync$/,
        method: 'POST',
        body: { feature_flags: [{ id: flagId, enabled: true, properties: {}, fts: 'fts' }] },
      });
      await plugin.refreshFeatureFlags();
      await new Promise((r) => setTimeout(r, 300));
      return callback.mock.calls.filter((call) => JSON.stringify(call).includes(flagId)).length;
    }
  });

  /**
   * A1-03(a): the other direction. `wipeData` does NOT remove the SDK's
   * subscribers (the SDK's own `wipeData` only calls `clearData` on the
   * storage adapters and providers), so an `initialize` after a wipe used to
   * add a *second* subscription and every event fanned out to
   * `notifyListeners` twice — N times after N wipe/init cycles, which C05
   * lists under Forbidden. The plugin now cancels each retained GUID through
   * the SDK's `removeSubscription` before re-subscribing, so the SDK's
   * subscriber list cannot grow.
   */
  it('wipeData + initialize does not stack a duplicate subscription (one event, one notify)', async () => {
    const callback = vi.fn();
    await plugin.addListener('featureFlagsUpdated', callback);
    const before = subscriptionGuids(plugin);

    mock.respondTo({
      pathPattern: /\/feature_flags\/sync$/,
      method: 'POST',
      body: { feature_flags: [{ id: 'ff_before_wipe', enabled: true, properties: {}, fts: 'a' }] },
    });
    await plugin.refreshFeatureFlags();
    await new Promise((r) => setTimeout(r, 250));
    expect(callback.mock.calls.filter((call) => JSON.stringify(call).includes('ff_before_wipe'))).toHaveLength(1);

    await plugin.wipeData();
    expect(subscriptionGuids(plugin)).toEqual([null, null, null, null]);
    await reinitialize();

    const after = subscriptionGuids(plugin);
    for (const guid of after) {
      expect(before).not.toContain(guid);
    }

    callback.mockClear();
    mock.respondTo({
      pathPattern: /\/feature_flags\/sync$/,
      method: 'POST',
      body: { feature_flags: [{ id: 'ff_after_wipe', enabled: true, properties: {}, fts: 'b' }] },
    });
    await plugin.refreshFeatureFlags();
    await new Promise((r) => setTimeout(r, 300));

    // Exactly one — two would mean the post-wipe initialize added a second
    // SDK subscription on top of the surviving one.
    expect(callback.mock.calls.filter((call) => JSON.stringify(call).includes('ff_after_wipe'))).toHaveLength(1);
  });

  it('requestImmediateDataFlush resolves when nothing is queued', async () => {
    await expect(plugin.requestImmediateDataFlush()).resolves.toBeUndefined();
  });

  /**
   * A1-17: the promise now resolves on the SDK's completion callback, not on
   * dispatch — the method exists for callers who need the round trip to have
   * actually happened. Asserting the request has landed on the mock by the
   * time the promise settles is what distinguishes the two.
   */
  it('requestImmediateDataFlush resolves only after the queued event has reached the server', async () => {
    mock.clearCaptured();
    await plugin.logCustomEvent({ name: 'flush_await_probe_7C21' });
    await plugin.requestImmediateDataFlush();
    const match = mock.captured.find((r) => JSON.stringify(r.body ?? '').includes('flush_await_probe_7C21'));
    expect(match, 'the flush promise resolved before the event reached the mock').toBeTruthy();
  });

  /**
   * A1-17 / §26: the SDK reports a failed flush through the same callback
   * with `success === false`. An `auth_error` body is the cheapest way to
   * drive that path, and it is also the realistic one — a rejected SDK
   * Authentication signature is exactly when a consumer needs to know the
   * flush did not land.
   */
  it('requestImmediateDataFlush rejects when the SDK reports the flush failed', async () => {
    mock.respondTo({
      pathPattern: /\/api\/v3\/data\/?$/,
      method: 'POST',
      body: { auth_error: { error_code: 401, reason: 'signature expired' } },
      oneShot: false,
    });
    await plugin.logCustomEvent({ name: 'flush_failure_probe' });
    await expect(plugin.requestImmediateDataFlush()).rejects.toThrow(
      'Braze.requestImmediateDataFlush: the Braze SDK reported the flush failed.',
    );
    await waitForCaptured(mock, (r) => JSON.stringify(r.body ?? '').includes('flush_failure_probe'), {
      label: 'the failed flush attempt',
    });
  });
});

/**
 * Re-`initialize` in a live page (the second of the two gaps the 2026-09
 * audit left open: "`contentCardsUpdated` not publishing after a second
 * `initialize` in the same page").
 *
 * It reproduces — but not unconditionally, and not for the reason the gap
 * note assumed. It is **not** a dead or stacked subscription: the A1-18
 * GUID teardown/re-subscribe works, and both tests below end with the
 * re-subscribed listener firing. It is a race against the Web SDK's
 * server-config memoization.
 *
 *  1. The plugin's re-init path used to destroy the SDK instance
 *     unconditionally. The destroy is what makes a workspace switch honest
 *     — the Web SDK ignores a second `initialize()` and would keep the
 *     first API key and base URL, so without it a consumer switching
 *     workspace at runtime would keep talking to the old one while the
 *     plugin reported success.
 *  2. `destroy()` drops the `ServerConfigManager`. The replacement built by
 *     the second `initialize` reads `ab.storage.serverConfig.k` **exactly
 *     once**, synchronously, during `initialize` itself
 *     (`server-config-manager.js` `Cd()` memoizes on first access and never
 *     re-reads), and the session manager's constructor forces that read.
 *  3. So everything depends on whether the first cycle's `/api/v3/data/`
 *     response — the one that writes the config to storage — has landed by
 *     then:
 *       - **landed** → the fresh manager reads a real config. Content cards
 *         and feature flags stay enabled; refreshes work. (test 1)
 *       - **still in flight** → the fresh manager memoizes
 *         `new ServerConfig()` defaults, where `content_cards.enabled` and
 *         `feature_flags.enabled` are both `false`. The response then lands
 *         on the *destroyed* manager, which writes it to storage that
 *         nothing will read again. (test 2)
 *  4. In the second case `requestContentCardsRefresh()` finds content cards
 *     disabled, sends no `/content_cards/sync` POST at all, and parks its
 *     work on the config-change subscription (`content-cards-provider.js`
 *     `lr()` early-returns via `ki()`). The promise still resolves; the
 *     listener simply never fires.
 *
 * It self-heals on the next `/api/v3/data/` round trip, which delivers a
 * config, fires the config-change subscribers, and drains the parked
 * refresh. Feature flags are gated identically. In-app messages and
 * `sdkAuthError` are not config-gated and are unaffected.
 *
 * The window is small but real: `plugin.initialize()` resolves before its
 * own first data response returns, so back-to-back
 * `await initialize(); await initialize();` lands inside it every time.
 *
 * **The fix** (`src/web.ts`): destroy only when an option the Web SDK fixes
 * at construction actually changed. A re-`initialize` with the same
 * configuration now keeps the instance — and with it the server config —
 * while still tearing down and re-creating every subscription, so listener
 * behaviour is identical on both paths. A changed API key or endpoint still
 * rebuilds, which the last test guards.
 *
 * Priming the fresh instance instead was tried first and cannot work:
 * `requestImmediateDataFlush()` short-circuits on an empty queue
 * (`request-controller.js` `Xd` returns early when `Dc()` reports nothing to
 * send), and on a re-initialize the session is already open, so
 * `openSession()` enqueues no session-start event. No public SDK call forces
 * a data POST in that state — which is why the old workaround had to log an
 * event first.
 *
 * Test 2 pins the mid-flight window open with a delayed mock response
 * instead of relying on timing, so it asserts the behaviour rather than
 * racing it.
 */
describe('a second initialize in the same page', () => {
  let mock: MockServer;
  let plugin: BrazeWeb;

  afterEach(async () => {
    await teardownPlugin(plugin, mock);
  });

  /** Scripted `/content_cards/sync` body with exactly one card. */
  function oneCardSync(now: number): unknown {
    return {
      cards: [
        {
          id: 'reinit-card',
          type: 'short_news',
          ca: now,
          ea: null,
          v: true,
          db: false,
          p: false,
          tp: 'short_news',
          tt: 'After re-init',
          ds: 'Published to the re-subscribed listener',
          i: 'https://cdn.example.com/card.png',
          u: 'https://example.com/card',
          e: {},
        },
      ],
      last_full_sync_at: now,
      full_sync: true,
    };
  }

  /**
   * Scripts the card sync. The method filter is load-bearing: without it
   * the CORS preflight `OPTIONS` consumes the script and the real POST
   * falls through to the catch-all, which answers `{message:"success"}`
   * with no `cards` key — and the provider publishes nothing.
   */
  function scriptCardSync(m: MockServer): void {
    m.respondTo({
      pathPattern: /\/content_cards\/sync$/,
      method: 'POST',
      oneShot: false,
      body: oneCardSync(Math.floor(Date.now() / 1000)),
    });
  }

  const countSyncs = (m: MockServer): number =>
    m.captured.filter((r) => r.method === 'POST' && r.path.includes('/content_cards/sync')).length;

  const reinitialize = (p: BrazeWeb, m: MockServer): Promise<void> =>
    p.initialize({ apiKey: 'test-public-sdk-key', endpoint: m.baseUrl, allowInsecureEndpoint: true });

  it('keeps contentCardsUpdated working when the first cycle has settled', async () => {
    // `freshPluginWithTriggers([])` scripts the data response with a
    // `oneShot: false` config, so later flushes keep carrying one.
    ({ mock, plugin } = await freshPluginWithTriggers([]));
    // Waiting for the session-open card sync proves the first cycle's data
    // response landed, which is the precondition that makes re-init safe.
    await waitUntil(() => countSyncs(mock) > 0, 'the first session-open content-card sync');

    await reinitialize(plugin, mock);

    const received = vi.fn();
    await plugin.addListener('contentCardsUpdated', received);
    scriptCardSync(mock);

    const syncsBefore = countSyncs(mock);
    await plugin.requestContentCardsRefresh();
    await waitUntil(() => received.mock.calls.length > 0, 'contentCardsUpdated after a settled re-initialize');

    expect(countSyncs(mock), 'the refresh should have reached the network').toBeGreaterThan(syncsBefore);
    expect(received.mock.calls[0]?.[0]).toMatchObject({
      cards: [
        {
          id: 'reinit-card',
          type: 'classic',
          title: 'After re-init',
          description: 'Published to the re-subscribed listener',
          url: 'https://example.com/card',
        },
      ],
    });
  });

  it('re-initializing mid-flight keeps the server config, so contentCardsUpdated still fires', async () => {
    mock = await freshMockServer();
    const config = {
      message: 'success',
      config: {
        time: Math.floor(Date.now() / 1000),
        messaging_session_timeout: 0,
        feature_flags: { enabled: true, refresh_rate_limit: 0 },
        content_cards: { enabled: true, refresh_rate_limit: 0 },
      },
    };
    // Two scripts, matched in registration order. The first holds the FIRST
    // data response open past the second `initialize`, which is what makes
    // this test exercise the mid-flight path rather than the settled one:
    // the config provably has not reached storage when the re-initialize
    // runs. Without the delay this is a genuine race and the test would be
    // a coin flip on a loaded CI box. It is `oneShot`, so the second script
    // (immediate, same body) answers every later POST.
    mock.respondTo({
      pathPattern: /\/api\/v3\/data\/?$/,
      method: 'POST',
      oneShot: true,
      delayMs: 120,
      body: config,
    });
    mock.respondTo({
      pathPattern: /\/api\/v3\/data\/?$/,
      method: 'POST',
      oneShot: false,
      body: config,
    });

    plugin = new BrazeWeb();
    await plugin.initialize({
      apiKey: 'test-public-sdk-key',
      endpoint: mock.baseUrl,
      allowInsecureEndpoint: true,
    });
    // Precondition: the first response is still held by the mock, so no
    // config has been stored and the session-open card sync has not run.
    // This is exactly the window that used to break the re-initialize.
    expect(countSyncs(mock), 'precondition: the first cycle has not synced yet').toBe(0);

    await reinitialize(plugin, mock);

    const received = vi.fn();
    await plugin.addListener('contentCardsUpdated', received);
    scriptCardSync(mock);

    // The refresh is issued while the config is still in flight, so it parks
    // — correctly. What matters is that the SDK instance holding the parked
    // work is the same one the response will reach: the plugin kept it
    // instead of destroying it, because nothing the SDK bakes in at
    // construction changed. When the held response lands, the provider
    // un-parks and the sync goes out on its own.
    //
    // The consumer does nothing here. Before the fix this needed an explicit
    // `logCustomEvent` + `requestImmediateDataFlush` to force a second data
    // round trip, and without that the listener never fired at all.
    await expect(plugin.requestContentCardsRefresh()).resolves.toBeUndefined();
    await waitUntil(() => received.mock.calls.length > 0, 'contentCardsUpdated after the re-initialize');

    expect(countSyncs(mock), 'the refresh reached the network without consumer intervention').toBeGreaterThan(0);
    expect(received.mock.calls[0]?.[0]).toMatchObject({
      cards: [{ id: 'reinit-card', title: 'After re-init' }],
    });
  });

  it('still rebuilds the SDK when the credentials change, so a workspace switch is honest', async () => {
    // The guard on the fix above. Keeping the SDK instance is only safe
    // while every option it bakes in at construction is unchanged — the Web
    // SDK ignores a second `initialize()` and keeps the first API key and
    // base URL, so if the fingerprint were too coarse a consumer switching
    // workspace would silently keep reporting to the old one.
    ({ mock, plugin } = await freshPluginWithTriggers([]));
    await waitUntil(() => countSyncs(mock) > 0, 'the first session-open content-card sync');

    mock.clearCaptured();
    await plugin.initialize({
      apiKey: 'second-workspace-key',
      endpoint: mock.baseUrl,
      allowInsecureEndpoint: true,
    });

    // Not "the first POST carries the new key": `destroy()` flushes whatever
    // the old instance still had queued, and that farewell request correctly
    // goes out under the OLD key. What must happen is that the new key then
    // appears at all — which it cannot if the SDK instance was kept.
    await waitForCaptured(
      mock,
      (r) =>
        r.method === 'POST' &&
        /\/api\/v3\/data\/?$/.test(r.path) &&
        (r.body as { api_key?: string } | undefined)?.api_key === 'second-workspace-key',
      { label: 'a data POST carrying the new API key' },
    );
  });

  it('replaces rather than stacks every subscription', async () => {
    // The A1-18 regression guard: if the second `initialize` had stacked a
    // subscription instead of replacing it, the single publish below would
    // reach the listener twice.
    ({ mock, plugin } = await freshPluginWithTriggers([]));
    // Let the first cycle settle completely — not just its sync *request*
    // leaving (`countSyncs`) but the response being processed and published.
    // Otherwise, on a slow run (coverage instrumentation, a loaded CI box),
    // that first response lands after the re-initialize, is published to the
    // new subscription, and is indistinguishable from a stacked publish.
    scriptCardSync(mock);
    const settled = vi.fn();
    await plugin.addListener('contentCardsUpdated', settled);
    await waitUntil(() => countSyncs(mock) > 0, 'the first session-open content-card sync');
    await waitUntil(() => settled.mock.calls.length > 0, "the first cycle's sync response published");
    await plugin.removeAllListeners();

    const guidsBefore = subscriptionGuids(plugin);
    await reinitialize(plugin, mock);
    const guidsAfter = subscriptionGuids(plugin);

    expect(guidsAfter.every((g) => typeof g === 'string' && g.length > 0)).toBe(true);
    expect(guidsAfter, 'a re-init must create new subscriptions, not reuse the destroyed ones').not.toEqual(
      guidsBefore,
    );

    const received = vi.fn();
    await plugin.addListener('contentCardsUpdated', received);

    await plugin.requestContentCardsRefresh();
    await waitUntil(() => received.mock.calls.length > 0, 'contentCardsUpdated');

    const callsAfterFirst = received.mock.calls.length;
    await new Promise((r) => setTimeout(r, 200));
    expect(received.mock.calls.length, 'no extra publishes from a stacked subscription').toBe(callsAfterFirst);
  });
});
