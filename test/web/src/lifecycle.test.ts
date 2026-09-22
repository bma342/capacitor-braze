import type { MockServer } from 'capacitor-braze-mock-server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrazeWeb } from '../../../src/web';

import { freshPluginWithConfig, teardownPlugin, waitForCaptured } from './test-utils';

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
